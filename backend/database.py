import os

from sqlalchemy import inspect, text
from sqlmodel import SQLModel, create_engine, Session

# Configurable so Docker can persist the DB on a dedicated volume path;
# defaults to the local file for non-container runs.
DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///linksnip.db")

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})


def init_db() -> None:
    SQLModel.metadata.create_all(engine)
    _ensure_columns()


def _ensure_columns() -> None:
    insp = inspect(engine)

    user_cols = {c["name"] for c in insp.get_columns("user")}
    if "reset_token_hash" not in user_cols:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE user ADD COLUMN reset_token_hash VARCHAR"))
    if "reset_token_expires_at" not in user_cols:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE user ADD COLUMN reset_token_expires_at DATETIME"))
    if "email_verified" not in user_cols:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE user ADD COLUMN email_verified BOOLEAN DEFAULT 0"))
    if "email_token_hash" not in user_cols:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE user ADD COLUMN email_token_hash VARCHAR"))
    if "email_token_expires_at" not in user_cols:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE user ADD COLUMN email_token_expires_at DATETIME"))

    link_cols = {c["name"] for c in insp.get_columns("link")}
    if "tag" not in link_cols:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE link ADD COLUMN tag VARCHAR"))
    if "tags" not in link_cols:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE link ADD COLUMN tags VARCHAR"))
    if "folder" not in link_cols:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE link ADD COLUMN folder VARCHAR"))
    if "has_qr" not in link_cols:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE link ADD COLUMN has_qr BOOLEAN DEFAULT 0"))
    if "password_hash" not in link_cols:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE link ADD COLUMN password_hash VARCHAR"))

    click_cols = {c["name"] for c in insp.get_columns("click")}
    for col in ("country_code", "country"):
        if col not in click_cols:
            with engine.begin() as conn:
                conn.execute(text(f"ALTER TABLE click ADD COLUMN {col} VARCHAR"))


def get_session():
    with Session(engine) as session:
        yield session
