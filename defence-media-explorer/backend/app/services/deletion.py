"""Delete originals, derivatives, segments, and jobs together."""

from __future__ import annotations

from app.errors import AppError


def delete_asset_completely(repo, storage, asset: dict, workspace_id: str) -> None:
    prefix = f"workspaces/{workspace_id}/assets/{asset['_id']}/"
    try:
        keys = storage.list_prefix(prefix)
        for key in keys:
            storage.delete(key)
        remaining = storage.list_prefix(prefix)
    except AppError as exc:
        raise AppError("DELETE_INCOMPLETE", 502, {"errorCode": exc.code}) from exc
    if remaining:
        raise AppError("DELETE_INCOMPLETE", 502, {"remaining": len(remaining)})
    deleted = repo.delete_asset_tree(asset["_id"], workspace_id)
    if deleted is None:
        raise AppError("NOT_FOUND", 404, {})
