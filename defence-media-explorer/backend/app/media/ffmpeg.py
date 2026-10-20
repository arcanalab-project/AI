"""ffprobe, scene cuts, clip and frame extraction. Originals are never overwritten."""

from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

from app.errors import AppError


class MediaToolError(AppError):
    pass


def probe(path: Path) -> dict:
    proc = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            str(path),
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0 or not proc.stdout.strip():
        raise AppError("CORRUPT_MEDIA", 422, {"reason": "unreadable"})
    try:
        data = json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        raise AppError("CORRUPT_MEDIA", 422, {"reason": "unreadable"}) from exc

    streams = data.get("streams") or []
    fmt = data.get("format") or {}
    video = next((s for s in streams if s.get("codec_type") == "video"), None)
    audio = next((s for s in streams if s.get("codec_type") == "audio"), None)
    duration = fmt.get("duration") or (video or {}).get("duration") or (audio or {}).get("duration") or 0
    try:
        duration_ms = int(float(duration) * 1000)
    except (TypeError, ValueError):
        duration_ms = 0

    def _rate(value: str | None) -> float | None:
        if not value or value == "0/0":
            return None
        if "/" in value:
            num, den = value.split("/", 1)
            try:
                return float(num) / float(den) if float(den) else None
            except ValueError:
                return None
        try:
            return float(value)
        except ValueError:
            return None

    return {
        "durationMs": duration_ms,
        "formatName": fmt.get("format_name"),
        "bitRate": _int_or_none(fmt.get("bit_rate")),
        "video": None
        if video is None
        else {
            "codec": video.get("codec_name"),
            "width": video.get("width"),
            "height": video.get("height"),
            "fps": _rate(video.get("avg_frame_rate") or video.get("r_frame_rate")),
            "pixelFormat": video.get("pix_fmt"),
        },
        "audio": None
        if audio is None
        else {
            "codec": audio.get("codec_name"),
            "sampleRate": _int_or_none(audio.get("sample_rate")),
            "channels": audio.get("channels"),
            "channelLayout": audio.get("channel_layout"),
        },
    }


def detect_scene_cuts(path: Path, threshold: float = 0.3) -> list[int]:
    proc = subprocess.run(
        [
            "ffmpeg",
            "-hide_banner",
            "-i",
            str(path),
            "-filter:v",
            f"select='gt(scene,{threshold})',showinfo",
            "-an",
            "-f",
            "null",
            "-",
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    cuts: list[int] = []
    for line in (proc.stderr or "").splitlines():
        match = re.search(r"pts_time:([0-9]+(?:\.[0-9]+)?)", line)
        if match:
            cuts.append(int(float(match.group(1)) * 1000))
    return sorted(set(cuts))


def extract_clip(source: Path, dest: Path, start_ms: int, end_ms: int) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    start = max(start_ms, 0) / 1000
    duration = max(end_ms - start_ms, 1) / 1000
    _run(
        [
            "ffmpeg",
            "-y",
            "-hide_banner",
            "-ss",
            f"{start:.3f}",
            "-i",
            str(source),
            "-t",
            f"{duration:.3f}",
            "-vf",
            "scale=640:-2",
            "-r",
            "8",
            "-an",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            str(dest),
        ]
    )


def extract_frame(source: Path, dest: Path, timestamp_ms: int, width: int = 640) -> None:
    """Grab one frame. Input seeking can land past the last picture, so a miss retries."""

    dest.parent.mkdir(parents=True, exist_ok=True)
    stamp = max(timestamp_ms, 0) / 1000
    attempts = [stamp]
    if stamp > 0.2:
        attempts.append(max(0.0, stamp - 0.2))
    for index, attempt in enumerate(attempts):
        if dest.exists():
            dest.unlink()
        # The first try seeks before decode. The retry decodes up to the stamp,
        # which still returns a picture when the requested instant is the tail.
        command = ["ffmpeg", "-y", "-hide_banner"]
        if index == 0:
            command.extend(["-ss", f"{attempt:.3f}", "-i", str(source)])
        else:
            command.extend(["-i", str(source), "-ss", f"{attempt:.3f}"])
        command.extend(["-frames:v", "1", "-vf", f"scale={width}:-2", str(dest)])
        proc = subprocess.run(command, capture_output=True, text=True, check=False)
        if proc.returncode == 0 and dest.exists() and dest.stat().st_size > 0:
            return
    raise AppError("CORRUPT_MEDIA", 422, {"reason": "ffmpeg"})


def transcode_playback(source: Path, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    _run(
        [
            "ffmpeg",
            "-y",
            "-hide_banner",
            "-i",
            str(source),
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-movflags",
            "+faststart",
            str(dest),
        ]
    )


def extract_wav(source: Path, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    _run(
        [
            "ffmpeg",
            "-y",
            "-hide_banner",
            "-i",
            str(source),
            "-vn",
            "-ac",
            "1",
            "-ar",
            "16000",
            "-c:a",
            "pcm_s16le",
            str(dest),
        ]
    )


def split_wav(source: Path, dest_dir: Path, segment_seconds: int = 600) -> list[Path]:
    dest_dir.mkdir(parents=True, exist_ok=True)
    pattern = dest_dir / "chunk-%03d.wav"
    _run(
        [
            "ffmpeg",
            "-y",
            "-hide_banner",
            "-i",
            str(source),
            "-f",
            "segment",
            "-segment_time",
            str(segment_seconds),
            "-ac",
            "1",
            "-ar",
            "16000",
            "-c:a",
            "pcm_s16le",
            str(pattern),
        ]
    )
    return sorted(dest_dir.glob("chunk-*.wav"))


def _run(cmd: list[str]) -> None:
    proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if proc.returncode != 0:
        raise AppError("CORRUPT_MEDIA", 422, {"reason": "ffmpeg"})


def _int_or_none(value: object) -> int | None:
    try:
        return int(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
