"""Check config, Atlas, and search indexes before the demo processes start.

Run from the backend directory: python -m app.preflight
The script prints what to fix. It does not print credentials.
"""

from __future__ import annotations

import sys

from app.config import Settings, get_settings
from app.db.client import configure_logging, connect, ping
from app.db.indexes import ensure_database, list_index_status
from app.workers.queue import legacy_asset_filter


def config_problems(settings: Settings) -> list[str]:
    problems: list[str] = []
    if not settings.mongodb_configured:
        problems.append(
            "MONGODB_URI is empty. Copy .env.example to .env and set the Atlas connection string. Do not commit .env."
        )
    if settings.mongodb_database != "defence_media_explorer":
        problems.append("MONGODB_DATABASE must be defence_media_explorer.")
    if not settings.session_configured:
        problems.append("SESSION_SECRET must be at least 16 characters.")
    if not settings.embeddings_configured:
        problems.append("VOYAGE_API_KEY is empty. Embeddings and semantic search need it.")
    return problems


def main() -> None:
    configure_logging()
    settings = get_settings()
    problems = config_problems(settings)
    if problems:
        for line in problems:
            print(line)
        sys.exit(1)
    client = connect(settings)
    version = ping(client) if client is not None else None
    if not version or client is None:
        print("Atlas did not answer. Check the connection string, Atlas network access, and that this machine can reach the federazionecup cluster.")
        sys.exit(1)
    print(f"Atlas reachable. Server version {version}. Database {settings.mongodb_database}.")
    if not settings.vision_configured:
        print("OPENAI_API_KEY is empty. Descriptions and transcription stay unavailable. Ingestion can still finish as partial.")
    try:
        ensure_database(client, settings)
        status = list_index_status(client, settings)
    except Exception:
        print("Search indexes could not be checked. From defence-media-explorer run: python scripts/create_atlas_indexes.py")
        sys.exit(1)
    vector = status.get("vectorIndex") or {}
    text = status.get("textIndex") or {}
    missing = [
        item.get("name") or label
        for label, item in (("vector", vector), ("text", text))
        if item.get("status") in {None, "missing", "unavailable"}
    ]
    if missing:
        print("Required search indexes are missing: " + ", ".join(str(name) for name in missing))
        print("From defence-media-explorer run: python scripts/create_atlas_indexes.py")
        sys.exit(1)
    for item in (vector, text):
        if item.get("queryable") is not True:
            print(
                f"Search index {item.get('name')} is {item.get('status')} and not queryable yet. "
                "Upload can start. Search waits until Atlas finishes building it."
            )
    database = client[settings.mongodb_database]
    query = legacy_asset_filter()
    count = int(database.assets.count_documents(query))
    print(f"Legacy object-storage assets: {count}")
    if count:
        print("These assets still point at object storage. They were not deleted and they are not migrated automatically.")
        shown = 0
        for document in database.assets.find(query, {"_id": 1}).limit(50):
            print(str(document["_id"]))
            shown += 1
        if count > shown:
            print(f"... and {count - shown} more")
    print("Preflight ok.")


if __name__ == "__main__":
    main()
