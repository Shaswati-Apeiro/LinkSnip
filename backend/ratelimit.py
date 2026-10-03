"""Per-client-IP rate limiting (PRD §5.6: "Rate-limited to prevent abuse").

A minimal in-memory fixed-window limiter implemented as Starlette middleware using
only the existing FastAPI/Starlette stack (no extra dependency). It applies two
coherent tiers rather than arbitrary per-endpoint limits:

  * API tier  — every `/api/*` route (shorten, link CRUD, analytics fetch, bulk,
                auth/login/signup/reset/verify). This is where write/abuse traffic
                lives, so it gets the tighter cap.
  * redirect tier — public short-link surface (`/{code}` GET/POST + password
                pages). This is the core product (sharing + click analytics), so it
                gets a generous cap to avoid throttling legitimate use.

Limits are keyed by client IP (honoring X-Forwarded-For, matching the existing
`client_ip()` in routers/links.py). State is in-process; the app runs as a single
uvicorn worker, so in-memory buckets are sufficient. Configuration:

    RATE_LIMIT_API_LIMIT      requests per window for /api/*          (default 120)
    RATE_LIMIT_REDIRECT_LIMIT requests per window for short-links     (default 600)
    RATE_LIMIT_WINDOW_SECONDS window length                          (default 60)

When the limit is exceeded a 429 with a Retry-After header is returned; the request
is never forwarded to the route handler.
"""

import os
import time

from collections import defaultdict

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

WINDOW = int(os.environ.get("RATE_LIMIT_WINDOW_SECONDS", "60"))
API_LIMIT = int(os.environ.get("RATE_LIMIT_API_LIMIT", "120"))
REDIRECT_LIMIT = int(os.environ.get("RATE_LIMIT_REDIRECT_LIMIT", "600"))

# key -> list of request timestamps within the current window
_buckets: dict[str, list[float]] = defaultdict(list)


def client_ip_from_request(request) -> str | None:
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else None


def _tier_for(path: str) -> str:
    return "api" if path.startswith("/api/") else "redirect"


def _limit_for(tier: str) -> int:
    return API_LIMIT if tier == "api" else REDIRECT_LIMIT


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        ip = client_ip_from_request(request)
        # Unreachable client IP shouldn't drop traffic; treat the request as normal.
        if not ip:
            return await call_next(request)

        tier = _tier_for(request.url.path)
        limit = _limit_for(tier)
        key = f"{ip}:{tier}"

        now = time.time()
        window_start = now - WINDOW
        bucket = _buckets[key]

        # Drop timestamps that fell out of the window before counting.
        bucket[:] = [t for t in bucket if t > window_start]

        if len(bucket) >= limit:
            return JSONResponse(
                status_code=429,
                content={
                    "detail": "Too many requests. Please slow down and try again later."
                },
                headers={"Retry-After": str(WINDOW)},
            )

        bucket.append(now)
        return await call_next(request)