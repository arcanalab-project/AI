"""Request parsing. Instants are stored in UTC. Date-only values use the selected time zone."""

from __future__ import annotations

import re
from datetime import datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.errors import AppError


def parse_instant(value: str, time_zone: str) -> datetime:
    zone = _zone(time_zone)
    text = value.strip()
    try:
        if len(text) == 10:
            day = datetime.strptime(text, "%Y-%m-%d")
            return day.replace(tzinfo=zone).astimezone(timezone.utc)
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError as exc:
        raise AppError("VALIDATION_ERROR", 422, {"fields": ["date"]}) from exc
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=zone)
    return parsed.astimezone(timezone.utc)


def parse_zone(value: str) -> str:
    _zone(value)
    return value


def parse_tags(value: object) -> list[str]:
    if value is None or value == "":
        return []
    if isinstance(value, list):
        items = value
    else:
        items = str(value).split(",")
    tags = []
    for item in items:
        text = str(item).strip()
        if text and text not in tags:
            tags.append(text[:64])
    return tags[:32]


def safe_filename(name: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]", "_", name).strip("._") or "upload"
    return cleaned[:120]


def _zone(value: str) -> ZoneInfo:
    try:
        return ZoneInfo(value)
    except ZoneInfoNotFoundError as exc:
        raise AppError("VALIDATION_ERROR", 422, {"fields": ["timeZone"]}) from exc
