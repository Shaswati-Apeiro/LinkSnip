"""Minimal SMTP mail helper for operational emails (currently password reset).

Configuration comes from environment variables (see backend/.env):

    SMTP_HOST      SMTP server host (e.g. "smtp.gmail.com")
    SMTP_PORT      server port (default 587)
    SMTP_USER      SMTP login user
    SMTP_PASSWORD  SMTP login password or app password
    SMTP_FROM      "From" address (defaults to SMTP_USER)
    SMTP_STARTTLS  "1" to enable STARTTLS (default on)

When SMTP_HOST is not set, `send_email` degrades to a structured log line so the
feature still works in local/Docker without a mail server. The reset token is only
included in that fallback log for development; it is never persisted or logged by
the rest of the codebase (see auth._hash_reset_token).
"""

import logging
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

logger = logging.getLogger("linksnip.email")


def send_email(to: str, subject: str, html: str) -> bool:
    """Send an HTML email. Returns True on success.

    If SMTP is not configured, the message (which may contain a dev-only reset
    link) is logged instead. Never raises.
    """
    host = os.environ.get("SMTP_HOST")
    if not host:
        logger.warning("SMTP_HOST not set; email not sent. Dev-only body:\n%s", html)
        return False

    port = int(os.environ.get("SMTP_PORT", "587"))
    user = os.environ.get("SMTP_USER", "")
    password = os.environ.get("SMTP_PASSWORD", "")
    sender = os.environ.get("SMTP_FROM", user or "no-reply@linksnip.local")
    starttls = os.environ.get("SMTP_STARTTLS", "1") != "0"

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = sender
    msg["To"] = to
    msg.attach(MIMEText(html, "html", "utf-8"))

    try:
        with smtplib.SMTP(host, port, timeout=15) as server:
            if starttls:
                server.starttls()
            if user:
                server.login(user, password)
            server.sendmail(sender, [to], msg.as_string())
        logger.info("Email sent to %s (%s)", to, host)
        return True
    except Exception:  # noqa: BLE001
        logger.exception("Failed to send email to %s", to)
        return False