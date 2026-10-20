"""Media bytes live in GridFS. This package is that store, not a second backend."""

from app.storage.gridfs import BUCKET, GridFSStore

__all__ = ["BUCKET", "GridFSStore"]
