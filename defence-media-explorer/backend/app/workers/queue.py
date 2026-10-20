"""MongoDB-backed ingestion queue.

`ingestion_jobs` is the queue. A worker claims a job with find_one_and_update,
holds a renewable lease, and can publish only while that ownership token is
still valid. Additional worker processes claim the same way; nothing else has
to change to run more than one.

The collection is not a transaction held open across FFmpeg or provider calls.
Each claim, heartbeat, checkpoint, and completion is a single conditional update.
"""

from __future__ import annotations

import random
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

from pymongo import ReturnDocument

from app.config import PIPELINE_VERSION

PERMANENT_CODES = frozenset(
    {
        "DUPLICATE_ASSET",
        "CORRUPT_MEDIA",
        "TEXT_ENCODING_UNSUPPORTED",
        "DURATION_LIMIT_EXCEEDED",
        "EMBEDDING_DIMENSION_MISMATCH",
        "EMBEDDING_MODEL_MISMATCH",
        "FILE_TYPE_UNSUPPORTED",
        "FILE_TYPE_MISMATCH",
        "UPLOAD_TOO_LARGE",
        "UPLOAD_INCOMPLETE",
        "VALIDATION_ERROR",
        "NOT_FOUND",
        "FORBIDDEN",
        "CONFIG_INVALID",
        "PROVIDER_NOT_CONFIGURED",
        "PASSWORD_POLICY",
        "DELETE_INCOMPLETE",
        "COLLECTION_NOT_EMPTY",
    }
)

TRANSIENT_CODES = frozenset(
    {
        "PROVIDER_RATE_LIMITED",
        "PROVIDER_FAILED",
        "MONGODB_UNAVAILABLE",
        "OBJECT_STORAGE_UNAVAILABLE",
        "OBJECT_STORAGE_FAILED",
        "INTERNAL_ERROR",
        "SEARCH_UNAVAILABLE",
        "INDEX_NOT_READY",
    }
)

TERMINAL_STATUSES = ("ready", "partial", "failed")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def is_retryable(code: str, *, hinted: bool | None = None) -> bool:
    """Permanent codes never retry. A provider hint is accepted for the rest."""

    if code in PERMANENT_CODES:
        return False
    if hinted is not None:
        return hinted
    return code in TRANSIENT_CODES


def retry_delay_seconds(attempt: int, settings, rng: Callable[[], float] | None = None) -> float:
    """Exponential backoff with a quarter of the delay as jitter."""

    roll = rng() if rng is not None else random.random()
    base = float(settings.job_retry_base_seconds)
    cap = float(settings.job_retry_max_seconds)
    growth = min(cap, base * (2 ** max(int(attempt) - 1, 0)))
    return growth + (roll * 0.25 * growth)


def original_object_present(asset: dict | None) -> bool:
    """Bytes have a bucket and key. Checksum may still be pending until the upload handler hashes them."""

    if not asset or asset.get("processingStatus") == "uploading":
        return False
    ref = asset.get("originalObject") or {}
    return isinstance(ref, dict) and bool(ref.get("bucket") and ref.get("key"))


def original_available(asset: dict | None) -> bool:
    """A job may be activated only after the original is stored and its checksum is known."""

    if not original_object_present(asset):
        return False
    ref = asset.get("originalObject") or {}
    checksum = ref.get("checksum") or asset.get("sha256")
    return bool(checksum)


def activation_patch(asset: dict | None, *, moment: datetime | None = None) -> dict[str, Any]:
    moment = moment or utcnow()
    if original_available(asset):
        return {
            "activated": True,
            "queueState": "queued",
            "nextRunAt": moment,
            "status": "uploaded",
            "error": None,
            "workerId": None,
            "ownershipToken": None,
            "leaseUntil": None,
        }
    return {
        "activated": False,
        "queueState": "inactive",
        "nextRunAt": None,
        "status": "uploaded",
        "error": None,
        "workerId": None,
        "ownershipToken": None,
        "leaseUntil": None,
    }


def build_ingestion_job(
    *,
    workspace_id: str,
    asset_id: Any,
    generation: int,
    asset: dict | None,
    max_attempts: int,
    pipeline_version: str = PIPELINE_VERSION,
    moment: datetime | None = None,
) -> dict[str, Any]:
    moment = moment or utcnow()
    active = original_available(asset)
    return {
        "workspaceId": workspace_id,
        "assetId": asset_id,
        "status": "uploaded",
        "stage": "uploaded",
        "progress": 0,
        "generation": generation,
        "pipelineVersion": pipeline_version,
        "attempts": 0,
        "maxAttempts": max_attempts,
        "activated": active,
        "queueState": "queued" if active else "inactive",
        "nextRunAt": moment if active else None,
        "workerId": None,
        "leaseUntil": None,
        "heartbeatAt": None,
        "ownershipToken": None,
        "startedAt": None,
        "finishedAt": None,
        "steps": [],
        "checkpoints": {},
        "error": None,
        "warnings": [],
        "dedupeKey": f"{asset_id}:{generation}",
        "createdAt": moment,
    }


def make_segment_key(
    asset_id: Any,
    generation: int,
    segment_type: str,
    start_ms: int | None,
    end_ms: int | None,
    start_char: int | None,
    end_char: int | None,
) -> str:
    """Stable id for one searchable unit. Replays upsert this key instead of inserting another row."""

    def part(value: int | None) -> str:
        return "" if value is None else str(int(value))

    return ":".join(
        [
            str(asset_id),
            str(int(generation)),
            segment_type or "",
            part(start_ms),
            part(end_ms),
            part(start_char),
            part(end_char),
        ]
    )


@dataclass
class Claim:
    job_id: Any
    worker_id: str
    ownership_token: str
    lease_until: datetime
    attempts: int


class JobQueue:
    def __init__(self, collection, settings, rng: Callable[[], float] | None = None) -> None:
        self.collection = collection
        self.settings = settings
        self.rng = rng

    def claim(self, worker_id: str, now: datetime | None = None) -> Claim | None:
        now = now or utcnow()
        token = secrets.token_hex(16)
        lease_until = now + timedelta(seconds=int(self.settings.job_lease_seconds))
        document = self.collection.find_one_and_update(
            self._claim_filter(now),
            {
                "$set": {
                    "queueState": "leased",
                    "workerId": worker_id,
                    "ownershipToken": token,
                    "leaseUntil": lease_until,
                    "heartbeatAt": now,
                    "updatedAt": now,
                },
                "$inc": {"attempts": 1},
            },
            sort=[("nextRunAt", 1), ("createdAt", 1)],
            return_document=ReturnDocument.AFTER,
        )
        if document is None:
            return None
        if document.get("startedAt") is None:
            self.collection.update_one(
                {"_id": document["_id"], "ownershipToken": token, "startedAt": None},
                {"$set": {"startedAt": now}},
            )
        return Claim(
            job_id=document["_id"],
            worker_id=worker_id,
            ownership_token=token,
            lease_until=lease_until,
            attempts=int(document.get("attempts") or 1),
        )

    def heartbeat(self, claim: Claim, now: datetime | None = None) -> bool:
        now = now or utcnow()
        lease_until = now + timedelta(seconds=int(self.settings.job_lease_seconds))
        result = self.collection.update_one(
            self._owner_filter(claim, now),
            {"$set": {"heartbeatAt": now, "leaseUntil": lease_until, "updatedAt": now}},
        )
        if result.modified_count != 1:
            return False
        claim.lease_until = lease_until
        return True

    def still_owner(self, claim: Claim, now: datetime | None = None) -> bool:
        now = now or utcnow()
        return self.collection.find_one(self._owner_filter(claim, now)) is not None

    def touch(self, claim: Claim, status: str, progress: int, steps: list, now: datetime | None = None) -> bool:
        now = now or utcnow()
        result = self.collection.update_one(
            self._owner_filter(claim, now),
            {
                "$set": {
                    "status": status,
                    "stage": status,
                    "progress": progress,
                    "steps": steps,
                    "error": None,
                    "updatedAt": now,
                }
            },
        )
        return result.modified_count == 1

    def checkpoint(self, claim: Claim, stage: str, progress: int, payload: dict, now: datetime | None = None) -> bool:
        now = now or utcnow()
        block = dict(payload)
        block["done"] = True
        block["at"] = now
        result = self.collection.update_one(
            self._owner_filter(claim, now),
            {
                "$set": {
                    f"checkpoints.{stage}": block,
                    "stage": stage,
                    "status": stage,
                    "progress": progress,
                    "updatedAt": now,
                }
            },
        )
        return result.modified_count == 1

    def complete(self, claim: Claim, patch: dict, now: datetime | None = None) -> bool:
        now = now or utcnow()
        fields = {
            key: value
            for key, value in patch.items()
            if key not in {"workerId", "ownershipToken", "leaseUntil", "queueState"}
        }
        fields.update(
            {
                "queueState": "done",
                "finishedAt": now,
                "workerId": None,
                "ownershipToken": None,
                "leaseUntil": None,
                "heartbeatAt": now,
                "updatedAt": now,
                "progress": int(patch.get("progress", 100)),
            }
        )
        result = self.collection.update_one(self._owner_filter(claim, now), {"$set": fields})
        return result.modified_count == 1

    def fail(self, claim: Claim, code: str, params: dict, retryable: bool, now: datetime | None = None) -> str:
        now = now or utcnow()
        current = self.collection.find_one({"_id": claim.job_id})
        if current is None:
            return "lost"
        attempts = int(current.get("attempts") or 1)
        max_attempts = int(current.get("maxAttempts") or self.settings.job_max_attempts)
        if retryable and attempts < max_attempts:
            delay = retry_delay_seconds(attempts, self.settings, self.rng)
            fields = {
                "queueState": "retry_wait",
                "status": "retrying",
                "error": {"code": code, "params": params, "retryable": True},
                "nextRunAt": now + timedelta(seconds=delay),
                "workerId": None,
                "ownershipToken": None,
                "leaseUntil": None,
                "heartbeatAt": None,
                "updatedAt": now,
            }
            result = self.collection.update_one(self._owner_filter(claim, now), {"$set": fields})
            return "retry" if result.modified_count == 1 else "lost"
        fields = {
            "queueState": "failed",
            "status": "failed",
            "error": {"code": code, "params": params, "retryable": False},
            "finishedAt": now,
            "nextRunAt": None,
            "workerId": None,
            "ownershipToken": None,
            "leaseUntil": None,
            "heartbeatAt": None,
            "updatedAt": now,
        }
        result = self.collection.update_one(self._owner_filter(claim, now), {"$set": fields})
        return "terminal" if result.modified_count == 1 else "lost"

    def deactivate(self, claim: Claim, now: datetime | None = None) -> bool:
        now = now or utcnow()
        result = self.collection.update_one(
            self._owner_filter(claim, now),
            {
                "$set": {
                    "activated": False,
                    "queueState": "inactive",
                    "status": "uploaded",
                    "nextRunAt": None,
                    "workerId": None,
                    "ownershipToken": None,
                    "leaseUntil": None,
                    "updatedAt": now,
                }
            },
        )
        return result.modified_count == 1

    def _claim_filter(self, now: datetime) -> dict[str, Any]:
        return {
            "activated": True,
            "nextRunAt": {"$lte": now},
            "status": {"$nin": list(TERMINAL_STATUSES)},
            "$or": [
                {
                    "queueState": {"$in": ["queued", "retry_wait"]},
                    "$or": [{"leaseUntil": None}, {"leaseUntil": {"$lte": now}}],
                },
                {"queueState": "leased", "leaseUntil": {"$lte": now}},
            ],
        }

    def _owner_filter(self, claim: Claim, now: datetime) -> dict[str, Any]:
        return {
            "_id": claim.job_id,
            "workerId": claim.worker_id,
            "ownershipToken": claim.ownership_token,
            "queueState": "leased",
            "leaseUntil": {"$gt": now},
        }


def publish_documents(queue: JobQueue, claim: Claim, repo, documents: list[dict], patch: dict, now: datetime | None = None) -> bool:
    """Write segment rows only while this worker still owns the job.

    If ownership is lost after the write, rows stamped with this token are removed.
    Rows another owner has already replaced use a different token and stay.
    """

    now = now or utcnow()
    if not queue.still_owner(claim, now):
        return False
    stamped = []
    for document in documents:
        row = dict(document)
        row["publishToken"] = claim.ownership_token
        stamped.append(row)
    repo.insert_segments(stamped)
    if not queue.complete(claim, patch, now):
        repo.delete_segments_by_token(claim.ownership_token)
        return False
    return True
