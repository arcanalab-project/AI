"""GridFS playback, ranges, and legacy object-storage jobs. No Atlas connection."""

from datetime import datetime, timedelta, timezone

from app.config import Settings
from app.media.playback import playback_url
from app.media.ranges import parse_byte_range
from app.pipeline.runner import process_job
from app.preflight import config_problems
from app.workers.queue import is_legacy_object_storage, is_retryable
from app.workers.status import worker_view


def _settings() -> Settings:
    return Settings(
        _env_file=None,
        mongodb_uri="",
        session_secret="unit-test-session-secret",
        job_heartbeat_seconds=20,
    )


def test_byte_range_covers_prefix_and_suffix():
    assert parse_byte_range(None, 10) is None
    assert parse_byte_range("bytes=0-3", 10) == (0, 3)
    assert parse_byte_range("bytes=0-", 10) == (0, 9)
    assert parse_byte_range("bytes=-4", 10) == (6, 9)
    try:
        parse_byte_range("bytes=20-21", 10)
    except ValueError:
        pass
    else:
        raise AssertionError("unsatisfiable range was accepted")


def test_playback_url_uses_gridfs_id_and_leaves_legacy_unsigned():
    assert playback_url({"gridfsId": "abc", "key": "workspaces/demo/a.mp4"}) == "/api/media/gridfs/abc"
    assert playback_url({"bucket": "media", "key": "workspaces/demo/a.mp4"}) is None
    assert playback_url({"bucket": "local", "key": "fixtures/synthetic/training-block.mp4"}) == (
        "/api/media/fixtures/training-block.mp4"
    )


def test_worker_view_goes_stale():
    moment = datetime(2026, 10, 20, 12, 0, tzinfo=timezone.utc)
    fresh = worker_view({"heartbeatAt": moment - timedelta(seconds=5)}, _settings(), moment)
    assert fresh["alive"] is True
    stale = worker_view({"heartbeatAt": moment - timedelta(seconds=90)}, _settings(), moment)
    assert stale["alive"] is False
    assert "workerId" not in fresh


def test_legacy_object_does_not_retry_or_erase_a_ready_asset(tmp_path):
    assert is_legacy_object_storage({"bucket": "old", "key": "a.bin"}) is True
    assert is_legacy_object_storage({"gridfsId": "abc", "bucket": "old", "key": "a.bin"}) is False
    assert is_retryable("LEGACY_OBJECT_STORAGE", hinted=True) is False

    class Repo:
        def __init__(self):
            self.asset = {
                "_id": "asset-1",
                "workspaceId": "ws",
                "processingStatus": "ready",
                "generation": 2,
                "originalObject": {"bucket": "old", "key": "kept.bin"},
            }
            self.job = {
                "_id": "job-1",
                "assetId": "asset-1",
                "workspaceId": "ws",
                "generation": 3,
                "status": "uploaded",
                "steps": [],
            }

        def get_job(self, job_id):
            return self.job

        def get_asset(self, asset_id, workspace_id):
            if asset_id == self.asset["_id"] and workspace_id == self.asset["workspaceId"]:
                return self.asset
            return None

        def update_job(self, job_id, patch):
            self.job.update(patch)

        def update_asset(self, asset_id, workspace_id, patch):
            self.asset.update(patch)
            return self.asset

    class Storage:
        def __init__(self):
            self.deleted = []

        def delete(self, key):
            self.deleted.append(key)

        def delete_prefix(self, prefix):
            self.deleted.append(prefix)
            return []

    repo = Repo()
    storage = Storage()
    from app.pipeline.runner import PipelineDeps

    deps = PipelineDeps(_settings(), repo, storage, None, None, None, tmp_path)
    process_job("job-1", deps)
    assert repo.job["status"] == "failed"
    assert repo.job["error"]["code"] == "LEGACY_OBJECT_STORAGE"
    assert repo.asset["processingStatus"] == "ready"
    assert storage.deleted == []


def test_preflight_names_missing_config_without_reading_a_secret():
    settings = Settings(
        _env_file=None,
        mongodb_uri="",
        mongodb_database="defence_media_explorer",
        session_secret="short",
        voyage_api_key="",
    )
    text = "\n".join(config_problems(settings))
    assert "MONGODB_URI" in text
    assert "SESSION_SECRET" in text
    assert "VOYAGE_API_KEY" in text
    assert "mongodb" + "://" not in text
