"""Queue behaviour without Redis, Celery, Atlas, or a model provider."""

from __future__ import annotations

import copy
import subprocess
import sys
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path

from app.config import Settings
from app.providers.voyage import _check_vector
from app.errors import ProviderError
from app.workers.loop import disk_has_room
from app.workers.queue import (
    JobQueue,
    activation_patch,
    is_retryable,
    original_available,
    publish_documents,
)

ROOT = Path(__file__).resolve().parents[1]
T0 = datetime(2026, 10, 20, 12, 0, tzinfo=timezone.utc)


def _settings() -> Settings:
    return Settings(
        _env_file=None,
        mongodb_uri="",
        session_secret="unit-test-session-secret",
        job_lease_seconds=30,
        job_max_attempts=3,
        job_retry_base_seconds=2,
        job_retry_max_seconds=60,
        job_poll_interval_seconds=0.01,
        job_idle_backoff_seconds=0.05,
        max_temp_disk_mb=1,
    )


class MemoryCollection:
    def __init__(self) -> None:
        self.docs: list[dict] = []
        self.lock = threading.Lock()

    def insert_one(self, document):
        with self.lock:
            doc = copy.deepcopy(document)
            self.docs.append(doc)
            return doc

    def find_one(self, query, projection=None):
        with self.lock:
            for doc in self.docs:
                if _matches(doc, query):
                    return copy.deepcopy(doc)
        return None

    def find_one_and_update(self, query, update, sort=None, return_document=None):
        with self.lock:
            matches = [doc for doc in self.docs if _matches(doc, query)]
            if sort:
                matches.sort(key=lambda doc: tuple(_sort_value(doc.get(field)) for field, _direction in sort))
            if not matches:
                return None
            _apply_update(matches[0], update)
            return copy.deepcopy(matches[0])

    def update_one(self, query, update):
        with self.lock:
            for doc in self.docs:
                if _matches(doc, query):
                    _apply_update(doc, update)

                    class Result:
                        modified_count = 1
                        matched_count = 1

                    return Result()

            class Empty:
                modified_count = 0
                matched_count = 0

            return Empty()


class MemorySegments:
    def __init__(self) -> None:
        self.rows: list[dict] = []

    def insert_segments(self, documents):
        for document in documents:
            key = document.get("segmentKey")
            if not key:
                self.rows.append(document)
                continue
            self.rows = [row for row in self.rows if row.get("segmentKey") != key]
            self.rows.append(document)

    def delete_segments_by_token(self, token):
        before = len(self.rows)
        self.rows = [row for row in self.rows if row.get("publishToken") != token]
        return before - len(self.rows)


def _job(**overrides) -> dict:
    document = {
        "_id": overrides.pop("_id", "job-1"),
        "activated": True,
        "queueState": "queued",
        "status": "uploaded",
        "nextRunAt": T0,
        "leaseUntil": None,
        "createdAt": T0,
        "attempts": 0,
        "maxAttempts": 3,
        "checkpoints": {},
        "workerId": None,
        "ownershipToken": None,
    }
    document.update(overrides)
    return document


def test_atomic_claim_and_lost_ownership_does_not_publish():
    collection = MemoryCollection()
    collection.insert_one(_job())
    queue = JobQueue(collection, _settings(), rng=lambda: 0)
    first = queue.claim("worker-a", T0)
    assert first is not None
    assert first.attempts == 1
    assert queue.claim("worker-b", T0) is None
    later = T0 + timedelta(seconds=31)
    second = queue.claim("worker-b", later)
    assert second is not None
    assert second.ownership_token != first.ownership_token
    assert queue.heartbeat(first, later) is False
    assert queue.complete(first, {"status": "ready", "progress": 100}, later) is False
    repo = MemorySegments()
    published = publish_documents(
        queue,
        first,
        repo,
        [{"segmentKey": "asset:1:image::::", "text": "stale"}],
        {"status": "ready", "progress": 100},
        later,
    )
    assert published is False
    assert repo.rows == []
    assert queue.still_owner(second, later) is True


def test_publish_after_lease_loss_rolls_back_stale_rows():
    collection = MemoryCollection()
    collection.insert_one(_job())
    queue = JobQueue(collection, _settings(), rng=lambda: 0)
    claim = queue.claim("worker-a", T0)
    repo = MemorySegments()
    original_insert = repo.insert_segments

    def insert_segments(documents):
        original_insert(documents)
        collection.update_one({"_id": claim.job_id}, {"$set": {"leaseUntil": T0}})

    repo.insert_segments = insert_segments
    published = publish_documents(
        queue,
        claim,
        repo,
        [{"segmentKey": "asset:1:image::::", "text": "late"}],
        {"status": "ready"},
        T0 + timedelta(seconds=5),
    )
    assert published is False
    assert repo.rows == []
    stored = collection.find_one({"_id": "job-1"})
    assert stored["status"] != "ready"


def test_abandoned_lease_can_be_recovered():
    collection = MemoryCollection()
    collection.insert_one(_job())
    queue = JobQueue(collection, _settings(), rng=lambda: 0)
    first = queue.claim("worker-a", T0)
    expired = T0 + timedelta(seconds=31)
    assert queue.still_owner(first, expired) is False
    recovered = queue.claim("worker-b", expired)
    assert recovered is not None
    assert recovered.worker_id == "worker-b"
    assert queue.heartbeat(recovered, expired) is True
    assert queue.complete(recovered, {"status": "ready", "progress": 100}, expired + timedelta(seconds=1)) is True


def test_duplicate_publish_keeps_one_segment():
    repo = MemorySegments()
    row = {"segmentKey": "asset:1:image::::", "generation": 1, "text": "one"}
    repo.insert_segments([row])
    repo.insert_segments([{**row, "text": "one"}])
    assert len(repo.rows) == 1
    assert repo.rows[0]["segmentKey"] == row["segmentKey"]


def test_transient_failure_retries_with_backoff_and_permanent_is_terminal():
    settings = _settings()
    collection = MemoryCollection()
    collection.insert_one(_job())
    queue = JobQueue(collection, settings, rng=lambda: 0)
    moment = T0
    for attempt in (1, 2):
        claim = queue.claim("worker-a", moment)
        assert claim is not None
        outcome = queue.fail(claim, "PROVIDER_RATE_LIMITED", {"provider": "voyage"}, True, moment)
        assert outcome == "retry"
        stored = collection.find_one({"_id": "job-1"})
        assert stored["status"] == "retrying"
        assert stored["queueState"] == "retry_wait"
        expected = moment + timedelta(seconds=2 * (2 ** (attempt - 1)))
        assert stored["nextRunAt"] == expected
        assert queue.claim("worker-b", moment) is None
        moment = expected
    claim = queue.claim("worker-a", moment)
    outcome = queue.fail(claim, "PROVIDER_RATE_LIMITED", {"provider": "voyage"}, True, moment)
    assert outcome == "terminal"
    stored = collection.find_one({"_id": "job-1"})
    assert stored["status"] == "failed"
    assert stored["queueState"] == "failed"
    assert queue.claim("worker-a", moment + timedelta(hours=1)) is None

    collection.docs.clear()
    collection.insert_one(_job(_id="job-permanent"))
    claim = queue.claim("worker-a", T0)
    outcome = queue.fail(claim, "CORRUPT_MEDIA", {}, False, T0)
    assert outcome == "terminal"
    assert collection.find_one({"_id": "job-permanent"})["status"] == "failed"
    assert is_retryable("EMBEDDING_DIMENSION_MISMATCH", hinted=True) is False
    assert is_retryable("EMBEDDING_MODEL_MISMATCH") is False
    assert is_retryable("PROVIDER_RATE_LIMITED", hinted=True) is True


def test_model_and_dimension_mismatch_stay_permanent():
    try:
        _check_vector([0.1, 0.2], 1024, "voyage-multimodal-3.5", "voyage-multimodal-3.5")
    except ProviderError as exc:
        assert exc.code == "EMBEDDING_DIMENSION_MISMATCH"
        assert exc.retryable is False
    else:
        raise AssertionError("dimension mismatch was accepted")
    try:
        _check_vector([0.1] * 1024, 1024, "voyage-multimodal-3.5", "other-model")
    except ProviderError as exc:
        assert exc.code == "EMBEDDING_MODEL_MISMATCH"
        assert exc.retryable is False
    else:
        raise AssertionError("model mismatch was accepted")


def test_job_is_not_activated_before_the_original_is_available():
    uploading = {
        "processingStatus": "uploading",
        "originalObject": {"gridfsId": "abc123", "key": "original.bin"},
        "sha256": None,
    }
    assert original_available(uploading) is False
    assert activation_patch(uploading, moment=T0)["activated"] is False
    legacy = {
        "processingStatus": "uploaded",
        "originalObject": {"bucket": "media", "key": "original.bin", "checksum": "abc"},
        "sha256": "abc",
    }
    assert original_available(legacy) is False
    stored = {
        "processingStatus": "uploaded",
        "originalObject": {"gridfsId": "abc123", "key": "original.bin", "checksum": "abc"},
        "sha256": "abc",
    }
    assert original_available(stored) is True
    patch = activation_patch(stored, moment=T0)
    assert patch["activated"] is True
    assert patch["queueState"] == "queued"

    collection = MemoryCollection()
    collection.insert_one(_job(activated=False, queueState="inactive", nextRunAt=T0, status="uploaded"))
    queue = JobQueue(collection, _settings(), rng=lambda: 0)
    assert queue.claim("worker-a", T0) is None


def test_request_path_does_not_import_redis_or_celery():
    app_root = ROOT / "app"
    for path in app_root.rglob("*.py"):
        text = path.read_text(encoding="utf-8")
        assert "import celery" not in text
        assert "from celery" not in text
        assert "import redis" not in text
        assert "from redis" not in text
    script = (
        "import app.api.routes, app.health, app.main, sys\n"
        "bad = [name for name in sys.modules if name == 'celery' or name.startswith('celery.') or name == 'redis' or name.startswith('redis.')]\n"
        "raise SystemExit(len(bad))\n"
    )
    completed = subprocess.run([sys.executable, "-c", script], cwd=ROOT, capture_output=True, text=True)
    assert completed.returncode == 0, completed.stderr[-500:]


def test_temp_disk_limit_is_enforced(tmp_path: Path):
    assert disk_has_room(tmp_path, 1) is True
    assert disk_has_room(tmp_path, 10**9) is False


def _matches(document: dict, query: dict) -> bool:
    for key, expected in query.items():
        if key == "$or":
            if not any(_matches(document, clause) for clause in expected):
                return False
            continue
        if key == "$and":
            if not all(_matches(document, clause) for clause in expected):
                return False
            continue
        value = document.get(key, None)
        if isinstance(expected, dict) and any(str(op).startswith("$") for op in expected):
            for op, operand in expected.items():
                if op == "$lte" and (value is None or value > operand):
                    return False
                if op == "$gt" and (value is None or value <= operand):
                    return False
                if op == "$in" and value not in operand:
                    return False
                if op == "$nin" and value in operand:
                    return False
                if op == "$eq" and value != operand:
                    return False
        elif value != expected:
            return False
    return True


def _apply_update(document: dict, update: dict) -> None:
    for key, value in (update.get("$set") or {}).items():
        _set_path(document, key, copy.deepcopy(value))
    for key, value in (update.get("$inc") or {}).items():
        document[key] = int(document.get(key) or 0) + int(value)


def _set_path(document: dict, key: str, value) -> None:
    if "." not in key:
        document[key] = value
        return
    cursor = document
    parts = key.split(".")
    for part in parts[:-1]:
        nxt = cursor.get(part)
        if not isinstance(nxt, dict):
            nxt = {}
            cursor[part] = nxt
        cursor = nxt
    cursor[parts[-1]] = value


def _sort_value(value):
    if value is None:
        return (0, 0)
    if isinstance(value, datetime):
        return (1, value.timestamp())
    return (1, value)
