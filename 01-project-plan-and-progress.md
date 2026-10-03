# LinkSnip — Plan & Progress

_Snapshot of what was built. Status as of today._

---

## Where we are

| Phase | What | Status |
|-------|------|--------|
| 1 | Backend core — models, DB, shorten, redirect + click log | ✅ Done & tested |
| 2 | Auth — signup / login (JWT), protect create | ✅ Done & tested |
| 3 | Backend dashboard + analytics + edit + delete endpoints | ✅ Done & tested |
| — | **Backend fully built, tested via Swagger `/docs`** | ✅ |
| 4 | Frontend — React (Vite) pages: Home, Auth, Dashboard, LinkDetail | ⬜ Not started |
| 5 | Connect frontend ↔ backend, polish (copy button, expired page) | ✅ Done |

**Bottom line:** entire backend is complete and verified. Frontend is the next thing to build.

---

## Backend — done checklist

- [x] 3 tables: `User`, `Link`, `Click` (SQLModel + SQLite)
- [x] `POST /api/shorten` — anonymous + logged-in, custom alias, expiry fields
- [x] `GET /{code}` — 302 redirect + logs click (timestamp, referrer, device, browser)
- [x] Expiration — by date OR click limit (returns 410 when expired)
- [x] `POST /api/auth/signup`, `POST /api/auth/login` — returns JWT
- [x] `GET /api/auth/me` — current user
- [x] `GET /api/links` — my links with click count
- [x] `GET /api/links/{id}` — link + analytics (over-time, referrers, devices)
- [x] `PATCH /api/links/{id}` — partial edit (destination / alias / expiry)
- [x] `DELETE /api/links/{id}` — delete
- [x] Auth guards — 401 without token, 404 for links you don't own
- [x] Refactored: routes split into `routers/`, `main.py` slimmed to ~20 lines

---

## Frontend — planned (not built yet)

Pages to build (React + Vite):
- `Home.jsx` — public shorten page
- `Auth.jsx` — login / signup
- `Dashboard.jsx` — my links list + create form
- `LinkDetail.jsx` — analytics chart (Recharts) + edit + delete

Plus: `main.jsx` (entry), `App.jsx` (routes), `api.js` (fetch wrapper with JWT), `index.css`.

---

## Decisions made today (with the "why")

- **Scope:** 8 core features + link expiration. Dropped QR code and tags/folders to stay minimal.
- **Expiration over QR/tags:** more explainable in interview (real logic inside redirect), less code than tags (no extra table).
- **Tech:** React (Vite) + FastAPI + SQLite. No Redis/queue/Docker for MVP — those are "production" talking points.
- **SQLModel:** one class = DB table + data shape, so each table is written once.
- **models vs schemas (separate files):** models = what's stored (has `password_hash`); schemas = what the API exposes (hides `password_hash`, adds computed `short_url`/`click_count`).
- **Short code:** base62 of the row's auto-increment id → unique by design, no collision check.
- **302 not 301:** so every click reaches the server and gets counted (301 can be cached by the browser).
- **PATCH not PUT** for edit: partial update, so unspecified fields aren't wiped.
- **passlib (`pbkdf2_sha256`):** password hashing without needing the `bcrypt` C library.
- **`sqlalchemy` not listed in requirements:** it comes bundled with `sqlmodel`.
- **Routers split:** `routers/accounts.py` (auth) + `routers/links.py` (links + redirect); `main.py` just assembles the app.

---

## Next steps

1. Scaffold the Vite React app (`frontend/`).
2. Build the 4 pages + `api.js`.
3. Wire up to the backend (CORS is already enabled).
4. Manual end-to-end test in the browser.
5. Optional polish: QR code (near-free add-on). ✅ Nicer expired page — done: `GET /{code}` now returns a self-contained HTML status page (icon + brand, light/dark) instead of raw JSON for expired (410 — separate messages for expiry-date vs click-limit) and not-found (404); valid links still 302 + log a click.
