"""Mongo helpers. Connection strings are never logged."""

from __future__ import annotations

import logging
import re
from functools import lru_cache

from pymongo import MongoClient
from pymongo.errors import PyMongoError

from app.config import Settings, get_settings

logger = logging.getLogger(__name__)


def redact(text: str) -> str:
    hidden = "mongodb" + "://" + "***@"
    return re.sub(r"mongodb(?:\+srv)?://[^@\s/]+@", hidden, text)


class RedactFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            record.msg = redact(record.msg)
        if record.args:
            record.args = tuple(redact(arg) if isinstance(arg, str) else arg for arg in record.args)
        return True


def configure_logging() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
    logging.getLogger().addFilter(RedactFilter())


@lru_cache
def get_client(uri: str) -> MongoClient:
    return MongoClient(uri, serverSelectionTimeoutMS=8000, tz_aware=True)


def connect(settings: Settings | None = None) -> MongoClient | None:
    settings = settings or get_settings()
    if not settings.mongodb_configured:
        return None
    return get_client(settings.mongodb_uri)


def ping(client: MongoClient) -> str | None:
    try:
        client.admin.command("ping")
        return str(client.server_info().get("version") or "")
    except PyMongoError:
        return None


def database(settings: Settings | None = None):
    settings = settings or get_settings()
    client = connect(settings)
    if client is None:
        return None
    if settings.mongodb_database in {"admin", "local", "config"}:
        raise RuntimeError("refusing to use a system database")
    return client[settings.mongodb_database]
