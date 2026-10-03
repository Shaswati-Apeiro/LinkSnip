from contextlib import asynccontextmanager

from dotenv import load_dotenv

# Load .env FIRST so backend modules that read env vars at import time
# (database.py DATABASE_URL, routers/links.py REDIRECT_STATUS / SAFE_BROWSING_API_KEY)
# observe the values set in backend/.env.
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import init_db
from routers import accounts, links
from ratelimit import RateLimitMiddleware


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="LinkSnip", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Per-client-IP rate limiting (PRD §5.6). Applied broadly so abuse is throttled
# without interfering with normal redirects/analytics (see ratelimit.py).
app.add_middleware(RateLimitMiddleware)

app.include_router(accounts.router)
app.include_router(links.router)
