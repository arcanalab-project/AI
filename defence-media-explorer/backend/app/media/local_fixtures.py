"""Serve the project's synthetic fixtures when object storage cannot sign a URL.

Only files that already live in fixtures/synthetic are eligible. Keys from any
other bucket stay on the object-storage signer.
"""

from __future__ import annotations

from pathlib import Path

FIXTURE_DIR = Path(__file__).resolve().parents[3] / "fixtures" / "synthetic"

MEDIA_TYPES = {
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
    ".txt": "text/plain; charset=utf-8",
}


def fixture_file(name: str) -> tuple[Path | None, str | None]:
    if not name or name != Path(name).name or name in {".", ".."}:
        return None, None
    path = (FIXTURE_DIR / name).resolve()
    try:
        path.relative_to(FIXTURE_DIR.resolve())
    except ValueError:
        return None, None
    if not path.is_file():
        return None, None
    return path, MEDIA_TYPES.get(path.suffix.lower(), "application/octet-stream")


def local_playback_url(obj: dict | None) -> str | None:
    if not obj or not obj.get("key"):
        return None
    key = str(obj["key"])
    name = Path(key).name
    allowed = obj.get("bucket") == "local" or key.startswith("fixtures/synthetic/")
    if not allowed:
        return None
    path, _media = fixture_file(name)
    if path is None:
        return None
    return f"/api/media/fixtures/{path.name}"
