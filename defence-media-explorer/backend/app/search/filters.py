"""One structured filter document shared by browse, $search, and $vectorSearch."""

from __future__ import annotations

from datetime import datetime
from typing import Any


def build_metadata_filter(
    workspace_id: str,
    filters: dict[str, Any] | None,
    *,
    default_statuses: list[str] | None = None,
    apply_default_status: bool = True,
) -> dict[str, Any]:
    """Return a MongoDB match document. workspaceId is always included."""

    filters = filters or {}
    clauses: list[dict[str, Any]] = [{"workspaceId": workspace_id}]

    statuses = filters.get("processingStatuses") or []
    if statuses:
        clauses.append({"processingStatus": {"$in": list(statuses)}})
    elif apply_default_status:
        clauses.append({"processingStatus": {"$in": list(default_statuses or ["ready", "partial"])}})

    media_types = filters.get("mediaTypes") or []
    if media_types:
        clauses.append({"mediaType": {"$in": list(media_types)}})

    collection_ids = filters.get("collectionIds") or []
    if collection_ids:
        clauses.append({"collectionId": {"$in": list(collection_ids)}})

    sources = filters.get("sources") or []
    if sources:
        clauses.append({"source": {"$in": list(sources)}})

    tags = filters.get("tags") or []
    if tags:
        clauses.append({"tags": {"$in": list(tags)}})

    categories = filters.get("categories") or []
    if categories:
        clauses.append({"categories": {"$in": list(categories)}})

    languages = filters.get("sourceLanguages") or []
    if languages:
        clauses.append({"sourceLanguage": {"$in": list(languages)}})

    date_field = filters.get("dateField") or "capturedAt"
    if date_field not in {"capturedAt", "uploadedAt"}:
        date_field = "capturedAt"
    start = filters.get("dateFrom")
    end = filters.get("dateTo")
    unknown = filters.get("unknownCapture") or "include"
    date_clause = _date_clause(date_field, start, end, unknown)
    if date_clause:
        clauses.append(date_clause)

    if len(clauses) == 1:
        return clauses[0]
    return {"$and": clauses}


def _date_clause(
    date_field: str,
    start: datetime | None,
    end: datetime | None,
    unknown: str,
) -> dict[str, Any] | None:
    range_query: dict[str, Any] = {}
    if isinstance(start, datetime):
        range_query["$gte"] = start
    if isinstance(end, datetime):
        range_query["$lte"] = end

    if date_field == "uploadedAt":
        clauses: list[dict[str, Any]] = []
        if range_query:
            clauses.append({"uploadedAt": range_query})
        if unknown == "only":
            clauses.append({"captureDateUnknown": True})
        elif unknown == "exclude":
            clauses.append({"captureDateUnknown": False})
        if not clauses:
            return None
        if len(clauses) == 1:
            return clauses[0]
        return {"$and": clauses}

    # Capture date. Unknown instants are not silently treated as the upload time.
    if unknown == "only":
        return {"captureDateUnknown": True}
    known = {"captureDateUnknown": False}
    if range_query:
        known = {"capturedAt": range_query, "captureDateUnknown": False}
    if unknown == "exclude":
        return known if range_query or unknown == "exclude" else {"captureDateUnknown": False}
    if not range_query and unknown == "include":
        return None
    if range_query and unknown == "include":
        return {"$or": [known, {"captureDateUnknown": True}]}
    if range_query:
        return known
    return None


def workspace_guard(document: dict[str, Any] | None, workspace_id: str) -> bool:
    return bool(document) and document.get("workspaceId") == workspace_id
