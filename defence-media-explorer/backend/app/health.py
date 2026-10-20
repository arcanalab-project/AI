"""Capability report. Missing credentials are named; they are not replaced."""

from __future__ import annotations

from typing import Any

from pymongo.errors import PyMongoError

from app.config import Settings
from app.db.client import ping
from app.db.indexes import list_index_status


def diagnose(settings: Settings, client=None) -> dict[str, Any]:
    mongo: dict[str, Any] = {"configured": settings.mongodb_configured, "reachable": False, "database": settings.mongodb_database}
    version = None
    if settings.mongodb_configured and client is not None:
        version = ping(client)
        mongo["reachable"] = version is not None
        if version:
            mongo["serverVersion"] = version
        else:
            mongo["errorCode"] = "MONGODB_UNAVAILABLE"
        if mongo["reachable"]:
            try:
                mongo["search"] = list_index_status(client, settings)
            except PyMongoError:
                mongo["search"] = {"errorCode": "SEARCH_UNAVAILABLE"}
    elif not settings.mongodb_configured:
        mongo["errorCode"] = "MONGODB_UNAVAILABLE"

    storage = {
        "configured": settings.object_storage_configured,
        "bucket": settings.s3_bucket if settings.object_storage_configured else None,
        "publicEndpointConfigured": bool(settings.s3_public_endpoint),
    }
    if not settings.object_storage_configured:
        storage["errorCode"] = "OBJECT_STORAGE_UNAVAILABLE"

    queue_state = {
        "configured": settings.mongodb_configured,
        "reachable": bool(mongo.get("reachable")),
        "backend": "ingestion_jobs",
    }
    if not queue_state["reachable"]:
        queue_state["errorCode"] = "MONGODB_UNAVAILABLE"
    capabilities = {
        "mongodb": mongo,
        "objectStorage": storage,
        "embeddings": {
            "configured": settings.embeddings_configured,
            "model": settings.voyage_multimodal_model,
            "dimensions": settings.embedding_dimensions,
            "textChannelEnabled": settings.enable_text_embeddings,
            "textModel": settings.voyage_text_model if settings.enable_text_embeddings else None,
            **({} if settings.embeddings_configured else {"errorCode": "PROVIDER_NOT_CONFIGURED"}),
        },
        "vision": {
            "configured": settings.vision_configured,
            "model": settings.vision_model,
            **({} if settings.vision_configured else {"errorCode": "PROVIDER_NOT_CONFIGURED"}),
        },
        "transcription": {
            "configured": settings.transcription_configured,
            "model": settings.transcription_model,
            **({} if settings.transcription_configured else {"errorCode": "PROVIDER_NOT_CONFIGURED"}),
        },
        "rerank": {
            "enabled": settings.enable_rerank,
            "configured": settings.embeddings_configured,
            "model": settings.voyage_rerank_model,
        },
        "queue": queue_state,
        "session": {"configured": settings.session_configured},
    }
    unavailable = [
        name
        for name, value in (
            ("mongodb", not mongo["reachable"]),
            ("objectStorage", not settings.object_storage_configured),
            ("embeddings", not settings.embeddings_configured),
            ("vision", not settings.vision_configured),
            ("transcription", not settings.transcription_configured),
            ("queue", not queue_state.get("reachable")),
            ("session", not settings.session_configured),
        )
        if value
    ]
    return {
        "status": "ok" if not unavailable else "degraded",
        "environment": settings.app_env,
        "database": settings.mongodb_database,
        "capabilities": capabilities,
        "unavailable": unavailable,
        "serverVersion": version,
    }
