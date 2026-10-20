"""JSON shaping. Embeddings and password hashes never leave through this helper."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from bson import ObjectId

HIDDEN = {"embedding", "textEmbedding", "passwordHash"}


def jsonable(value: Any) -> Any:
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc).isoformat()
    if isinstance(value, dict):
        return {key: jsonable(item) for key, item in value.items() if key not in HIDDEN}
    if isinstance(value, list):
        return [jsonable(item) for item in value]
    return value


def public_user(user: dict) -> dict:
    return {
        "id": str(user["_id"]),
        "email": user["email"],
        "displayName": user.get("displayName") or user["email"],
        "role": user["role"],
        "workspaceId": user["workspaceId"],
        "locale": user.get("locale") or "en-GB",
        "timeZone": user.get("timeZone") or "Europe/Rome",
    }
