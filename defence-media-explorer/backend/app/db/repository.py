"""Atlas persistence. Every read and write is scoped by workspaceId in the service layer."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from bson import ObjectId
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from app.errors import AppError


def oid(value: Any) -> ObjectId:
    if isinstance(value, ObjectId):
        return value
    try:
        return ObjectId(str(value))
    except Exception as exc:
        raise AppError("VALIDATION_ERROR", 422, {"fields": ["id"]}) from exc


def now() -> datetime:
    return datetime.now(timezone.utc)


class Repository:
    def __init__(self, db) -> None:
        self.db = db

    def get_user_by_email(self, email: str) -> dict | None:
        return self.db.users.find_one({"email": email.lower()})

    def get_user(self, user_id: str) -> dict | None:
        return self.db.users.find_one({"_id": oid(user_id)})

    def insert_user(self, document: dict) -> dict:
        document = dict(document)
        document["email"] = document["email"].lower()
        document.setdefault("createdAt", now())
        document["updatedAt"] = now()
        try:
            result = self.db.users.insert_one(document)
        except DuplicateKeyError as exc:
            raise AppError("VALIDATION_ERROR", 409, {"fields": ["email"]}) from exc
        document["_id"] = result.inserted_id
        return document

    def update_user(self, user_id: str, workspace_id: str, patch: dict) -> dict | None:
        patch = dict(patch)
        patch["updatedAt"] = now()
        return self.db.users.find_one_and_update(
            {"_id": oid(user_id), "workspaceId": workspace_id},
            {"$set": patch},
            return_document=ReturnDocument.AFTER,
        )

    def list_users(self, workspace_id: str) -> list[dict]:
        return list(self.db.users.find({"workspaceId": workspace_id}).sort("email", 1))

    def audit(self, workspace_id: str, action: str, *, actor_id: str | None, target_type: str, target_id: str, metadata: dict | None = None) -> None:
        self.db.audit_events.insert_one(
            {
                "workspaceId": workspace_id,
                "action": action,
                "actorId": actor_id,
                "targetType": target_type,
                "targetId": target_id,
                "metadata": metadata or {},
                "at": now(),
            }
        )

    def list_collections(self, workspace_id: str) -> list[dict]:
        return list(self.db.collections.find({"workspaceId": workspace_id}).sort("name", 1))

    def get_collection(self, collection_id: str, workspace_id: str) -> dict | None:
        return self.db.collections.find_one({"_id": oid(collection_id), "workspaceId": workspace_id})

    def insert_collection(self, document: dict) -> dict:
        document = dict(document)
        document["createdAt"] = now()
        result = self.db.collections.insert_one(document)
        document["_id"] = result.inserted_id
        return document

    def update_collection(self, collection_id: str, workspace_id: str, patch: dict) -> dict | None:
        return self.db.collections.find_one_and_update(
            {"_id": oid(collection_id), "workspaceId": workspace_id},
            {"$set": patch},
            return_document=ReturnDocument.AFTER,
        )

    def delete_collection(self, collection_id: str, workspace_id: str) -> bool:
        count = self.db.assets.count_documents({"workspaceId": workspace_id, "collectionId": collection_id})
        if count:
            raise AppError("COLLECTION_NOT_EMPTY", 409, {"assetCount": count})
        result = self.db.collections.delete_one({"_id": oid(collection_id), "workspaceId": workspace_id})
        return result.deleted_count == 1

    def find_duplicate(self, workspace_id: str, sha256: str, exclude_id: Any | None = None) -> dict | None:
        query: dict[str, Any] = {"workspaceId": workspace_id, "sha256": sha256}
        if exclude_id is not None:
            query["_id"] = {"$ne": oid(exclude_id)}
        return self.db.assets.find_one(query)

    def insert_asset(self, document: dict) -> dict:
        document = dict(document)
        document.setdefault("uploadedAt", now())
        document.setdefault("updatedAt", document["uploadedAt"])
        document.setdefault("deletedAt", None)
        try:
            result = self.db.assets.insert_one(document)
        except DuplicateKeyError as exc:
            raise AppError("DUPLICATE_ASSET", 409, {}) from exc
        document["_id"] = result.inserted_id
        return document

    def get_asset(self, asset_id: Any, workspace_id: str) -> dict | None:
        return self.db.assets.find_one({"_id": oid(asset_id), "workspaceId": workspace_id})

    def update_asset(self, asset_id: Any, workspace_id: str, patch: dict) -> dict | None:
        patch = dict(patch)
        patch["updatedAt"] = now()
        return self.db.assets.find_one_and_update(
            {"_id": oid(asset_id), "workspaceId": workspace_id},
            {"$set": patch},
            return_document=ReturnDocument.AFTER,
        )

    def list_assets(self, query: dict, sort: list[tuple[str, int]], skip: int, limit: int) -> tuple[list[dict], int]:
        total = self.db.assets.count_documents(query)
        cursor = self.db.assets.find(query).sort(sort).skip(skip).limit(limit)
        return list(cursor), total

    def delete_asset_tree(self, asset_id: Any, workspace_id: str) -> dict | None:
        asset = self.get_asset(asset_id, workspace_id)
        if not asset:
            return None
        self.db.segments.delete_many({"assetId": asset["_id"], "workspaceId": workspace_id})
        self.db.ingestion_jobs.delete_many({"assetId": asset["_id"], "workspaceId": workspace_id})
        self.db.assets.delete_one({"_id": asset["_id"], "workspaceId": workspace_id})
        return asset

    def insert_job(self, document: dict) -> dict:
        document = dict(document)
        document.setdefault("createdAt", now())
        document["updatedAt"] = document["createdAt"]
        document.setdefault("steps", [])
        result = self.db.ingestion_jobs.insert_one(document)
        document["_id"] = result.inserted_id
        return document

    def get_job(self, job_id: Any, workspace_id: str | None = None) -> dict | None:
        query: dict[str, Any] = {"_id": oid(job_id)}
        if workspace_id is not None:
            query["workspaceId"] = workspace_id
        return self.db.ingestion_jobs.find_one(query)

    def update_job(self, job_id: Any, patch: dict) -> None:
        patch = dict(patch)
        patch["updatedAt"] = now()
        self.db.ingestion_jobs.update_one({"_id": oid(job_id)}, {"$set": patch})

    def list_jobs(self, workspace_id: str, limit: int = 100) -> list[dict]:
        return list(
            self.db.ingestion_jobs.find({"workspaceId": workspace_id}).sort("createdAt", -1).limit(limit)
        )

    def latest_job_for_asset(self, asset_id: Any, workspace_id: str) -> dict | None:
        return self.db.ingestion_jobs.find_one(
            {"assetId": oid(asset_id), "workspaceId": workspace_id},
            sort=[("createdAt", -1)],
        )

    def insert_segments(self, documents: list[dict]) -> None:
        if documents:
            self.db.segments.insert_many(documents, ordered=True)

    def delete_generation(self, asset_id: Any, generation: int) -> int:
        result = self.db.segments.delete_many({"assetId": oid(asset_id), "generation": generation})
        return result.deleted_count

    def delete_other_generations(self, asset_id: Any, keep_generation: int) -> int:
        result = self.db.segments.delete_many({"assetId": oid(asset_id), "generation": {"$ne": keep_generation}})
        return result.deleted_count

    def committed_segment_meta(self, asset_id: Any, generation: int) -> dict | None:
        return self.db.segments.find_one(
            {"assetId": oid(asset_id), "generation": generation, "embeddingModel": {"$type": "string"}},
            projection={"embedding": 0, "textEmbedding": 0},
        )

    def list_segments(self, asset_id: Any, workspace_id: str) -> list[dict]:
        return list(
            self.db.segments.find(
                {"assetId": oid(asset_id), "workspaceId": workspace_id},
                projection={"embedding": 0, "textEmbedding": 0},
            ).sort("startMs", 1)
        )

    def get_segment(self, segment_id: Any, workspace_id: str, *, include_embedding: bool = False) -> dict | None:
        projection = None if include_embedding else {"embedding": 0, "textEmbedding": 0}
        return self.db.segments.find_one({"_id": oid(segment_id), "workspaceId": workspace_id}, projection=projection)

    def update_segment_fields(self, asset_id: Any, workspace_id: str, patch: dict) -> int:
        result = self.db.segments.update_many({"assetId": oid(asset_id), "workspaceId": workspace_id}, {"$set": patch})
        return result.modified_count

    def rewrite_segment_search_text(self, asset_id: Any, workspace_id: str, shared: dict, text_builder) -> None:
        cursor = self.db.segments.find({"assetId": oid(asset_id), "workspaceId": workspace_id}, projection={"embedding": 0, "textEmbedding": 0})
        for segment in cursor:
            search_text = text_builder(segment, shared)
            self.db.segments.update_one(
                {"_id": segment["_id"], "workspaceId": workspace_id},
                {"$set": {**shared, "searchText": search_text, "textStale": True}},
            )

    def aggregate_segments(self, pipeline: list[dict]) -> list[dict]:
        return list(self.db.segments.aggregate(pipeline))

    def find_segments(self, query: dict, sort: list[tuple[str, int]] | None, skip: int, limit: int) -> tuple[list[dict], int]:
        total = self.db.segments.count_documents(query)
        cursor = self.db.segments.find(query, projection={"embedding": 0, "textEmbedding": 0})
        if sort:
            cursor = cursor.sort(sort)
        return list(cursor.skip(skip).limit(limit)), total

    def count_assets_for_segments(self, query: dict) -> int:
        values = self.db.segments.distinct("assetId", query)
        return len(values)

    def segments_by_ids(self, workspace_id: str, ids: list[ObjectId]) -> dict[ObjectId, dict]:
        if not ids:
            return {}
        cursor = self.db.segments.find(
            {"workspaceId": workspace_id, "_id": {"$in": ids}},
            projection={"embedding": 0, "textEmbedding": 0},
        )
        return {item["_id"]: item for item in cursor}

    def facets(self, workspace_id: str) -> dict[str, list]:
        asset_match = {"workspaceId": workspace_id}
        segment_match = {"workspaceId": workspace_id}

        def clean(values: list) -> list:
            return sorted({str(value) for value in values if isinstance(value, str) and value})[:100]

        return {
            "tags": clean(self.db.assets.distinct("tags", asset_match)),
            "sources": clean(self.db.assets.distinct("source", asset_match)),
            "sourceLanguages": clean(self.db.segments.distinct("sourceLanguage", segment_match)),
            "categories": clean(self.db.segments.distinct("categories", segment_match)),
        }

    def insert_saved_search(self, document: dict) -> dict:
        document = dict(document)
        document["createdAt"] = now()
        result = self.db.saved_searches.insert_one(document)
        document["_id"] = result.inserted_id
        return document

    def list_saved_searches(self, workspace_id: str, user_id: str) -> list[dict]:
        return list(
            self.db.saved_searches.find({"workspaceId": workspace_id, "userId": user_id}).sort("createdAt", -1)
        )

    def delete_saved_search(self, search_id: str, workspace_id: str, user_id: str) -> bool:
        result = self.db.saved_searches.delete_one(
            {"_id": oid(search_id), "workspaceId": workspace_id, "userId": user_id}
        )
        return result.deleted_count == 1
