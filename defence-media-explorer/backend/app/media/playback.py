"""Browser URLs for a stored object. GridFS is an authenticated API route."""

from __future__ import annotations

from app.media.local_fixtures import local_playback_url


def playback_url(obj: dict | None) -> str | None:
    local = local_playback_url(obj)
    if local:
        return local
    if not obj:
        return None
    file_id = obj.get("gridfsId")
    if not file_id:
        return None
    return f"/api/media/gridfs/{file_id}"
