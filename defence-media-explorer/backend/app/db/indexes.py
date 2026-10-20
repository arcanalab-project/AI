"""Atlas index definitions and idempotent creation.

The script and API startup both call `ensure_database`. They only touch the
configured database (defence_media_explorer). They never drop databases,
collections, or indexes on other databases.
"""

from __future__ import annotations

import logging
from typing import Any

from pymongo import ASCENDING, DESCENDING, MongoClient
from pymongo.collection import Collection
from pymongo.errors import OperationFailure, PyMongoError
from pymongo.operations import SearchIndexModel

from app.config import PIPELINE_VERSION, Settings

logger = logging.getLogger(__name__)

COLLECTION_NAMES = (
    "assets",
    "segments",
    "ingestion_jobs",
    "collections",
    "saved_searches",
    "users",
    "audit_events",
)

# lucene.standard is the base analyzer: Unicode tokenization without stemming,
# so mixed-language archives are not forced through one language's stemmer.
# The five interface languages also have stemming multi-fields on searchText.
# Full-text queries do not translate; cross-language matches are a semantic concern.
SEARCH_INDEX_DEFINITION: dict[str, Any] = {
    "mappings": {
        "dynamic": False,
        "fields": {
            "workspaceId": {"type": "token"},
            "mediaType": {"type": "token"},
            "segmentType": {"type": "token"},
            "collectionId": {"type": "token"},
            "source": [{"type": "token"}, {"type": "string", "analyzer": "lucene.keyword"}],
            "sourceLanguage": {"type": "token"},
            "processingStatus": {"type": "token"},
            "reviewState": {"type": "token"},
            "pipelineVersion": {"type": "token"},
            "embeddingModel": {"type": "token"},
            "captureDateUnknown": {"type": "boolean"},
            "capturedAt": {"type": "date"},
            "uploadedAt": {"type": "date"},
            "tags": [{"type": "token"}, {"type": "string", "analyzer": "lucene.standard"}],
            "categories": [{"type": "token"}, {"type": "string", "analyzer": "lucene.standard"}],
            "title": {"type": "string", "analyzer": "lucene.standard"},
            "description": {"type": "string", "analyzer": "lucene.standard"},
            "userDescription": {"type": "string", "analyzer": "lucene.standard"},
            "modelDescription": {"type": "string", "analyzer": "lucene.standard"},
            "transcript": {"type": "string", "analyzer": "lucene.standard"},
            "ocrText": {"type": "string", "analyzer": "lucene.standard"},
            "searchText": {
                "type": "string",
                "analyzer": "lucene.standard",
                "multi": {
                    "english": {"type": "string", "analyzer": "lucene.english"},
                    "french": {"type": "string", "analyzer": "lucene.french"},
                    "german": {"type": "string", "analyzer": "lucene.german"},
                    "spanish": {"type": "string", "analyzer": "lucene.spanish"},
                    "italian": {"type": "string", "analyzer": "lucene.italian"},
                },
            },
        },
    }
}


def vector_index_definition(dimensions: int) -> dict[str, Any]:
    filter_paths = [
        "workspaceId",
        "mediaType",
        "segmentType",
        "collectionId",
        "source",
        "sourceLanguage",
        "processingStatus",
        "reviewState",
        "pipelineVersion",
        "embeddingModel",
        "captureDateUnknown",
        "capturedAt",
        "uploadedAt",
        "tags",
        "categories",
    ]
    fields: list[dict[str, Any]] = [
        {
            "type": "vector",
            "path": "embedding",
            "numDimensions": dimensions,
            "similarity": "cosine",
        }
    ]
    fields.extend({"type": "filter", "path": path} for path in filter_paths)
    return {"fields": fields}


def validators() -> dict[str, dict[str, Any]]:
    string = {"bsonType": "string"}
    date_or_null = {"bsonType": ["date", "null"]}
    return {
        "assets": {
            "$jsonSchema": {
                "bsonType": "object",
                "required": ["workspaceId", "mediaType", "processingStatus", "uploadedAt", "pipelineVersion"],
                "properties": {
                    "workspaceId": string,
                    "mediaType": {"enum": ["video", "image", "audio", "text"]},
                    "processingStatus": string,
                    "pipelineVersion": string,
                    "uploadedAt": {"bsonType": "date"},
                    "capturedAt": date_or_null,
                    "captureDateUnknown": {"bsonType": "bool"},
                    "sha256": {"bsonType": ["string", "null"]},
                    "title": string,
                },
            }
        },
        "segments": {
            "$jsonSchema": {
                "bsonType": "object",
                "required": [
                    "workspaceId",
                    "assetId",
                    "mediaType",
                    "segmentType",
                    "processingStatus",
                    "pipelineVersion",
                    "uploadedAt",
                ],
                "properties": {
                    "workspaceId": string,
                    "mediaType": {"enum": ["video", "image", "audio", "text"]},
                    "segmentType": {"enum": ["image", "video_clip", "audio_passage", "text_chunk"]},
                    "processingStatus": string,
                    "pipelineVersion": string,
                    "uploadedAt": {"bsonType": "date"},
                    "capturedAt": date_or_null,
                    "captureDateUnknown": {"bsonType": "bool"},
                    "startMs": {"bsonType": ["int", "long", "null"]},
                    "endMs": {"bsonType": ["int", "long", "null"]},
                    "embedding": {"bsonType": ["array", "null"]},
                    "embeddingDimensions": {"bsonType": ["int", "long", "null"]},
                    "searchText": string,
                },
            }
        },
        "users": {
            "$jsonSchema": {
                "bsonType": "object",
                "required": ["email", "passwordHash", "role", "workspaceId", "locale", "timeZone"],
                "properties": {
                    "email": string,
                    "role": {"enum": ["viewer", "uploader", "admin"]},
                    "workspaceId": string,
                    "locale": string,
                    "timeZone": string,
                },
            }
        },
        "ingestion_jobs": {
            "$jsonSchema": {
                "bsonType": "object",
                "required": ["workspaceId", "assetId", "status", "generation", "pipelineVersion"],
                "properties": {
                    "workspaceId": string,
                    "status": string,
                    "pipelineVersion": string,
                },
            }
        },
        "collections": {
            "$jsonSchema": {
                "bsonType": "object",
                "required": ["workspaceId", "name"],
                "properties": {"workspaceId": string, "name": string},
            }
        },
        "saved_searches": {
            "$jsonSchema": {
                "bsonType": "object",
                "required": ["workspaceId", "userId", "name", "mode"],
                "properties": {"workspaceId": string, "name": string, "mode": string},
            }
        },
        "audit_events": {
            "$jsonSchema": {
                "bsonType": "object",
                "required": ["workspaceId", "action", "at"],
                "properties": {"workspaceId": string, "action": string, "at": {"bsonType": "date"}},
            }
        },
    }


def regular_index_specs() -> dict[str, list[tuple[list[tuple[str, int]], dict[str, Any]]]]:
    return {
        "assets": [
            (
                [("workspaceId", ASCENDING), ("sha256", ASCENDING)],
                {"unique": True, "name": "workspace_sha256", "partialFilterExpression": {"sha256": {"$type": "string"}}},
            ),
            ([("workspaceId", ASCENDING), ("uploadedAt", DESCENDING)], {"name": "workspace_uploaded"}),
            ([("workspaceId", ASCENDING), ("processingStatus", ASCENDING)], {"name": "workspace_status"}),
            ([("workspaceId", ASCENDING), ("mediaType", ASCENDING), ("capturedAt", DESCENDING)], {"name": "workspace_media_captured"}),
        ],
        "segments": [
            (
                [("workspaceId", ASCENDING), ("assetId", ASCENDING), ("generation", ASCENDING)],
                {"name": "workspace_asset_generation"},
            ),
            ([("assetId", ASCENDING), ("startMs", ASCENDING)], {"name": "asset_start"}),
            (
                [("workspaceId", ASCENDING), ("mediaType", ASCENDING), ("capturedAt", DESCENDING)],
                {"name": "workspace_media_captured"},
            ),
            ([("workspaceId", ASCENDING), ("uploadedAt", DESCENDING)], {"name": "workspace_uploaded"}),
            ([("workspaceId", ASCENDING), ("processingStatus", ASCENDING)], {"name": "workspace_status"}),
        ],
        "users": [([("email", ASCENDING)], {"unique": True, "name": "email"})],
        "ingestion_jobs": [
            ([("assetId", ASCENDING), ("createdAt", DESCENDING)], {"name": "asset_created"}),
            ([("workspaceId", ASCENDING), ("status", ASCENDING), ("updatedAt", DESCENDING)], {"name": "workspace_status"}),
        ],
        "collections": [([("workspaceId", ASCENDING), ("name", ASCENDING)], {"name": "workspace_name"})],
        "saved_searches": [([("workspaceId", ASCENDING), ("userId", ASCENDING)], {"name": "workspace_user"})],
        "audit_events": [([("workspaceId", ASCENDING), ("at", DESCENDING)], {"name": "workspace_at"})],
    }


def ensure_database(client: MongoClient, settings: Settings) -> dict[str, Any]:
    if settings.mongodb_database in {"admin", "local", "config"}:
        raise RuntimeError("refusing to use a system database")
    database = client[settings.mongodb_database]
    names = set(database.list_collection_names())
    schema = validators()
    for name in COLLECTION_NAMES:
        if name not in names:
            database.create_collection(name, validator=schema[name], validationLevel="moderate")
        else:
            database.command("collMod", name, validator=schema[name], validationLevel="moderate")
        _ensure_regular_indexes(database[name], regular_index_specs()[name])

    vector_name = settings.atlas_vector_index
    text_name = settings.atlas_search_index
    vector_definition = vector_index_definition(settings.embedding_dimensions)
    vector_status = _ensure_search_index(
        database["segments"],
        name=vector_name,
        definition=vector_definition,
        index_type="vectorSearch",
    )
    text_status = _ensure_search_index(
        database["segments"],
        name=text_name,
        definition=SEARCH_INDEX_DEFINITION,
        index_type="search",
    )
    return {
        "database": settings.mongodb_database,
        "pipelineVersion": PIPELINE_VERSION,
        "embeddingDimensions": settings.embedding_dimensions,
        "vectorIndex": vector_status,
        "textIndex": text_status,
    }


def list_index_status(client: MongoClient, settings: Settings) -> dict[str, Any]:
    database = client[settings.mongodb_database]
    if "segments" not in set(database.list_collection_names()):
        return {"vectorIndex": {"name": settings.atlas_vector_index, "status": "missing"}, "textIndex": {"name": settings.atlas_search_index, "status": "missing"}}
    found = {item["name"]: item for item in database["segments"].list_search_indexes()}
    return {
        "vectorIndex": _public_status(found.get(settings.atlas_vector_index), settings.atlas_vector_index),
        "textIndex": _public_status(found.get(settings.atlas_search_index), settings.atlas_search_index),
    }


def _ensure_regular_indexes(collection: Collection, specs: list[tuple[list[tuple[str, int]], dict[str, Any]]]) -> None:
    existing = {index["name"] for index in collection.list_indexes()}
    for keys, options in specs:
        if options["name"] in existing:
            continue
        collection.create_index(keys, **options)


def _ensure_search_index(collection: Collection, *, name: str, definition: dict[str, Any], index_type: str) -> dict[str, Any]:
    try:
        existing = {item["name"]: item for item in collection.list_search_indexes()}
    except (OperationFailure, PyMongoError) as exc:
        logger.warning("search index list failed code=%s", getattr(exc, "code", type(exc).__name__))
        return {"name": name, "status": "unavailable", "errorCode": "SEARCH_UNAVAILABLE"}

    current = existing.get(name)
    if current is None:
        model = SearchIndexModel(definition=definition, name=name, type=index_type)
        collection.create_search_index(model)
        return {"name": name, "status": "building", "action": "created"}

    latest = current.get("latestDefinition") or current.get("definition") or {}
    if _same_definition(latest, definition):
        return _public_status(current, name) | {"action": "unchanged"}

    collection.update_search_index(name, definition)
    return {"name": name, "status": current.get("status", "building"), "action": "updated"}


def _same_definition(latest: dict[str, Any], expected: dict[str, Any]) -> bool:
    if "fields" in expected:
        got = latest.get("fields") or []
        want = expected["fields"]
        if len(got) != len(want):
            return False
        for left, right in zip(got, want, strict=True):
            for key, value in right.items():
                if left.get(key) != value:
                    return False
        return True
    return latest.get("mappings") == expected.get("mappings")


def _public_status(item: dict[str, Any] | None, name: str) -> dict[str, Any]:
    if item is None:
        return {"name": name, "status": "missing"}
    return {
        "name": name,
        "status": item.get("status") or "unknown",
        "queryable": bool(item.get("queryable")),
        "type": item.get("type"),
    }
