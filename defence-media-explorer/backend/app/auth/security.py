"""Session cookies and password checks."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt

from app.errors import AppError

RANK = {"viewer": 1, "uploader": 2, "admin": 3}


def hash_password(password: str) -> str:
    _check_password(password)
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def _check_password(password: str) -> None:
    has_letter = any(character.isalpha() for character in password)
    has_digit = any(character.isdigit() for character in password)
    if len(password) < 10 or not has_letter or not has_digit:
        raise AppError("PASSWORD_POLICY", 422, {"minLength": 10})


def sign_session(payload: dict[str, Any], secret: str, *, ttl_seconds: int = 14 * 24 * 3600) -> str:
    body = dict(payload)
    body["exp"] = int((datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)).timestamp())
    raw = base64.urlsafe_b64encode(json.dumps(body, separators=(",", ":")).encode()).decode().rstrip("=")
    signature = hmac.new(secret.encode("utf-8"), raw.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"{raw}.{signature}"


def read_session(token: str, secret: str) -> dict[str, Any] | None:
    if not token or "." not in token or not secret:
        return None
    raw, signature = token.rsplit(".", 1)
    expected = hmac.new(secret.encode("utf-8"), raw.encode("utf-8"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(signature, expected):
        return None
    padded = raw + "=" * (-len(raw) % 4)
    try:
        payload = json.loads(base64.urlsafe_b64decode(padded.encode()))
    except (json.JSONDecodeError, ValueError):
        return None
    if int(payload.get("exp") or 0) < int(datetime.now(timezone.utc).timestamp()):
        return None
    return payload


def require_rank(role: str, minimum: str) -> None:
    if RANK.get(role, 0) < RANK[minimum]:
        raise AppError("FORBIDDEN", 403, {"requiredRole": minimum})
