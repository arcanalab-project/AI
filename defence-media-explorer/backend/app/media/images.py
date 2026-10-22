"""Image technical metadata, thumbnails, and EXIF. Unzoned EXIF times stay unknown."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path

from PIL import Image, UnidentifiedImageError
from PIL.ExifTags import Base

from app.errors import AppError

_DATETIME = getattr(Base, "DateTimeOriginal", 36867)
_OFFSET = getattr(Base, "OffsetTimeOriginal", 36881)
_GPS = getattr(Base, "GPSInfo", 34853)


def inspect_image(path: Path) -> dict:
    try:
        with Image.open(path) as image:
            image.verify()
    except (UnidentifiedImageError, OSError, SyntaxError) as exc:
        raise AppError("CORRUPT_MEDIA", 422, {"reason": "image"}) from exc

    with Image.open(path) as image:
        width, height = image.size
        mode = image.mode
        image_format = image.format
        exif = _read_exif(image)
    return {
        "width": width,
        "height": height,
        "mode": mode,
        "format": image_format,
        "exif": exif,
    }


def write_thumbnail(source: Path, dest: Path, max_edge: int) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(source) as image:
        image = image.convert("RGB")
        image.thumbnail((max_edge, max_edge))
        image.save(dest, "JPEG", quality=82, optimize=True)


def _read_exif(image: Image.Image) -> dict:
    raw = image.getexif()
    if not raw:
        return {"capturedAtRaw": None, "capturedAtUtc": None, "gps": None}
    captured_raw = raw.get(_DATETIME)
    offset = raw.get(_OFFSET)
    captured_utc = _parse_exif_datetime(captured_raw, offset)
    gps = _gps(raw.get_ifd(_GPS) if hasattr(raw, "get_ifd") else None)
    return {
        "capturedAtRaw": captured_raw if isinstance(captured_raw, str) else None,
        "offsetTimeOriginal": offset if isinstance(offset, str) else None,
        "capturedAtUtc": captured_utc.isoformat() if captured_utc else None,
        "gps": gps,
    }


def _parse_exif_datetime(value: object, offset: object) -> datetime | None:
    """Only promote EXIF time when an offset is present. Otherwise it is not a UTC instant."""

    if not isinstance(value, str) or not isinstance(offset, str):
        return None
    try:
        naive = datetime.strptime(value.strip(), "%Y:%m:%d %H:%M:%S")
    except ValueError:
        return None
    try:
        sign = 1 if offset.startswith("+") else -1
        hours, minutes = offset[1:].split(":")
        delta = timedelta(hours=int(hours), minutes=int(minutes)) * sign
    except (ValueError, IndexError):
        return None
    return (naive - delta).replace(tzinfo=timezone.utc)


def _gps(ifd: object) -> dict | None:
    if not isinstance(ifd, dict) or not ifd:
        return None
    # Store numeric file metadata only. Do not reverse-geocode into a place name.
    lat = _dms_to_decimal(ifd.get(2), ifd.get(1))
    lon = _dms_to_decimal(ifd.get(4), ifd.get(3))
    if lat is None or lon is None:
        return None
    return {"latitude": lat, "longitude": lon, "provenance": "exif"}


def _dms_to_decimal(dms: object, ref: object) -> float | None:
    if not isinstance(dms, (tuple, list)) or len(dms) < 3 or not isinstance(ref, str):
        return None
    try:
        degrees = float(dms[0])
        minutes = float(dms[1])
        seconds = float(dms[2])
    except (TypeError, ValueError):
        return None
    value = degrees + minutes / 60 + seconds / 3600
    if ref.upper() in {"S", "W"}:
        value = -value
    return value
