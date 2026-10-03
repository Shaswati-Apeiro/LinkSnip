import hashlib
import logging
import os
import secrets
from datetime import datetime, timedelta
from typing import Optional

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from passlib.hash import pbkdf2_sha256
from sqlmodel import Session, select

from database import get_session
from models import User

logger = logging.getLogger("linksnip.auth")

# JWT signing key. Must never be a hardcoded secret — read it from the environment
# (see backend/.env.example). The placeholder below is only a development fallback so
# the app can boot without config; it must be overridden in any real deployment.
SECRET_KEY = os.environ.get("JWT_SECRET_KEY") or os.environ.get("SECRET_KEY")
if not SECRET_KEY:
    SECRET_KEY = "dev-only-insecure-key-change-me"
    logger.warning(
        "JWT_SECRET_KEY is not set. Using an insecure development fallback. "
        "Set JWT_SECRET_KEY in your environment before deploying."
    )
ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 24

# Password-reset token lifetime.
RESET_TOKEN_MINUTES = 30
# Email-verification token lifetime.
EMAIL_TOKEN_HOURS = 24

# Emails exempt from the email-verification gate (comma-separated in .env). Lets a
# controlled/dev account authenticate without verifying. Empty (default) = no one.
ALLOW_UNVERIFIED_EMAILS = {
    e.strip().lower()
    for e in os.environ.get("ALLOW_UNVERIFIED_EMAILS", "").split(",")
    if e.strip()
}


def is_verified_or_whitelisted(user: User) -> bool:
    """Whether `user` may authenticate: verified, or explicitly whitelisted."""
    if user.email_verified:
        return True
    return user.email.lower() in ALLOW_UNVERIFIED_EMAILS


def hash_password(plain: str) -> str:
    return pbkdf2_sha256.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return pbkdf2_sha256.verify(plain, hashed)


def _hash_reset_token(token: str) -> str:
    # Only a SHA-256 digest of the token is ever persisted; the raw token is
    # never stored or logged.
    return hashlib.sha256(token.encode()).hexdigest()


def create_reset_token(user: User) -> str:
    """Generate a single-use reset token and persist its hash + expiry on the user.

    Setting field values directly (not via update) so the router can pass the
    `session` it owns; callers must commit + refresh as needed.
    """
    token = secrets.token_urlsafe(32)
    user.reset_token_hash = _hash_reset_token(token)
    user.reset_token_expires_at = datetime.utcnow() + timedelta(minutes=RESET_TOKEN_MINUTES)
    return token


def verify_reset_token(user: User, token: str) -> bool:
    """True only if the token matches and has not expired."""
    if not user.reset_token_hash:
        return False
    if datetime.utcnow() > (user.reset_token_expires_at or datetime.min):
        return False
    return secrets.compare_digest(user.reset_token_hash, _hash_reset_token(token))


def create_email_token(user: User) -> str:
    """Generate a single-use email-verification token and persist its hash + expiry."""
    token = secrets.token_urlsafe(32)
    user.email_token_hash = _hash_reset_token(token)
    user.email_token_expires_at = datetime.utcnow() + timedelta(hours=EMAIL_TOKEN_HOURS)
    return token


def verify_email_token(user: User, token: str) -> bool:
    """True only if the email-verification token matches and has not expired."""
    if not user.email_token_hash:
        return False
    if datetime.utcnow() > (user.email_token_expires_at or datetime.min):
        return False
    return secrets.compare_digest(user.email_token_hash, _hash_reset_token(token))


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


_required = HTTPBearer(auto_error=True)
_optional = HTTPBearer(auto_error=False)


def get_current_user(
    cred: HTTPAuthorizationCredentials = Depends(_required),
    session: Session = Depends(get_session),
) -> User:
    user = _user_from_token(cred.credentials, session)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    if not is_verified_or_whitelisted(user):
        # Central enforcement: an unverified (non-whitelisted) user cannot reach
        # protected routes, even with a valid JWT from any auth flow.
        raise HTTPException(
            status_code=403,
            detail="Email not verified. Check your inbox for a verification link.",
        )
    return user


def get_current_user_optional(
    cred: Optional[HTTPAuthorizationCredentials] = Depends(_optional),
    session: Session = Depends(get_session),
) -> Optional[User]:
    if not cred:
        return None
    return _user_from_token(cred.credentials, session)
