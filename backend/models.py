from datetime import datetime
from typing import Optional

from sqlmodel import SQLModel, Field


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(unique=True, index=True)
    password_hash: str
    created_at: datetime = Field(default_factory=datetime.utcnow)

    # Password reset: SHA-256 hash of a single-use, time-limited token (never the
    # raw token) plus its expiry. Cleared on successful reset or expiry.
    reset_token_hash: Optional[str] = None
    reset_token_expires_at: Optional[datetime] = None

    # Email verification. `email_verified` gates re-login (unless the email is in
    # the ALLOW_UNVERIFIED_EMAILS whitelist). The raw verb token is never stored,
    # only its SHA-256 hash + expiry (same pattern as the reset token).
    email_verified: bool = False
    email_token_hash: Optional[str] = None
    email_token_expires_at: Optional[datetime] = None


class Link(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    short_code: Optional[str] = Field(default=None, unique=True, index=True)
    original_url: str
    user_id: Optional[int] = Field(default=None, foreign_key="user.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)

    expires_at: Optional[datetime] = None
    click_limit: Optional[int] = None

    tag: Optional[str] = None
    # Multiple tags, JSON-encoded list of strings. `tag` is kept for backwards
    # compatibility with links created before this feature (see read_tags).
    tags: Optional[str] = None
    folder: Optional[str] = None
    has_qr: bool = False

    # Optional access password, stored ONLY as a pbkdf2_sha256 hash (never plaintext).
    password_hash: Optional[str] = None

    is_active: bool = True


class Click(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    link_id: int = Field(foreign_key="link.id", index=True)
    ts: datetime = Field(default_factory=datetime.utcnow)
    referrer: Optional[str] = None
    device: Optional[str] = None
    browser: Optional[str] = None
    country_code: Optional[str] = None
    country: Optional[str] = None
