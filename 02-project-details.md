# LinkSnip — Project Details

A minimal full-stack **URL shortener**: turn long URLs into short, shareable links,
with click analytics, custom aliases, and link expiration.

---

## Problem & users

Long URLs are hard to share (social media, print, verbally), and people can't see how
their shared links perform. LinkSnip shortens URLs and tracks clicks.

- **Casual users** — share short links on social / messaging.
- **Marketers** — track campaign performance via click data.

---

## Features

**Core (built):**
1. Shorten any URL — anonymous (no login) or logged-in.
2. Redirect via short link + log each click.
3. Accounts — signup / login (JWT).
4. Dashboard — list your links.
5. Custom alias (e.g. `lnk.to/my-sale`).
6. Per-link analytics — clicks over time, top referrers, device breakdown.
7. Edit destination URL (short link stays the same).
8. Delete link.

**Optional (built):** link expiration — by date OR click limit.

**Skipped on purpose (production talking points):** Redis cache, async click queue,
GeoIP lookup, malware/safe-browsing check, rate limiting, bulk CSV upload, QR code, tags.

---

## Tech stack

| Layer | Choice | Why |
|-------|--------|-----|
| Frontend | React (Vite) | Fast, light; simple pages |
| Backend | FastAPI | Endpoints + validation + free Swagger docs at `/docs` |
| Server | uvicorn | Runs the FastAPI app (`uvicorn main:app --reload`) |
| Database | SQLite | One file, zero setup |
| ORM | SQLModel | One class = DB table + data shape (bundles SQLAlchemy) |
| Auth (hash) | passlib (`pbkdf2_sha256`) | Password hashing, no `bcrypt` C dependency |
| Auth (token) | pyjwt | Create/verify JWT login tokens |

Dependencies (`requirements.txt`): `fastapi`, `uvicorn[standard]`, `sqlmodel`, `passlib`, `pyjwt`.
(`sqlalchemy` is installed automatically by `sqlmodel`; `bcrypt` not needed because we use pbkdf2.)

---

## Architecture

Three layers. React runs in the browser and only talks to FastAPI. FastAPI is the only
thing that touches SQLite.

```
[ React (browser) ]  ──HTTP/JSON──►  [ FastAPI ]  ──►  [ SQLite ]
```

Two request paths:
- `/api/...` → JSON API for the dashboard (auth, links, analytics).
- `/{code}` → public redirect that logs a click, then 302s to the real URL.

**The redirect is a backend route, not a screen.** Analytics is just queries over the
`Click` table (count, group by date / referrer / device).

---

## Data model (3 tables)

- **User** — `id`, `email` (unique), `password_hash`, `created_at`.
- **Link** — `id`, `short_code` (unique), `original_url`, `user_id` (nullable → anonymous),
  `created_at`, `expires_at` (nullable), `click_limit` (nullable), `is_active`.
- **Click** — `id`, `link_id` (FK), `ts`, `referrer`, `device`, `browser`.

Short code = base62 of the row's auto-increment `id` (unique automatically).

---

## API endpoints (9)

| Method | Path              | Purpose                    | Auth     |
|--------|-------------------|----------------------------|----------|
| POST   | /api/auth/signup  | Create account → JWT       | no       |
| POST   | /api/auth/login   | Log in → JWT               | no       |
| GET    | /api/auth/me      | Current logged-in user     | yes      |
| POST   | /api/shorten      | Create a short link        | optional |
| GET    | /api/links        | List your links            | yes      |
| GET    | /api/links/{id}   | One link + its analytics   | yes      |
| PATCH  | /api/links/{id}   | Edit link (partial)        | yes      |
| DELETE | /api/links/{id}   | Delete link                | yes      |
| GET    | /{code}           | Redirect + log the click   | no       |

`GET /{code}` is a catch-all → must be the **last** route registered.

---

## Folder structure

```
linksnip/
├── backend/
│   ├── main.py            # app setup + include routers (~20 lines)
│   ├── database.py        # engine + session + init_db
│   ├── models.py          # DB tables: User, Link, Click
│   ├── schemas.py         # API request/response shapes
│   ├── auth.py            # password hash + JWT + current-user deps
│   ├── shortcode.py       # base62 code generator
│   ├── routers/
│   │   ├── __init__.py    # empty (makes it a package)
│   │   ├── accounts.py    # signup, login, me
│   │   └── links.py       # shorten, list, analytics, patch, delete, redirect
│   └── requirements.txt
└── frontend/              # (to build)
    ├── index.html, package.json, vite.config.js
    └── src/
        ├── main.jsx, App.jsx, api.js, index.css
        └── pages/ Home.jsx, Auth.jsx, Dashboard.jsx, LinkDetail.jsx
```

---

## Run the backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

- App: http://127.0.0.1:8000
- Swagger docs (test APIs here): http://127.0.0.1:8000/docs

**Test order in Swagger:** signup → copy `access_token` → click **Authorize** and paste it →
then try `me`, `shorten`, `links`, analytics, patch, delete. Test the redirect by opening
`http://127.0.0.1:8000/<code>` in a browser tab.

---

## Interview talking points

- models vs schemas separation (security + computed fields).
- base62 short code from auto-increment id (collision-free).
- 302 vs 301 (301 is cacheable → loses clicks; 302 counts every click).
- PATCH vs PUT (partial update, doesn't wipe other fields).
- Analytics = grouped queries over the Click table, not a separate system.
- Scaling story (not built, but explain): Redis cache in front of redirects,
  async queue for click writes, separate analytics store, GeoIP for country.
