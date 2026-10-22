from datetime import datetime, timezone
from pathlib import Path

from PIL import Image

from app.media.images import inspect_image


def test_unzoned_exif_stays_unknown(tmp_path: Path):
    path = tmp_path / "frame.jpg"
    image = Image.new("RGB", (32, 24), "#8B5A2B")
    exif = Image.Exif()
    exif[36867] = "2024:05:01 12:00:00"
    image.save(path, exif=exif)
    technical = inspect_image(path)
    assert technical["width"] == 32
    assert technical["exif"]["capturedAtRaw"] == "2024:05:01 12:00:00"
    assert technical["exif"]["capturedAtUtc"] is None


def test_offset_exif_becomes_utc(tmp_path: Path):
    path = tmp_path / "frame.jpg"
    image = Image.new("RGB", (16, 16), "green")
    exif = Image.Exif()
    exif[36867] = "2024:05:01 12:00:00"
    exif[36881] = "+02:00"
    image.save(path, exif=exif)
    technical = inspect_image(path)
    parsed = datetime.fromisoformat(technical["exif"]["capturedAtUtc"])
    assert parsed == datetime(2024, 5, 1, 10, 0, tzinfo=timezone.utc)
