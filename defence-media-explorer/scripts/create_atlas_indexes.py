#!/usr/bin/env python3
"""Create and verify Atlas indexes in the configured database.

Usage (from defence-media-explorer):
  python scripts/create_atlas_indexes.py
  python scripts/create_atlas_indexes.py --verify

The script refuses the admin, local, and config databases. It does not drop
collections or touch any other database on the cluster. Connection strings are
redacted in output.
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.config import get_settings  # noqa: E402
from app.db.client import connect, ping, redact  # noqa: E402
from app.db.indexes import ensure_database, list_index_status  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Create Defence Media Explorer Atlas indexes")
    parser.add_argument("--verify", action="store_true", help="Insert a temporary probe document and delete it")
    parser.add_argument("--wait-seconds", type=int, default=180)
    args = parser.parse_args()
    os.chdir(ROOT)
    settings = get_settings()
    if not settings.mongodb_configured:
        print("BLOCKED MONGODB_UNAVAILABLE configured=false")
        return 2
    if settings.mongodb_database in {"admin", "local", "config"}:
        print("BLOCKED refusing system database")
        return 2
    client = connect(settings)
    try:
        version = ping(client)
        if not version:
            print("BLOCKED MONGODB_UNAVAILABLE ping_failed")
            return 2
        print(f"CONNECTED server={version} database={settings.mongodb_database}")
        result = ensure_database(client, settings)
        print(
            f"ENSURED vector={result['vectorIndex'].get('status')} "
            f"action={result['vectorIndex'].get('action', 'existing')} "
            f"text={result['textIndex'].get('status')} "
            f"action={result['textIndex'].get('action', 'existing')} "
            f"dimensions={result['embeddingDimensions']}"
        )
        status = _wait(client, settings, args.wait_seconds)
        print(
            f"STATUS vector={status['vectorIndex'].get('status')} "
            f"queryable={status['vectorIndex'].get('queryable')} "
            f"text={status['textIndex'].get('status')} "
            f"queryable={status['textIndex'].get('queryable')}"
        )
        if args.verify:
            _verify(client, settings, status)
        return 0
    except Exception as exc:
        print(f"BLOCKED {type(exc).__name__} {redact(str(exc))[:400]}")
        return 1
    finally:
        if client is not None:
            client.close()


def _wait(client, settings, seconds: int) -> dict:
    deadline = time.time() + seconds
    status = list_index_status(client, settings)
    while time.time() < deadline:
        vector_ready = status["vectorIndex"].get("queryable") or status["vectorIndex"].get("status") == "READY"
        text_ready = status["textIndex"].get("queryable") or status["textIndex"].get("status") == "READY"
        if vector_ready and text_ready:
            return status
        time.sleep(5)
        status = list_index_status(client, settings)
    return status


def _verify(client, settings, status: dict) -> None:
    if not (status["vectorIndex"].get("queryable") and status["textIndex"].get("queryable")):
        print("PROBE_SKIPPED indexes_not_queryable")
        return
    database = client[settings.mongodb_database]
    from datetime import datetime, timezone

    from bson import ObjectId

    asset_id = ObjectId()
    segment_id = ObjectId()
    moment = datetime.now(timezone.utc)
    document = {
        "_id": segment_id,
        "assetId": asset_id,
        "workspaceId": "__index_probe__",
        "collectionId": None,
        "mediaType": "text",
        "segmentType": "text_chunk",
        "startMs": None,
        "endMs": None,
        "capturedAt": None,
        "captureDateUnknown": True,
        "uploadedAt": moment,
        "title": "Index probe equipment inspection",
        "description": "Temporary index verification document",
        "userDescription": "Temporary index verification document",
        "modelDescription": None,
        "transcript": "equipment inspection",
        "ocrText": None,
        "tags": ["probe"],
        "categories": [],
        "source": "index-probe",
        "sourceLanguage": "en",
        "searchText": "Index probe equipment inspection",
        "embedding": [0.01] * settings.embedding_dimensions,
        "embeddingModel": settings.voyage_multimodal_model,
        "embeddingDimensions": settings.embedding_dimensions,
        "embeddingStrategy": "index_probe",
        "embeddingInputType": "document",
        "pipelineVersion": "v1",
        "generation": 1,
        "reviewState": "unreviewed",
        "processingStatus": "ready",
        "indexingState": "persisted",
        "originalObject": {"bucket": "probe", "key": "probe"},
    }
    database.segments.insert_one(document)
    try:
        deadline = time.time() + 60
        vector_ok = False
        text_ok = False
        while time.time() < deadline and not (vector_ok and text_ok):
            if not vector_ok:
                rows = list(
                    database.segments.aggregate(
                        [
                            {
                                "$vectorSearch": {
                                    "index": settings.atlas_vector_index,
                                    "path": "embedding",
                                    "queryVector": [0.01] * settings.embedding_dimensions,
                                    "numCandidates": 50,
                                    "limit": 5,
                                    "filter": {"workspaceId": "__index_probe__"},
                                }
                            },
                            {"$project": {"_id": 1}},
                        ]
                    )
                )
                vector_ok = any(row["_id"] == segment_id for row in rows)
            if not text_ok:
                rows = list(
                    database.segments.aggregate(
                        [
                            {
                                "$search": {
                                    "index": settings.atlas_search_index,
                                    "compound": {
                                        "filter": [{"equals": {"path": "workspaceId", "value": "__index_probe__"}}],
                                        "must": [{"text": {"query": "inspection", "path": "searchText"}}],
                                    },
                                }
                            },
                            {"$project": {"_id": 1}},
                        ]
                    )
                )
                text_ok = any(row["_id"] == segment_id for row in rows)
            if not (vector_ok and text_ok):
                time.sleep(5)
        print(f"PROBE vector={'ok' if vector_ok else 'not_visible'} text={'ok' if text_ok else 'not_visible'}")
    finally:
        database.segments.delete_one({"_id": segment_id, "workspaceId": "__index_probe__"})
        print("PROBE_REMOVED")


if __name__ == "__main__":
    raise SystemExit(main())
