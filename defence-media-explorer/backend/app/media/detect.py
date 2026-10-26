"""Magic-byte detection. The extension must agree with the detected type."""

from __future__ import annotations

from pathlib import Path

from app.errors import AppError
from app.media.documents import DOCX_MIME, PDF_MIME, docx_has_document, looks_like_pdf

ALLOWED: dict[str, dict[str, set[str]]] = {
    "image/jpeg": {"media_type": "image", "extensions": {"jpg", "jpeg"}},
    "image/png": {"media_type": "image", "extensions": {"png"}},
    "image/webp": {"media_type": "image", "extensions": {"webp"}},
    "video/mp4": {"media_type": "video", "extensions": {"mp4"}},
    "video/quicktime": {"media_type": "video", "extensions": {"mov"}},
    "audio/mpeg": {"media_type": "audio", "extensions": {"mp3"}},
    "audio/wav": {"media_type": "audio", "extensions": {"wav"}},
    "audio/mp4": {"media_type": "audio", "extensions": {"m4a"}},
    "text/plain": {"media_type": "text", "extensions": {"txt"}},
    PDF_MIME: {"media_type": "text", "extensions": {"pdf"}},
    DOCX_MIME: {"media_type": "text", "extensions": {"docx"}},
}


def extension_of(filename: str) -> str:
    if "." not in filename:
        return ""
    return filename.rsplit(".", 1)[-1].lower()


def detect_mime(header: bytes, filename: str, source: Path | None = None) -> str:
    ext = extension_of(filename)
    if ext == "txt":
        if _looks_like_text(header):
            return "text/plain"
        raise AppError("FILE_TYPE_MISMATCH", 415, {"expected": "text/plain", "detected": "binary"})
    if ext == "pdf":
        if looks_like_pdf(header):
            return PDF_MIME
        raise AppError("FILE_TYPE_MISMATCH", 415, {"expected": PDF_MIME, "extension": ext})
    if ext == "docx":
        if not header.startswith(b"PK"):
            raise AppError("FILE_TYPE_MISMATCH", 415, {"expected": DOCX_MIME, "extension": ext})
        if source is not None and not docx_has_document(source):
            raise AppError("FILE_TYPE_MISMATCH", 415, {"expected": DOCX_MIME, "extension": ext})
        return DOCX_MIME

    detected = _magic(header)
    if detected is None:
        raise AppError("FILE_TYPE_UNSUPPORTED", 415, {"extension": ext or "none"})
    allowed_ext = ALLOWED[detected]["extensions"]
    if ext not in allowed_ext:
        raise AppError(
            "FILE_TYPE_MISMATCH",
            415,
            {"expected": detected, "extension": ext or "none"},
        )
    return detected


def media_type_for_mime(mime: str) -> str:
    spec = ALLOWED.get(mime)
    if not spec:
        raise AppError("FILE_TYPE_UNSUPPORTED", 415, {"mime": mime})
    return str(spec["media_type"])


def _magic(header: bytes) -> str | None:
    if len(header) >= 3 and header[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if header.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if len(header) >= 12 and header[:4] == b"RIFF" and header[8:12] == b"WEBP":
        return "image/webp"
    if len(header) >= 12 and header[:4] == b"RIFF" and header[8:12] == b"WAVE":
        return "audio/wav"
    if header.startswith(b"ID3") or _mp3_frame(header):
        return "audio/mpeg"
    if len(header) >= 12 and header[4:8] == b"ftyp":
        brand = header[8:12]
        if brand in {b"M4A ", b"M4B ", b"M4P "}:
            return "audio/mp4"
        if brand in {b"qt  ", b"mov "}:
            return "video/quicktime"
        # Major brands used by MP4 video. M4A is handled above.
        return "video/mp4"
    return None


def _mp3_frame(header: bytes) -> bool:
    if len(header) < 2:
        return False
    # Frame sync 11 bits and a plausible MPEG audio version/layer.
    return header[0] == 0xFF and (header[1] & 0xE0) == 0xE0


def _looks_like_text(header: bytes) -> bool:
    if b"\x00" in header:
        return False
    if not header:
        return True
    try:
        header.decode("utf-8")
    except UnicodeDecodeError:
        return False
    return True
