from app.errors import AppError
from app.services.deletion import delete_asset_completely
from tests.test_pipeline import MemoryRepo, MemoryStorage


def test_delete_removes_objects_segments_and_asset():
    storage = MemoryStorage()
    repo = MemoryRepo()
    storage.objects["workspaces/ws-a/assets/asset-1/original/a.jpg"] = b"a"
    storage.objects["workspaces/ws-a/assets/asset-1/derivatives/thumbnail.jpg"] = b"b"
    storage.objects["workspaces/ws-b/assets/asset-9/original/a.jpg"] = b"keep"
    repo.assets["asset-1"] = {"_id": "asset-1", "workspaceId": "ws-a"}
    repo.jobs["job"] = {"_id": "job", "assetId": "asset-1", "workspaceId": "ws-a"}
    repo.segments.append({"assetId": "asset-1", "workspaceId": "ws-a", "generation": 1})
    # MemoryRepo.delete_asset_tree is not implemented; use a small adapter.
    class Repo(MemoryRepo):
        def delete_asset_tree(self, asset_id, workspace_id):
            asset = self.get_asset(asset_id, workspace_id)
            self.segments = [item for item in self.segments if item["assetId"] != asset_id]
            self.jobs = {key: value for key, value in self.jobs.items() if value["assetId"] != asset_id}
            self.assets.pop(str(asset_id), None)
            return asset

    wrapped = Repo()
    wrapped.assets = repo.assets
    wrapped.jobs = repo.jobs
    wrapped.segments = repo.segments
    delete_asset_completely(wrapped, storage, wrapped.assets["asset-1"], "ws-a")
    assert storage.objects == {"workspaces/ws-b/assets/asset-9/original/a.jpg": b"keep"}
    assert wrapped.assets == {}
    assert wrapped.segments == []


def test_delete_reports_incomplete_when_storage_fails():
    class Boom(MemoryStorage):
        def delete(self, key: str) -> None:
            raise AppError("OBJECT_STORAGE_FAILED", 502, {"operation": "delete"})

    storage = Boom()
    storage.objects["workspaces/ws-a/assets/asset-1/original/a.jpg"] = b"a"
    repo = MemoryRepo()
    repo.assets["asset-1"] = {"_id": "asset-1", "workspaceId": "ws-a"}
    try:
        delete_asset_completely(repo, storage, repo.assets["asset-1"], "ws-a")
    except AppError as exc:
        assert exc.code == "DELETE_INCOMPLETE"
    else:
        raise AssertionError("expected DELETE_INCOMPLETE")
    assert "asset-1" in repo.assets
