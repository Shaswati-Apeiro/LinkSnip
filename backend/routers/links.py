from datetime import datetime
import csv
import io
import json
import os
import urllib.parse
import urllib.request
import urllib.error
from typing import Optional

from fastapi import APIRouter, Request, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import RedirectResponse, HTMLResponse, StreamingResponse, Response
from openpyxl import load_workbook
from sqlalchemy import func
from sqlmodel import Session, select

from database import get_session
from models import User, Link, Click
from schemas import (
    ShortenIn,
    LinkUpdate,
    LinkOut,
    FolderList,
    CountItem,
    LinkAnalytics,
    BulkLinkRow,
    BulkImportResult,
    BulkCsvIn,
    BulkDeleteIn,
    BulkDeleteResult,
)
from auth import get_current_user, get_current_user_optional, hash_password, verify_password
from shortcode import encode

router = APIRouter(tags=["links"])

# Redirect status is configurable (301 or 302), default 302 so every click is counted
# (301 can be cached by the browser). Override via the REDIRECT_STATUS env var.
REDIRECT_STATUS = int(os.environ.get("REDIRECT_STATUS", "302"))
if REDIRECT_STATUS not in (301, 302):
    REDIRECT_STATUS = 302

# Google Safe Browsing Lookup API key (malware/phishing check). Loaded from the
# environment (backend/.env) — never hardcoded. Empty => the check is skipped.
SAFE_BROWSING_API_KEY = os.environ.get("SAFE_BROWSING_API_KEY", "").strip()
SAFE_BROWSING_THREATS = [
    "MALWARE",
    "SOCIAL_ENGINEERING",  # phishing
    "UNWANTED_SOFTWARE",
    "POTENTIALLY_HARMFUL_APPLICATION",
]


def is_valid_url(url: str) -> bool:
    """Cheap structural URL check (scheme + netloc) before hitting the API."""
    try:
        parts = urllib.parse.urlparse(url)
    except ValueError:
        return False
    return parts.scheme in ("http", "https") and bool(parts.netloc)


def safe_browsing_check(urls: list[str]) -> dict[str, str]:
    """Query Safe Browsing for a batch of URLs in one API call.

    Returns a dict of {url: threat-label} for flagged URLs (empty when none flagged
    or when the API is unavailable). API failures are swallowed so a down/unavailable
    API never blocks shortening — the check is best-effort.
    """
    if not SAFE_BROWSING_API_KEY or not urls:
        return {}

    payload = {
        "client": {"clientId": "linksnip", "clientVersion": "1.0.0"},
        "threatInfo": {
            "threatTypes": SAFE_BROWSING_THREATS,
            "platformTypes": ["ANY_PLATFORM"],
            "threatEntryTypes": ["URL"],
            "threatEntries": [{"url": u} for u in urls],
        },
    }
    endpoint = (
        "https://safebrowsing.googleapis.com/v4/threatMatches:find"
        f"?key={urllib.parse.quote(SAFE_BROWSING_API_KEY)}"
    )
    req = urllib.request.Request(
        endpoint,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            matches = json.loads(resp.read().decode("utf-8")).get("matches", [])
    except Exception:
        return {}

    flagged: dict[str, str] = {}
    for m in matches:
        url = m.get("threat", {}).get("url")
        if url and (url not in flagged):
            flagged[url] = m.get("threatType") or "MALICIOUS"
    return flagged


def safe_browsing_violation(url: str) -> Optional[str]:
    """Single-URL convenience wrapper; returns a label if flagged, else None."""
    return safe_browsing_check([url]).get(url)


try:
    from geoip2fast import GeoIP2Fast
    _GEOIP = GeoIP2Fast()
except Exception:
    _GEOIP = None


def count_clicks(session: Session, link_id: int) -> int:
    return session.exec(
        select(func.count(Click.id)).where(Click.link_id == link_id)
    ).one()


def read_tags(link: Link) -> list[str]:
    """Return a link's tags, merging the new multi-tag column with legacy tags."""
    tags: list[str] = []
    if link.tags:
        try:
            tags = [t for t in json.loads(link.tags) if isinstance(t, str) and t.strip()]
        except (ValueError, TypeError):
            tags = []
    if link.tag and link.tag not in tags:
        tags.append(link.tag)
    return tags


def write_tags(link: Link, tags: list[str]) -> None:
    """Persist multiple tags. The legacy `tag` column mirrors the first tag so
    links saved by older code remain consistent and readable."""
    clean = [t.strip() for t in tags if t and t.strip()]
    link.tags = json.dumps(clean) if clean else None
    link.tag = clean[0] if clean else None


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
        tags=read_tags(link),
        folder=link.folder,
        has_qr=link.has_qr,
        has_password=bool(link.password_hash),
        click_count=count_clicks(session, link.id),
    )


def owned(session: Session, link_id: int, user: User) -> Link:
    link = session.get(Link, link_id)
    if not link or link.user_id != user.id:
        raise HTTPException(404, "Link not found")
    return link


def _create_link(
    session: Session,
    request: Request,
    user: Optional[User],
    url: str,
    alias: Optional[str] = None,
    flagged: Optional[dict[str, str]] = None,
    password: Optional[str] = None,
) -> Link:
    """Shared "validate → safe-browsing → create" path used by single shortening and
    bulk CSV import. Raises HTTPException with a user-friendly message on failure.

    `flagged` is an optional pre-computed {url: threat} map from a batch Safe Browsing
    check (used by bulk import so it doesn't re-query per row); when omitted a single-URL
    lookup is performed.
    """
    if not is_valid_url(url):
        raise HTTPException(400, "Invalid URL. Please enter a valid http(s) link.")
    if alias:
        if not user:
            raise HTTPException(401, "Login required for a custom alias")
        if session.exec(select(Link).where(Link.short_code == alias)).first():
            raise HTTPException(400, "Alias already taken")

    threat = None
    if flagged is not None:
        # Bulk import already checked this URL in one batch; absent from the map = safe.
        threat = flagged.get(url)
    else:
        threat = safe_browsing_violation(url)
    if threat:
        raise HTTPException(
            400, f"This link was blocked as potentially unsafe ({threat.lower()})."
        )

    link = Link(
        original_url=url,
        short_code=alias,
        user_id=user.id if user else None,
    )
    if password:
        link.password_hash = hash_password(password)
    session.add(link)
    session.commit()
    session.refresh(link)

    if not link.short_code:
        link.short_code = encode(link.id)
        session.add(link)
        session.commit()
        session.refresh(link)

    return link


@router.post("/api/shorten", response_model=LinkOut)
def shorten(
    data: ShortenIn,
    request: Request,
    session: Session = Depends(get_session),
    user: Optional[User] = Depends(get_current_user_optional),
):
    link = _create_link(
        session, request, user, data.url, data.alias, password=data.password,
    )
    link.expires_at = data.expires_at
    link.click_limit = data.click_limit
    link.folder = data.folder or None
    link.has_qr = data.has_qr
    write_tags(link, data.tags or [])
    session.commit()
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


# CSV columns accepted for bulk import (empty `alias` allowed).
_CSV_URL_COLS = {"url"}
_CSV_ALIAS_COLS = {"alias"}
_CSV_MAX_ROWS = 5000

# Bundled Excel (.xlsx) template for bulk import. Lives next to this module's parent
# (backend/) so it ships in the Docker image via `COPY . .` and is found locally too.
_XLSX_TEMPLATE_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "LinkSnip_Bulk_Import_Template.xlsx"
)


def _parse_bulk_rows(content: bytes) -> list[BulkCsvIn]:
    """Parse CSV text into rows, returning a BulkCsvIn per data line.

    Supports an optional header row of /`url`/`alias`/; otherwise the first column is
    treated as the URL and the (optional) second column as the alias.
    """
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(400, "CSV must be valid UTF-8 text.")

    reader = csv.reader(io.StringIO(text), strict=True)
    try:
        raw_rows = [r for r in reader if any(cell.strip() for cell in r)]
    except csv.Error:
        raise HTTPException(400, "CSV could not be parsed — check quoting and delimiters.")

    if not raw_rows:
        raise HTTPException(400, "The CSV file is empty.")

    if len(raw_rows) > _CSV_MAX_ROWS:
        raise HTTPException(400, f"Too many rows. Max {_CSV_MAX_ROWS} URLs per import.")

    header = [c.strip().lower() for c in raw_rows[0]]
    start = 0
    if header and (header[0] in _CSV_URL_COLS or "url" in header):
        start = 1

    def cell(row, idx):
        return row[idx].strip() if idx < len(row) else ""

    rows: list[BulkCsvIn] = []
    for i in range(start, len(raw_rows)):
        r = raw_rows[i]
        if "url" in header and start == 1:
            url = cell(r, header.index("url"))
            alias = cell(r, header.index("alias")) if "alias" in header else ""
        else:
            url = cell(r, 0)
            alias = cell(r, 1)
        rows.append(BulkCsvIn(url=url, alias=alias or None))
    return rows


def _parse_xlsx_rows(content: bytes) -> list[BulkCsvIn]:
    """Parse the first worksheet of an .xlsx workbook into the row structure the
    bulk-creation loop expects (url plus the optional alias/expires_at/click_limit/
    tags/folder/has_qr/password fields the single-link create path supports).

    A formatted template may have a title/instruction banner above the columns (the
    bundled template does), so the header row is *located* rather than assumed to be
    the first line. Data begins right after that header and ends at the first fully
    empty row, which separates footnotes/annotations below the data block.
    """
    try:
        wb = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    except Exception:
        raise HTTPException(400, "Invalid or corrupted Excel file. Please upload a valid .xlsx file.")

    try:
        ws = wb.worksheets[0]
        raw_rows: list[list[str]] = []
        for values in ws.iter_rows(values_only=True):
            cells = ["" if v is None else str(v).strip() for v in values]
            # Keep track of fully-empty rows too, so we can detect the blank separator.
            raw_rows.append(cells)
    finally:
        wb.close()

    # Begin by locating the header row: the first row whose leading cell maps to a
    # recognized field name. This skips any title/instruction banner above the columns.
    def norm(v):
        return v.strip().lower().replace("*", "").replace("(optional)", "").strip()

    recognized = {"url", "alias", "expires_at", "click_limit", "tags", "folder", "has_qr", "password"}
    header_idx = next(
        (i for i, r in enumerate(raw_rows) if r and norm(r[0]) in recognized),
        None,
    )
    if header_idx is None:
        # Headerless file (like a plain CSV): skip leading blank rows and use the
        # positional url/alias columns. A blank row anywhere is just skipped.
        first = next((i for i, r in enumerate(raw_rows) if any(r)), None)
        if first is None:
            raise HTTPException(400, "The Excel file is empty. Add at least one URL.")
        col_map = {"url": 0, "alias": 1}
    else:
        header = raw_rows[header_idx]
        col_map = {}
        for idx, name in enumerate(header):
            if norm(name) in recognized:
                col_map[norm(name)] = idx

    def cell(row, name):
        idx = col_map.get(name)
        return row[idx] if idx is not None and idx < len(row) else ""

    def as_row(row, num) -> BulkCsvIn:
        kwargs: dict = {"url": cell(row, "url"), "alias": cell(row, "alias") or None}
        parse_error: Optional[str] = None
        v = cell(row, "expires_at")
        if v:
            try:
                kwargs["expires_at"] = datetime.fromisoformat(v)
            except ValueError:
                parse_error = f"Invalid expiration date on row {num}: {v!r}. Use ISO-8601, e.g. 2026-12-31T23:59:59."
        v = cell(row, "click_limit")
        if v:
            try:
                kwargs["click_limit"] = int(v)
            except ValueError:
                parse_error = f"Invalid click limit on row {num}: {v!r}. Use a whole number."
        v = cell(row, "tags")
        kwargs["tags"] = [t.strip() for t in v.split(",") if t.strip()] if v else None
        kwargs["folder"] = cell(row, "folder") or None
        hq = cell(row, "has_qr")
        kwargs["has_qr"] = (hq.strip().lower() in {"yes", "true", "1", "y"}) if hq else None
        kwargs["password"] = cell(row, "password") or None
        if parse_error:
            kwargs["parse_error"] = parse_error
        return BulkCsvIn(**kwargs)

    if header_idx is None:
        # No recognized header: process every non-empty row (blanks skipped), stop
        # at the sheet end.
        rows: list[BulkCsvIn] = []
        for i in range(first, len(raw_rows)):
            r = raw_rows[i]
            if any(r):
                rows.append(as_row(r, i + 1))
    else:
        # Header-based (template) file: a blank row or a missing URL separates the
        # data block from trailing footnotes/annotations, so data ends at the first
        # row with no URL (this stops annotation text in other columns, e.g. a legend
        # labelling the optional columns, from being parsed as a real field value).
        rows: list[BulkCsvIn] = []
        for i in range(header_idx + 1, len(raw_rows)):
            r = raw_rows[i]
            if not any(r) or not cell(r, "url"):
                break
            rows.append(as_row(r, i + 1))

    if not rows:
        raise HTTPException(400, "The Excel file is empty. Add at least one URL below the header.")

    if len(rows) > _CSV_MAX_ROWS:
        raise HTTPException(400, f"Too many rows. Max {_CSV_MAX_ROWS} URLs per import.")
    return rows


def _existing_link(session: Session, alias: Optional[str], user: User) -> Optional[Link]:
    """Bulk import matches an existing row by its alias (the only stable, unique
    identifier the template carries), scoped to the current user so a row can never
    select another user's link. No alias => no reliable identity => treated as new."""
    if not alias:
        return None
    return session.exec(
        select(Link).where(Link.short_code == alias, Link.user_id == user.id)
    ).first()


def _upsert_existing(
    session: Session,
    user: User,
    row: BulkCsvIn,
    link: Link,
    flagged: dict[str, str],
) -> tuple[str, Link, list[str]]:
    """Compare a row against an existing link and apply only the fields that changed
    (blank optional cells are left unchanged). Reuses the same validation, safe-browsing,
    alias, tags and password rules as the single-link Create/Edit paths.

    Returns ("updated", link, changed_fields) if any field changed, else
    ("skipped", link, []) where changed_fields lists which columns were written
    (e.g. ["url","folder"]). Raises HTTPException for a validation failure (e.g.
    unsafe URL or taken alias), which the caller reports as a per-row failure.
    """
    changed_fields: list[str] = []

    # URL is always supplied. Reuse URL + Safe-Browsing validation.
    if not is_valid_url(row.url):
        raise HTTPException(400, "Invalid URL. Please enter a valid http(s) link.")
    threat = flagged.get(row.url)
    if threat:
        raise HTTPException(400, f"This link was blocked as potentially unsafe ({threat.lower()}).")
    if row.url != link.original_url:
        link.original_url = row.url
        changed_fields.append("url")

    # Alias. The row is matched by its own alias, so this normally equals the link's
    # alias (a no-op); a disagreement is still guarded so it never wrongly rejects the
    # same record, nor allows taking an alias owned by any other link.
    if row.alias and row.alias != link.short_code:
        if session.exec(select(Link).where(Link.short_code == row.alias)).first():
            raise HTTPException(400, "Alias already taken")
        link.short_code = row.alias
        changed_fields.append("alias")

    if row.expires_at is not None and (link.expires_at is None or link.expires_at != row.expires_at):
        link.expires_at = row.expires_at
        changed_fields.append("expires_at")

    if row.click_limit is not None and link.click_limit != row.click_limit:
        link.click_limit = row.click_limit
        changed_fields.append("click_limit")

    if row.folder is not None and (link.folder or None) != (row.folder or None):
        link.folder = row.folder or None
        changed_fields.append("folder")

    if row.tags is not None and sorted(read_tags(link)) != sorted(row.tags):
        write_tags(link, row.tags)
        changed_fields.append("tags")

    if row.has_qr is not None and bool(link.has_qr) != bool(row.has_qr):
        link.has_qr = bool(row.has_qr)
        changed_fields.append("has_qr")

    if row.password:
        # Only re-hash when the supplied password differs from the current one, so
        # importing identical rows (incl. password) is reported as "skipped", not a change.
        if link.password_hash is None or not verify_password(row.password, link.password_hash):
            link.password_hash = hash_password(row.password)
            changed_fields.append("password")

    if not changed_fields:
        return "skipped", link, []

    session.add(link)
    session.commit()
    session.refresh(link)
    return "updated", link, changed_fields


@router.post("/api/links/bulk", response_model=BulkImportResult)
def bulk_import(
    request: Request,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
    file: UploadFile = File(...),
):
    """Create/update (upsert) links from an uploaded CSV or Excel file.

    A row whose alias matches an existing link owned by the current user updates
    that link (only the changed columns are written; blank optional cells leave the
    existing value untouched). Any other row is created. Rows that resolve to an
    existing link with no changes are reported as "skipped". Per-row validation
    failures are reported without aborting the rest of the import.
    """
    content = file.file.read()

    # .xlsx files go through the Excel parser; everything else (incl. .csv) uses
    # the existing CSV parser — both produce the same url/alias row shape.
    filename = (file.filename or "").lower()
    if filename.endswith(".xlsx"):
        rows = _parse_xlsx_rows(content)
    else:
        rows = _parse_bulk_rows(content)
    created: list[BulkLinkRow] = []
    updated_rows: list[BulkLinkRow] = []
    skipped_rows: list[BulkLinkRow] = []
    failed: list[BulkLinkRow] = []

    # One batched Safe-Browsing API call over all structurally-valid distinct URLs
    # (instead of one HTTP round-trip per row).
    valid_urls = list(dict.fromkeys(r.url for r in rows))
    flagged = safe_browsing_check(valid_urls)

    for i, row in enumerate(rows):
        entry = BulkLinkRow(row=i + 1, status="failed", url=row.url, alias=row.alias)
        if row.parse_error:
            entry.error = row.parse_error
            failed.append(entry)
            continue
        try:
            existing = _existing_link(session, row.alias, user)
            if existing is not None:
                # Upsert: match by alias -> compare and update only what changed.
                status, link, changed_fields = _upsert_existing(session, user, row, existing, flagged)
                if status == "updated":
                    entry.status = "updated"
                    entry.changed = changed_fields
                    entry.short_url = to_out(request, session, link).short_url
                    updated_rows.append(entry)
                else:
                    entry.status = "skipped"
                    entry.details = "Existing link already matches these imported values — no update required."
                    entry.short_url = to_out(request, session, link).short_url
                    skipped_rows.append(entry)
            else:
                # New link: reuse the shared create path (validates + enforces the
                # unique alias), then apply the optional fields.
                link = _create_link(session, request, user, row.url, row.alias, flagged, password=row.password)
                link.expires_at = row.expires_at
                link.click_limit = row.click_limit
                link.folder = row.folder or None
                link.has_qr = bool(row.has_qr)
                write_tags(link, row.tags or [])
                session.commit()
                entry.status = "created"
                entry.short_url = to_out(request, session, link).short_url
                created.append(entry)
        except HTTPException as e:
            entry.error = str(getattr(e, "detail", e))
            failed.append(entry)
        except Exception:
            # Never crash the whole import on an unexpected per-row failure.
            entry.error = "Unexpected error"
            failed.append(entry)

    return BulkImportResult(
        success_count=len(created) + len(updated_rows),
        failed_count=len(failed),
        updated_count=len(updated_rows),
        skipped_count=len(skipped_rows),
        rows=created + updated_rows + skipped_rows + failed,
    )


@router.get("/api/links/bulk/template")
def bulk_import_template(
    user: User = Depends(get_current_user),
):
    """Download a CSV template for bulk import (same columns the importer expects).

    Header row is `url,alias` (the format _parse_bulk_rows detects); the example rows
    are valid and re-importable as-is, so a user can add/replace rows then upload the
    file directly.
    """
    def gen():
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(["url", "alias"])
        for u, a in (
            ("https://example.com/page/1", ""),
            ("https://example.com/page/2", "my-custom-alias"),
            ("https://example.com/page/3", ""),
        ):
            writer.writerow([u, a])
        yield buf.getvalue()

    return StreamingResponse(
        gen(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="linksnip-bulk-import-template.csv"'},
    )


@router.get("/api/links/bulk/template/excel")
def bulk_import_template_excel(
    user: User = Depends(get_current_user),
):
    """Download the official Excel (.xlsx) template for bulk import. It is a real
    workbook (two sheets: Import Data + Instructions) whose columns map 1:1 to the
    fields _parse_xlsx_rows reads, so it can be opened, filled, and uploaded directly."""
    try:
        with open(_XLSX_TEMPLATE_PATH, "rb") as f:
            content = f.read()
    except FileNotFoundError:
        raise HTTPException(500, "Excel template not found on the server.")

    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="linksnip-bulk-import-template.xlsx"'},
    )


@router.get("/api/links/folders", response_model=FolderList)
def my_folders(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Distinct folder names across the user's links, for dropdown references."""
    rows = session.exec(
        select(Link.folder)
        .where(Link.user_id == user.id, Link.folder.is_not(None))
        .distinct()
    ).all()
    return FolderList(folders=sorted([f for f in rows if f]))


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
        countries=sorted(group_by(Click.country_code), key=lambda x: x.count, reverse=True),
        browsers=sorted(group_by(Click.browser), key=lambda x: x.count, reverse=True),
    )


@router.get("/api/links/{link_id}/export")
def export_analytics(
    link_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Stream per-click analytics for a link as a CSV (one row per click)."""
    link = owned(session, link_id, user)

    clicks = session.exec(
        select(Click).where(Click.link_id == link.id).order_by(Click.ts)
    ).all()

    def esc(v) -> str:
        return "" if v is None else str(v)

    def gen():
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(["click_time", "country_code", "country", "referrer", "device", "browser"])
        for c in clicks:
            writer.writerow([esc(c.ts), esc(c.country_code), esc(c.country),
                             esc(c.referrer), esc(c.device), esc(c.browser)])
        yield buf.getvalue()

    filename = f"linksnip-{link.short_code}-analytics.csv"
    return StreamingResponse(
        gen(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
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
    data = payload.model_dump(exclude_unset=True)

    alias = data.pop("alias", None)
    if alias and alias != link.short_code:
        if session.exec(select(Link).where(Link.short_code == alias)).first():
            raise HTTPException(400, "Alias already taken")
        link.short_code = alias

    # `tags` is a list on the wire but stored as JSON on one column.
    if "tags" in data:
        write_tags(link, data.pop("tags") or [])
    if "folder" in data:
        link.folder = data.pop("folder") or None
    if "password" in data:
        password = data.pop("password")
        # Empty string disables protection; otherwise hash and store the new password.
        link.password_hash = hash_password(password) if password else None

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


@router.post("/api/links/bulk-delete", response_model=BulkDeleteResult)
def bulk_delete(
    data: BulkDeleteIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Delete multiple links. Only links owned by the current user are removed;
    other/nonexistent ids are reported back in `not_found`."""
    requested = set(data.ids)
    links = session.exec(
        select(Link).where(Link.user_id == user.id, Link.id.in_(list(requested)))
    ).all()
    deleted_ids = {link.id for link in links}
    for link in links:
        session.delete(link)
    session.commit()
    return BulkDeleteResult(
        deleted=len(deleted_ids),
        not_found=sorted(requested - deleted_ids),
    )


def status_page(*, code: int, badge: str, title: str, message: str, accent: str, icon: str) -> HTMLResponse:
    html = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} · LinkSnip</title>
<style>
  :root {{
    --bg: #f8fafc; --card: #ffffff; --text: #0f172a; --muted: #64748b;
    --border: #e2e8f0; --shadow: 0 10px 40px rgba(15,23,42,.08);
  }}
  @media (prefers-color-scheme: dark) {{
    :root {{
      --bg: #0b1120; --card: #111827; --text: #f1f5f9; --muted: #94a3b8;
      --border: #1f2937; --shadow: 0 10px 40px rgba(0,0,0,.4);
    }}
  }}
  * {{ box-sizing: border-box; }}
  body {{
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    padding: 24px; background: var(--bg); color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }}
  .card {{
    width: 100%; max-width: 440px; background: var(--card); border: 1px solid var(--border);
    border-radius: 20px; box-shadow: var(--shadow); padding: 40px 32px; text-align: center;
  }}
  .brand {{
    display: inline-flex; align-items: center; gap: 8px; margin-bottom: 28px;
    font-weight: 700; font-size: 15px; letter-spacing: -.01em;
  }}
  .icon {{
    width: 72px; height: 72px; margin: 0 auto 20px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    background: {accent}1a; color: {accent};
  }}
  .badge {{
    display: inline-block; margin-bottom: 12px; padding: 4px 12px; border-radius: 999px;
    font-size: 12px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase;
    background: {accent}1a; color: {accent};
  }}
  h1 {{ margin: 0 0 10px; font-size: 22px; letter-spacing: -.02em; }}
  p {{ margin: 0; color: var(--muted); font-size: 15px; line-height: 1.6; }}
</style>
</head>
<body>
  <main class="card">
    <div class="brand">
      <svg width="24" height="24" fill="none" viewBox="0 0 24 24" aria-hidden="true">
        <defs>
          <linearGradient id="lg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#3b82f6"/>
            <stop offset="50%" stop-color="#6366f1"/>
            <stop offset="100%" stop-color="#9333ea"/>
          </linearGradient>
        </defs>
        <path stroke="url(#lg)" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5"
          d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/>
      </svg>
      LinkSnip
    </div>
    <div class="icon">{icon}</div>
    <span class="badge">{badge}</span>
    <h1>{title}</h1>
    <p>{message}</p>
  </main>
</body>
</html>"""
    return HTMLResponse(content=html, status_code=code)


_ICON_CLOCK = (
    '<svg width="34" height="34" fill="none" viewBox="0 0 24 24" stroke="currentColor" '
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
    '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>'
)
_ICON_UNLINK = (
    '<svg width="34" height="34" fill="none" viewBox="0 0 24 24" stroke="currentColor" '
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
    '<path d="M9 17H7A5 5 0 0 1 7 7h2M15 7h2a5 5 0 0 1 4 8"/>'
    '<path d="M8 12h3M2 2l20 20"/></svg>'
)
_ICON_LOCK = (
    '<svg width="34" height="34" fill="none" viewBox="0 0 24 24" stroke="currentColor" '
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
    '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>'
)
_ICON_DISABLED = (
    '<svg width="34" height="34" fill="none" viewBox="0 0 24 24" stroke="currentColor" '
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
    '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/></svg>'
)


def password_page(code: str, *, error: str = "") -> HTMLResponse:
    """Backend-rendered prompt for password-protected links.

    Reuses the existing status-page styling; submits to the same short URL via POST.
    """
    accent = "#6366f1"
    error_html = ""
    if error:
        error_html = (
            '<div class="error" role="alert">' + error + "</div>"
        )
    html = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Enter password · LinkSnip</title>
<style>
  :root {{
    --bg: #f8fafc; --card: #ffffff; --text: #0f172a; --muted: #64748b;
    --border: #e2e8f0; --shadow: 0 10px 40px rgba(15,23,42,.08);
  }}
  @media (prefers-color-scheme: dark) {{
    :root {{
      --bg: #0b1120; --card: #111827; --text: #f1f5f9; --muted: #94a3b8;
      --border: #1f2937; --shadow: 0 10px 40px rgba(0,0,0,.4);
    }}
  }}
  * {{ box-sizing: border-box; }}
  body {{
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    padding: 24px; background: var(--bg); color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }}
  .card {{
    width: 100%; max-width: 400px; background: var(--card); border: 1px solid var(--border);
    border-radius: 20px; box-shadow: var(--shadow); padding: 40px 32px; text-align: center;
  }}
  .brand {{
    display: inline-flex; align-items: center; gap: 8px; margin-bottom: 24px;
    font-weight: 700; font-size: 15px; letter-spacing: -.01em;
  }}
  .icon {{
    width: 72px; height: 72px; margin: 0 auto 20px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    background: {accent}1a; color: {accent};
  }}
  .badge {{
    display: inline-block; margin-bottom: 12px; padding: 4px 12px; border-radius: 999px;
    font-size: 12px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase;
    background: {accent}1a; color: {accent};
  }}
  h1 {{ margin: 0 0 8px; font-size: 22px; letter-spacing: -.02em; }}
  p {{ margin: 0 0 18px; color: var(--muted); font-size: 15px; line-height: 1.5; }}
  form {{ text-align: left; }}
  input[type="password"] {{
    width: 100%; padding: 12px 14px; border: 1px solid var(--border); border-radius: 12px;
    font-size: 15px; color: var(--text); background: var(--card); outline: none; margin-bottom: 12px;
  }}
  input[type="password"]:focus {{ border-color: {accent}; }}
  button {{
    width: 100%; padding: 12px; border: none; border-radius: 12px; cursor: pointer;
    font-size: 15px; font-weight: 600; color: #fff; background: {accent};
  }}
  .error {{ margin-top: 10px; padding: 10px 12px; border-radius: 10px; font-size: 13px;
    background: #fef2f2; color: #b91c1c; }}
</style>
</head>
<body>
  <main class="card">
    <div class="brand">
      <svg width="24" height="24" fill="none" viewBox="0 0 24 24" aria-hidden="true">
        <defs>
          <linearGradient id="lg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#3b82f6"/>
            <stop offset="50%" stop-color="#6366f1"/>
            <stop offset="100%" stop-color="#9333ea"/>
          </linearGradient>
        </defs>
        <path stroke="url(#lg)" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5"
          d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/>
      </svg>
      LinkSnip
    </div>
    <div class="icon">{_ICON_LOCK}</div>
    <span class="badge">Protected</span>
    <h1>This link is protected</h1>
    <p>Enter the password to continue.</p>
    <form method="post" action="{code}">
      <input type="password" name="password" placeholder="Password" autofocus required
             autocomplete="current-password" aria-label="Password" />
      <button type="submit">Continue</button>
    </form>
    {error_html}
  </main>
</body>
</html>"""
    return HTMLResponse(content=html, status_code=200)


def parse_ua(ua: Optional[str]):
    ua = ua or ""
    device = "Mobile" if any(k in ua for k in ("Mobile", "Android", "iPhone")) else "Desktop"
    for name in ("Edg", "Chrome", "Firefox", "Safari"):
        if name in ua:
            return device, ("Edge" if name == "Edg" else name)
    return device, "Other"


def client_ip(request: Request) -> Optional[str]:
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else None


def geo_lookup(ip: Optional[str]):
    if not ip or _GEOIP is None:
        return None, None
    try:
        r = _GEOIP.lookup(ip)
        code = (r.country_code or "").strip().upper()
        if len(code) == 2 and code.isalpha():
            return code, r.country_name
    except Exception:
        pass
    return None, None


def _record_click(session: Session, request: Request, link: Link) -> None:
    device, browser = parse_ua(request.headers.get("user-agent"))
    country_code, country = geo_lookup(client_ip(request))
    session.add(Click(
        link_id=link.id,
        referrer=request.headers.get("referer"),
        device=device,
        browser=browser,
        country_code=country_code,
        country=country,
    ))
    session.commit()


@router.get("/{code}")
def redirect(code: str, request: Request, session: Session = Depends(get_session)):
    link = session.exec(select(Link).where(Link.short_code == code)).first()
    if not link:
        return status_page(
            code=404,
            badge="Not found",
            title="Link not found",
            message="This short link doesn't exist or has been removed. "
                    "Please double-check the URL and try again.",
            accent="#ef4444",
            icon=_ICON_UNLINK,
        )

    # A known-but-disabled link gets its own friendly "unavailable" message rather
    # than being shown as if it never existed.
    if not link.is_active:
        return status_page(
            code=410,
            badge="Unavailable",
            title="This link is unavailable",
            message="This link has been disabled by its owner and can no longer be "
                    "opened.",
            accent="#64748b",
            icon=_ICON_DISABLED,
        )

    if link.expires_at and datetime.utcnow() > link.expires_at:
        return status_page(
            code=410,
            badge="Expired",
            title="This link has expired",
            message="The link you followed has passed its expiry date "
                    "and is no longer active.",
            accent="#f59e0b",
            icon=_ICON_CLOCK,
        )

    if link.click_limit is not None and count_clicks(session, link.id) >= link.click_limit:
        return status_page(
            code=410,
            badge="Limit reached",
            title="Click limit reached",
            message="This link has reached its maximum number of allowed clicks "
                    "and is no longer active.",
            accent="#f59e0b",
            icon=_ICON_CLOCK,
        )

    # Password-protected links prompt before redirecting (no click recorded yet).
    if link.password_hash:
        return password_page(code)

    _record_click(session, request, link)
    return RedirectResponse(link.original_url, status_code=REDIRECT_STATUS)


@router.post("/{code}")
def redirect_with_password(
    code: str,
    request: Request,
    password: str = Form(...),
    session: Session = Depends(get_session),
):
    link = session.exec(select(Link).where(Link.short_code == code)).first()
    if not link:
        return status_page(
            code=404,
            badge="Not found",
            title="Link not found",
            message="This short link doesn't exist or has been removed.",
            accent="#ef4444",
            icon=_ICON_UNLINK,
        )
    # A known-but-disabled link gets its own friendly "unavailable" message.
    if not link.is_active:
        return status_page(
            code=410,
            badge="Unavailable",
            title="This link is unavailable",
            message="This link has been disabled by its owner and can no longer be "
                    "opened.",
            accent="#64748b",
            icon=_ICON_DISABLED,
        )
    if link.expires_at and datetime.utcnow() > link.expires_at:
        return status_page(
            code=410,
            badge="Expired",
            title="This link has expired",
            message="The link you followed has passed its expiry date.",
            accent="#f59e0b",
            icon=_ICON_CLOCK,
        )
    if link.click_limit is not None and count_clicks(session, link.id) >= link.click_limit:
        return status_page(
            code=410,
            badge="Limit reached",
            title="Click limit reached",
            message="This link has reached its maximum number of allowed clicks.",
            accent="#f59e0b",
            icon=_ICON_CLOCK,
        )

    # Unprotected link: a stray POST just redirects like a normal GET.
    if not link.password_hash:
        _record_click(session, request, link)
        return RedirectResponse(link.original_url, status_code=REDIRECT_STATUS)

    if verify_password(password, link.password_hash):
        _record_click(session, request, link)
        return RedirectResponse(link.original_url, status_code=REDIRECT_STATUS)

    # Wrong password: show the prompt again (no click recorded).
    return password_page(code, error="Incorrect password. Please try again.")
