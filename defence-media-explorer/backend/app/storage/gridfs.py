"""Originals and derivatives in MongoDB GridFS.

Bytes go to the driver's standard GridFS bucket. The asset or segment document
stores the file id, not the bytes and not a base64 blob.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Iterator

from bson import ObjectId
from bson.errors import InvalidId
from gridfs.errors import NoFile
from pymongo.errors import PyMongoError

from app.errors import AppError

BUCKET = "media"


def workspace_from_key(key: str) -> str | None:
    parts = key.split("/")
    if len(parts) >= 2 and parts[0] == "workspaces" and parts[1]:
        return parts[1]
    return None


class GridFSStore:
    def __init__(self, database) -> None:
        from gridfs import GridFSBucket

        self.database = database
        self.bucket = GridFSBucket(database, bucket_name=BUCKET)

    def put_file(self, key: str, path: Path, content_type: str) -> dict:
        try:
            with path.open("rb") as handle:
                file_id = self.bucket.upload_from_stream(
                    key,
                    handle,
                    metadata={
                        "contentType": content_type,
                        "workspaceId": workspace_from_key(key),
                        "filename": key,
                    },
                )
        except PyMongoError as exc:
            raise AppError("OBJECT_STORAGE_FAILED", 502, {"operation": "put"}) from exc
        return {
            "gridfsId": str(file_id),
            "filename": key,
            "key": key,
            "mimeType": content_type,
            "byteSize": path.stat().st_size,
        }

    def download(self, obj: dict, dest: Path) -> Path:
        file_id = (obj or {}).get("gridfsId")
        if not file_id:
            if (obj or {}).get("bucket") and (obj or {}).get("key"):
                raise AppError("LEGACY_OBJECT_STORAGE", 409, {})
            raise AppError("OBJECT_STORAGE_FAILED", 502, {"operation": "download"})
        dest.parent.mkdir(parents=True, exist_ok=True)
        try:
            with dest.open("wb") as handle:
                self.bucket.download_to_stream(_object_id(file_id), handle)
        except NoFile as exc:
            raise AppError("NOT_FOUND", 404, {}) from exc
        except AppError:
            raise
        except PyMongoError as exc:
            raise AppError("OBJECT_STORAGE_FAILED", 502, {"operation": "download"}) from exc
        return dest

    def delete(self, key: str) -> None:
        try:
            for item in self.bucket.find({"filename": key}):
                self.bucket.delete(item._id)
        except PyMongoError as exc:
            raise AppError("OBJECT_STORAGE_FAILED", 502, {"operation": "delete"}) from exc

    def list_prefix(self, prefix: str) -> list[str]:
        if not prefix:
            return []
        try:
            cursor = self.bucket.find({"filename": {"$regex": "^" + re.escape(prefix)}})
            return [item.filename for item in cursor if item.filename]
        except PyMongoError as exc:
            raise AppError("OBJECT_STORAGE_FAILED", 502, {"operation": "list"}) from exc

    def delete_prefix(self, prefix: str) -> list[str]:
        keys = self.list_prefix(prefix)
        for key in keys:
            self.delete(key)
        return keys

    def info(self, file_id: str) -> dict | None:
        try:
            oid = _object_id(file_id)
        except AppError:
            return None
        try:
            stream = self.bucket.open_download_stream(oid)
        except NoFile:
            return None
        except PyMongoError as exc:
            raise AppError("OBJECT_STORAGE_FAILED", 502, {"operation": "info"}) from exc
        try:
            meta = stream.metadata or {}
            return {
                "gridfsId": str(stream._id),
                "length": int(stream.length),
                "contentType": meta.get("contentType") or "application/octet-stream",
                "workspaceId": meta.get("workspaceId"),
                "filename": stream.filename,
            }
        finally:
            stream.close()

    def iter_bytes(self, file_id: str, start: int, length: int) -> Iterator[bytes]:
        stream = self.bucket.open_download_stream(_object_id(file_id))
        try:
            if start:
                stream.seek(start)
            remaining = length
            while remaining > 0:
                chunk = stream.read(min(64 * 1024, remaining))
                if not chunk:
                    break
                remaining -= len(chunk)
                yield chunk
        finally:
            stream.close()


def _object_id(value: str) -> ObjectId:
    try:
        return ObjectId(str(value))
    except (InvalidId, TypeError) as exc:
        raise AppError("NOT_FOUND", 404, {}) from exc
