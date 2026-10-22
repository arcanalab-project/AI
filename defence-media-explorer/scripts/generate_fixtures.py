#!/usr/bin/env python3
"""Write small original synthetic fixtures with Pillow and ffmpeg.

Nothing here is downloaded. The pictures are geometric diagrams. The audio is a
tone, not speech, and must not be treated as transcription evidence.
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "fixtures" / "synthetic"


def main() -> None:
    if shutil.which("ffmpeg") is None:
        raise SystemExit("ffmpeg is required")
    OUT.mkdir(parents=True, exist_ok=True)
    _diagram(OUT / "tracked-ground.jpg", "JPEG")
    _diagram(OUT / "tracked-ground.png", "PNG")
    _diagram(OUT / "tracked-ground.webp", "WEBP")
    _run(
        [
            "ffmpeg",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "color=c=0x001E2B:s=320x180:d=2",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=440:duration=2",
            "-shortest",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            str(OUT / "training-block.mp4"),
        ]
    )
    _run(
        [
            "ffmpeg",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "color=c=0x3D4A34:s=320x180:d=2",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            str(OUT / "training-block.mov"),
        ]
    )
    _run(["ffmpeg", "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-c:a", "pcm_s16le", str(OUT / "tone.wav")])
    _run(["ffmpeg", "-y", "-i", str(OUT / "tone.wav"), "-c:a", "libmp3lame", "-q:a", "9", str(OUT / "tone.mp3")])
    _run(["ffmpeg", "-y", "-i", str(OUT / "tone.wav"), "-c:a", "aac", str(OUT / "tone.m4a")])
    (OUT / "inspection-note.txt").write_text(
        "Synthetic inspection note.\n"
        "This text was written for the Defence Media Explorer fixture set.\n"
        "It describes a checklist, not a real exercise, and it is not a transcript.\n",
        encoding="utf-8",
    )
    print(f"wrote {OUT}")


def _diagram(path: Path, kind: str) -> None:
    image = Image.new("RGB", (640, 360), "#001E2B")
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 210, 640, 360), fill="#6B4F2A")
    draw.rectangle((70, 150, 280, 230), fill="#3D4A34")
    draw.rectangle((90, 230, 130, 260), fill="#1B1B1B")
    draw.rectangle((220, 230, 260, 260), fill="#1B1B1B")
    draw.ellipse((430, 60, 520, 110), outline="#00ED64", width=4)
    draw.line((475, 110, 475, 150), fill="#00ED64", width=3)
    draw.text((36, 24), "SYNTHETIC", fill="#F4FBF7")
    image.save(path, kind)


def _run(command: list[str]) -> None:
    subprocess.run(command, check=True, capture_output=True)


if __name__ == "__main__":
    main()
