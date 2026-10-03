# LinkSnip — Backend Files Explained (with code)

Every backend file, in the order it makes sense to read: from the foundation (database)
up to the app entry point. Each section = what the file does + its full code.

---

## 1. `database.py`

**Job:** connect to SQLite, hand out a DB session per request, and create the tables.

- `engine` = the connection to the SQLite file `linksnip.db`.
- `init_db()` creates all tables defined in `models.py` (called once on startup).
- `get_session()` gives each request a fresh session that closes automatically.

```python
from sqlmodel import SQLModel, create_engine, Session

# SQLite = ek hi file, koi server setup nahi.
DATABASE_URL = "sqlite:///linksnip.db"

# check_same_thread=False: FastAPI multiple threads se connection use kar sake.
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})


def init_db() -> None:
    # models.py mein defined saari tables SQLModel.metadata mein register ho jaati hain,
    # ye unhe SQLite file mein bana deta hai (agar pehle se na hon).
    SQLModel.metadata.create_all(engine)


def get_session():
    # Har request ke liye ek fresh session; kaam ke baad apne aap band.
    with Session(engine) as session:
        yield session
```

---

## 2. `models.py`

**Job:** define the 3 database tables. With SQLModel, one class is both the DB table and
the Python object.

- `User` — accounts. `password_hash` (never the plain password).
- `Link` — the short links. `user_id` is nullable so anonymous links have no owner.
  `expires_at` + `click_limit` power the expiration feature. `short_code` starts empty
  when no alias is given (filled from the id afterwards).
- `Click` — one row per click; the analytics comes from these rows.

```python
from datetime import datetime
from typing import Optional

from sqlmodel import SQLModel, Field


# SQLModel ka kamaal: ye ek hi class DB table BHI hai aur data-shape (schema) BHI.
# Isliye har table sirf ek baar likhni padti hai.


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(unique=True, index=True)
    password_hash: str
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Link(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    # short_code shuru mein khaali reh sakta hai: bina alias wale link ka code
    # id ban jaane ke baad usi id se banate hain (shortcode.encode).
    short_code: Optional[str] = Field(default=None, unique=True, index=True)
    original_url: str
    # user_id nullable: anonymous link ka koi maalik nahi hota.
    user_id: Optional[int] = Field(default=None, foreign_key="user.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)

    # --- expiration wale do fields ---
    expires_at: Optional[datetime] = None   # is date ke baad link band
    click_limit: Optional[int] = None       # itne click ke baad link band

    is_active: bool = True                   # manual disable/archive ke liye


class Click(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    link_id: int = Field(foreign_key="link.id", index=True)
    ts: datetime = Field(default_factory=datetime.utcnow)
    # ye teeno request ke saath aayi info se bharte hain:
    referrer: Optional[str] = None   # Referer header
    device: Optional[str] = None     # User-Agent se
    browser: Optional[str] = None    # User-Agent se
```

---

## 3. `schemas.py`

**Job:** define the API contract — what the API accepts and returns. Kept separate from
`models.py` so we control what goes out: e.g. `UserOut` has no `password_hash`, and
`LinkOut` adds computed fields (`short_url`, `click_count`) that aren't columns.

```python
from datetime import datetime
from typing import Optional

from pydantic import BaseModel


# ---- ye file API ka "contract" hai: kya andar aata hai, kya bahar jaata hai.
# models.py (DB tables) se alag isliye taaki hum control kar sakein ki
# bahar KYA dikhana hai (e.g. password_hash kabhi bahar nahi jaata).


# ---------- auth ----------

class SignupIn(BaseModel):
    email: str
    password: str


class LoginIn(BaseModel):
    email: str
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: int
    email: str


# ---------- links ----------

class ShortenIn(BaseModel):
    url: str
    alias: Optional[str] = None
    expires_at: Optional[datetime] = None
    click_limit: Optional[int] = None


class LinkUpdate(BaseModel):
    # sab optional -> PATCH: sirf bheje hue fields update honge
    original_url: Optional[str] = None
    alias: Optional[str] = None
    expires_at: Optional[datetime] = None
    click_limit: Optional[int] = None


class LinkOut(BaseModel):
    id: int
    short_code: str
    short_url: str            # table mein nahi -> base_url + code se banta hai
    original_url: str
    created_at: datetime
    expires_at: Optional[datetime] = None
    click_limit: Optional[int] = None
    click_count: int          # clicks ginke bharte hain


# ---------- analytics ----------

class CountItem(BaseModel):
    label: str
    count: int


class LinkAnalytics(BaseModel):
    link: LinkOut
    clicks_over_time: list[CountItem]   # date -> clicks
    top_referrers: list[CountItem]
    devices: list[CountItem]
```

---

## 4. `shortcode.py`

**Job:** turn a number (the link's auto-increment id) into a short base62 string. Because
each id is unique, each code is unique — no collision checking needed. The offset just
makes early codes 4+ chars instead of `1`, `2`, `3`.

```python
# base62 = 0-9 + a-z + A-Z. Ek number ko in 62 characters mein likhte hain,
# taaki wo chhota (short) ho jaaye. Kyunki har link ki id unique hoti hai,
# har code apne aap unique ban jaata hai -- koi collision check nahi chahiye.

ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
BASE = len(ALPHABET)

# OFFSET isliye taaki chhoti id (1, 2, 3...) bhi 4+ char ka code de,
# warna pehle link ka code sirf "1" hota. (aesthetic choice, zaroori nahi.)
OFFSET = 1_000_000


def encode(num: int) -> str:
    num += OFFSET
    chars = []
    while num > 0:
        num, rem = divmod(num, BASE)
        chars.append(ALPHABET[rem])
    return "".join(reversed(chars))
```

---

## 5. `auth.py`

**Job:** everything security. Hash/verify passwords (passlib pbkdf2), create/verify JWT
tokens, and provide two FastAPI dependencies:
- `get_current_user` — login required (401 if no/invalid token).
- `get_current_user_optional` — returns the user if logged in, else `None` (used by
  `shorten` so anonymous users can still create links).

```python
from datetime import datetime, timedelta
from typing import Optional

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from passlib.hash import pbkdf2_sha256
from sqlmodel import Session, select

from database import get_session
from models import User


# NOTE: production mein SECRET_KEY environment variable se aata hai, code mein nahi.
SECRET_KEY = "change-me-in-production"
ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 24


# ---------- password ----------
# pbkdf2_sha256 = pure-python, koi extra C library nahi (bina jhanjhat ke chalta hai).

def hash_password(plain: str) -> str:
    return pbkdf2_sha256.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return pbkdf2_sha256.verify(plain, hashed)


# ---------- JWT token ----------

def create_token(user_id: int) -> str:
    payload = {
        "sub": str(user_id),
        "exp": datetime.utcnow() + timedelta(hours=TOKEN_EXPIRE_HOURS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def _user_from_token(token: str, session: Session) -> Optional[User]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        return None
    return session.get(User, user_id)


# ---------- FastAPI dependencies ----------
# required: login zaroori hai (nahi to 401)
# optional: login ho to user do, warna None (anonymous shorten ke liye)

_required = HTTPBearer(auto_error=True)
_optional = HTTPBearer(auto_error=False)


def get_current_user(
    cred: HTTPAuthorizationCredentials = Depends(_required),
    session: Session = Depends(get_session),
) -> User:
    user = _user_from_token(cred.credentials, session)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return user


def get_current_user_optional(
    cred: Optional[HTTPAuthorizationCredentials] = Depends(_optional),
    session: Session = Depends(get_session),
) -> Optional[User]:
    if not cred:
        return None
    return _user_from_token(cred.credentials, session)
```

---

## 6. `routers/accounts.py`

**Job:** the auth endpoints. Uses `prefix="/api/auth"` so each route path is short.
- `signup` → create user (reject duplicate email) → return JWT.
- `login` → check email + password → return JWT.
- `me` → return the current user (proves the token works).

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from database import get_session
from models import User
from schemas import SignupIn, LoginIn, TokenOut, UserOut
from auth import hash_password, verify_password, create_token, get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/signup", response_model=TokenOut)
def signup(data: SignupIn, session: Session = Depends(get_session)):
    if session.exec(select(User).where(User.email == data.email)).first():
        raise HTTPException(400, "Email already registered")
    user = User(email=data.email, password_hash=hash_password(data.password))
    session.add(user)
    session.commit()
    session.refresh(user)
    return TokenOut(access_token=create_token(user.id))


@router.post("/login", response_model=TokenOut)
def login(data: LoginIn, session: Session = Depends(get_session)):
    user = session.exec(select(User).where(User.email == data.email)).first()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(401, "Wrong email or password")
    return TokenOut(access_token=create_token(user.id))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return UserOut(id=user.id, email=user.email)
```

---

## 7. `routers/links.py`

**Job:** all link operations + the public redirect. Helpers at the top:
- `count_clicks` — counts rows in `Click` for a link.
- `to_out` — builds a `LinkOut` (adds `short_url` and `click_count`).
- `owned` — fetches a link and 404s if it isn't the current user's.

Endpoints: `shorten` (optional auth), `my_links`, `analytics` (group-by queries),
`update` (PATCH — only sent fields), `delete`, and `redirect` (`/{code}` — logs the
click, then 302). The redirect is defined last because `/{code}` is a catch-all.

```python
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Request, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy import func
from sqlmodel import Session, select

from database import get_session
from models import User, Link, Click
from schemas import ShortenIn, LinkUpdate, LinkOut, CountItem, LinkAnalytics
from auth import get_current_user, get_current_user_optional
from shortcode import encode

router = APIRouter(tags=["links"])


# ---------- chhote helpers ----------

def count_clicks(session: Session, link_id: int) -> int:
    return session.exec(
        select(func.count(Click.id)).where(Click.link_id == link_id)
    ).one()


def to_out(request: Request, session: Session, link: Link) -> LinkOut:
    base = str(request.base_url).rstrip("/")
    return LinkOut(
        id=link.id,
        short_code=link.short_code,
        short_url=f"{base}/{link.short_code}",
        original_url=link.original_url,
        created_at=link.created_at,
        expires_at=link.expires_at,
        click_limit=link.click_limit,
        click_count=count_clicks(session, link.id),
    )


def owned(session: Session, link_id: int, user: User) -> Link:
    link = session.get(Link, link_id)
    if not link or link.user_id != user.id:
        raise HTTPException(404, "Link not found")
    return link


# ---------- link CRUD ----------

@router.post("/api/shorten", response_model=LinkOut)
def shorten(
    data: ShortenIn,
    request: Request,
    session: Session = Depends(get_session),
    user: Optional[User] = Depends(get_current_user_optional),
):
    if data.alias and session.exec(select(Link).where(Link.short_code == data.alias)).first():
        raise HTTPException(400, "Alias already taken")

    link = Link(
        original_url=data.url,
        short_code=data.alias,                    # alias ho to wahi, warna None
        expires_at=data.expires_at,
        click_limit=data.click_limit,
        user_id=user.id if user else None,        # logged-in ho to maalik set
    )
    session.add(link)
    session.commit()
    session.refresh(link)

    if not link.short_code:                       # alias nahi tha -> id se code
        link.short_code = encode(link.id)
        session.add(link)
        session.commit()
        session.refresh(link)

    return to_out(request, session, link)


@router.get("/api/links", response_model=list[LinkOut])
def my_links(
    request: Request,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    links = session.exec(
        select(Link).where(Link.user_id == user.id).order_by(Link.created_at.desc())
    ).all()
    return [to_out(request, session, l) for l in links]


@router.get("/api/links/{link_id}", response_model=LinkAnalytics)
def analytics(
    link_id: int,
    request: Request,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    link = owned(session, link_id, user)

    def group_by(column):
        rows = session.exec(
            select(column, func.count(Click.id))
            .where(Click.link_id == link.id)
            .group_by(column)
        ).all()
        return [CountItem(label=str(value or "unknown"), count=c) for value, c in rows]

    return LinkAnalytics(
        link=to_out(request, session, link),
        clicks_over_time=sorted(group_by(func.date(Click.ts)), key=lambda x: x.label),
        top_referrers=sorted(group_by(Click.referrer), key=lambda x: x.count, reverse=True),
        devices=group_by(Click.device),
    )


@router.patch("/api/links/{link_id}", response_model=LinkOut)
def update(
    link_id: int,
    payload: LinkUpdate,
    request: Request,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    link = owned(session, link_id, user)
    data = payload.model_dump(exclude_unset=True)   # sirf bheje hue fields

    alias = data.pop("alias", None)
    if alias and alias != link.short_code:
        if session.exec(select(Link).where(Link.short_code == alias)).first():
            raise HTTPException(400, "Alias already taken")
        link.short_code = alias

    for field, value in data.items():
        setattr(link, field, value)

    session.add(link)
    session.commit()
    session.refresh(link)
    return to_out(request, session, link)


@router.delete("/api/links/{link_id}")
def delete(
    link_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    session.delete(owned(session, link_id, user))
    session.commit()
    return {"deleted": True}


# ---------- public redirect (catch-all -> sabse aakhir mein) ----------

def parse_ua(ua: Optional[str]):
    ua = ua or ""
    device = "Mobile" if any(k in ua for k in ("Mobile", "Android", "iPhone")) else "Desktop"
    for name in ("Edg", "Chrome", "Firefox", "Safari"):
        if name in ua:
            return device, ("Edge" if name == "Edg" else name)
    return device, "Other"


@router.get("/{code}")
def redirect(code: str, request: Request, session: Session = Depends(get_session)):
    link = session.exec(select(Link).where(Link.short_code == code)).first()
    if not link or not link.is_active:
        raise HTTPException(404, "Link not found")

    expired = (
        (link.expires_at and datetime.utcnow() > link.expires_at)
        or (link.click_limit is not None and count_clicks(session, link.id) >= link.click_limit)
    )
    if expired:
        raise HTTPException(410, "Link expired")

    device, browser = parse_ua(request.headers.get("user-agent"))
    session.add(Click(
        link_id=link.id,
        referrer=request.headers.get("referer"),
        device=device,
        browser=browser,
    ))
    session.commit()

    return RedirectResponse(link.original_url, status_code=302)
```

---

## 8. `main.py`

**Job:** assemble the app. Create the FastAPI app, enable CORS (so the React dev server
can call it), create tables on startup, and include the two routers. That's all — the
routes themselves live in `routers/`. `links.router` is included last because it holds
the `/{code}` catch-all.

```python
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import init_db
from routers import accounts, links


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()          # app start hote hi tables bana do
    yield


app = FastAPI(title="LinkSnip", lifespan=lifespan)

# React (alag port) ko API call karne dene ke liye
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # dev only; production mein apna domain
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(accounts.router)
app.include_router(links.router)     # ismein /{code} redirect hai (isliye sabse baad)
```

---

## 9. `routers/__init__.py`

**Job:** empty file. Its only purpose is to make `routers/` a Python package so
`from routers import accounts, links` works. Create it with `touch routers/__init__.py`.

```python
# (empty)
```

---

## 10. `requirements.txt`

```
fastapi
uvicorn[standard]
sqlmodel
passlib
pyjwt
```

Note: `sqlalchemy` is not listed because `sqlmodel` installs it automatically, and
`bcrypt` is not needed because we hash with passlib's `pbkdf2_sha256`.
