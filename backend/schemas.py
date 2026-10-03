import re
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field, field_validator


class SignupIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: int
    email: str
    email_verified: bool = False


# Alias rules (PRD §5.1): 3–30 chars, alphanumeric + hyphens only.
_ALIAS_PATTERN = "^[A-Za-z0-9-]{3,30}$"
_ALIAS_ERROR = "Alias: 3\u201330 characters, letters, numbers & hyphens only."


def _alias_is_valid(v: Optional[str]) -> Optional[str]:
    if v is None:
        return v
    if re.fullmatch(_ALIAS_PATTERN, v) is None:
        raise ValueError(_ALIAS_ERROR)
    return v


class ShortenIn(BaseModel):
    url: str
    alias: Optional[str] = None
    expires_at: Optional[datetime] = None
    click_limit: Optional[int] = None
    tags: Optional[list[str]] = None
    folder: Optional[str] = None
    has_qr: bool = False
    password: Optional[str] = None

    _alias_ok = field_validator("alias")(_alias_is_valid)


class LinkUpdate(BaseModel):
    original_url: Optional[str] = None
    alias: Optional[str] = None
    expires_at: Optional[datetime] = None
    click_limit: Optional[int] = None
    tags: Optional[list[str]] = None
    folder: Optional[str] = None
    has_qr: Optional[bool] = None
    password: Optional[str] = None

    _alias_ok = field_validator("alias")(_alias_is_valid)


class LinkOut(BaseModel):
    id: int
    short_code: str
    short_url: str
    original_url: str
    created_at: datetime
    expires_at: Optional[datetime] = None
    click_limit: Optional[int] = None
    tags: list[str] = []
    folder: Optional[str] = None
    has_qr: bool = False
    has_password: bool = False
    click_count: int


class FolderList(BaseModel):
    folders: list[str]


class CountItem(BaseModel):
    label: str
    count: int


class LinkAnalytics(BaseModel):
    link: LinkOut
    clicks_over_time: list[CountItem]
    top_referrers: list[CountItem]
    devices: list[CountItem]
    countries: list[CountItem]
    browsers: list[CountItem]


class BulkLinkRow(BaseModel):
    row: int
    status: str  # "created" | "updated" | "skipped" | "failed"
    url: Optional[str] = None
    alias: Optional[str] = None
    short_url: Optional[str] = None
    error: Optional[str] = None
    changed: Optional[list[str]] = None
    details: Optional[str] = None


class BulkImportResult(BaseModel):
    success_count: int
    failed_count: int
    updated_count: int = 0
    skipped_count: int = 0
    rows: list[BulkLinkRow]


class BulkCsvIn(BaseModel):
    """A single bulk-import row. CSV files only carry url/alias; Excel files may
    carry the full field set (mirrors ShortenIn's optional fields). A None/blank
    optional value means "leave the existing value unchanged" on an update and
    "use the default" on a create.

    `parse_error` is set when a cell could not be converted to its typed value
    (e.g. a non-ISO expires_at); such a row is reported as a per-row failure rather
    than aborting the whole import."""
    url: str
    alias: Optional[str] = None
    expires_at: Optional[datetime] = None
    click_limit: Optional[int] = None
    tags: Optional[list[str]] = None
    folder: Optional[str] = None
    has_qr: Optional[bool] = None
    password: Optional[str] = None
    parse_error: Optional[str] = None


class BulkDeleteIn(BaseModel):
    ids: list[int]


class BulkDeleteResult(BaseModel):
    deleted: int


class ForgotIn(BaseModel):
    email: EmailStr


class ResetIn(BaseModel):
    token: str
    new_password: str = Field(min_length=6)


class VerifyIn(BaseModel):
    token: str


class ResendVerifyIn(BaseModel):
    email: EmailStr
