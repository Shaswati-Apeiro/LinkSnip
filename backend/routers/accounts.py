import os

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from database import get_session
from emailer import send_email
from models import User
from schemas import (
    SignupIn,
    LoginIn,
    TokenOut,
    UserOut,
    ForgotIn,
    ResetIn,
    VerifyIn,
    ResendVerifyIn,
)
from auth import (
    hash_password,
    verify_password,
    create_token,
    get_current_user,
    create_reset_token,
    verify_reset_token,
    create_email_token,
    verify_email_token,
    is_verified_or_whitelisted,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Public base of the frontend reset page. In Docker the browser reaches the
# frontend on 5174; override via FRONTEND_BASE in backend/.env if needed.
FRONTEND_BASE = os.environ.get("FRONTEND_BASE", "http://127.0.0.1:5174")


def _send_verification_email(user: User):
    token = create_email_token(user)
    link = f"{FRONTEND_BASE}/verify-email/{token}"
    send_email(
        user.email,
        "Verify your LinkSnip email",
        "<p>Thanks for signing up for LinkSnip.</p>"
        f'<p>Click to verify your email address (valid 24 hours): <a href="{link}">{link}</a></p>'
        "<p>If you didn't create a LinkSnip account, you can safely ignore this email.</p>",
    )


@router.post("/signup", response_model=TokenOut)
def signup(data: SignupIn, session: Session = Depends(get_session)):
    already = session.exec(select(User).where(User.email == data.email)).first()
    if already:
        raise HTTPException(400, "Email already registered")
    user = User(email=data.email, password_hash=hash_password(data.password))
    session.add(user)
    session.commit()
    session.refresh(user)
    _send_verification_email(user)
    session.add(user)
    session.commit()
    return TokenOut(access_token=create_token(user.id))


@router.post("/login", response_model=TokenOut)
def login(data: LoginIn, session: Session = Depends(get_session)):
    user = session.exec(select(User).where(User.email == data.email)).first()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(401, "Wrong email or password")
    if not is_verified_or_whitelisted(user):
        # Distinct status so the client can prompt "verify your email" + resend.
        raise HTTPException(403, "Email not verified. Check your inbox for a verification link.")
    return TokenOut(access_token=create_token(user.id))


@router.post("/forgot-password")
def forgot_password(data: ForgotIn, session: Session = Depends(get_session)):
    """Issue a single-use reset token. Always returns the same generic message so
    we never reveal whether an email is registered (anti-enumeration)."""
    user = session.exec(select(User).where(User.email == data.email)).first()
    if user:
        token = create_reset_token(user)
        session.add(user)
        session.commit()
        link = f"{FRONTEND_BASE}/reset/{token}"
        send_email(
            user.email,
            "Reset your LinkSnip password",
            "<p>We received a request to reset your LinkSnip password.</p>"
            f'<p>Click to set a new password (valid 30 minutes): <a href="{link}">{link}</a></p>'
            "<p>If you didn't request this, you can safely ignore this email.</p>",
        )
    return {"message": "If that email is registered, a password reset link has been sent."}


@router.post("/reset-password", response_model=TokenOut)
def reset_password(data: ResetIn, session: Session = Depends(get_session)):
    """Consume a valid, unexpired, unused reset token and set a new password.

    The raw token is never stored, only its hash, so we scan the (small) set of
    users with an outstanding token and match by hash per candidate.
    """
    candidates = session.exec(select(User).where(User.reset_token_hash.isnot(None))).all()
    user = next((u for u in candidates if verify_reset_token(u, data.token)), None)
    if not user:
        raise HTTPException(400, "Invalid or expired reset token")

    user.password_hash = hash_password(data.new_password)
    # Single-use: clear the token once it has been consumed.
    user.reset_token_hash = None
    user.reset_token_expires_at = None
    session.add(user)
    session.commit()
    return TokenOut(access_token=create_token(user.id))


@router.post("/verify-email", response_model=UserOut)
def verify_email(data: VerifyIn, session: Session = Depends(get_session)):
    """Consume a valid, unexpired, unused email-verification token and mark verified.

    The raw token is never stored, only its hash, so match by hash across the
    (small) set of users with an outstanding token.
    """
    candidates = session.exec(select(User).where(User.email_token_hash.isnot(None))).all()
    user = next((u for u in candidates if verify_email_token(u, data.token)), None)
    if not user:
        raise HTTPException(400, "Invalid or expired verification token")

    user.email_verified = True
    # Single-use: clear the token once consumed.
    user.email_token_hash = None
    user.email_token_expires_at = None
    session.add(user)
    session.commit()
    return UserOut(id=user.id, email=user.email, email_verified=True)


@router.post("/resend-verification")
def resend_verification(data: ResendVerifyIn, session: Session = Depends(get_session)):
    """Re-send a verification email. Generic message so we never reveal whether an
    email is registered (anti-enumeration)."""
    user = session.exec(select(User).where(User.email == data.email)).first()
    if user and not user.email_verified:
        _send_verification_email(user)
        session.add(user)
        session.commit()
    return {"message": "If that email needs verification, a new link has been sent."}


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return UserOut(id=user.id, email=user.email, email_verified=user.email_verified)
