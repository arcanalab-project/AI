"""Time windows for video clips and audio passages.

Clips target a fixed length with overlap. Scene cuts near a window edge are
used when they are close, so a boundary is not sliced mid-action when a cut
is already there. This does not claim to find every short event.
"""

from __future__ import annotations


def build_windows(duration_ms: int, segment_ms: int, overlap_ms: int) -> list[tuple[int, int]]:
    if segment_ms <= 0:
        raise ValueError("segment_ms must be positive")
    if overlap_ms < 0 or overlap_ms >= segment_ms:
        raise ValueError("overlap_ms must be >= 0 and smaller than segment_ms")
    if duration_ms <= 0:
        return [(0, 0)]
    if duration_ms <= segment_ms:
        return [(0, duration_ms)]

    step = segment_ms - overlap_ms
    windows: list[tuple[int, int]] = []
    start = 0
    while start < duration_ms:
        end = min(start + segment_ms, duration_ms)
        windows.append((start, end))
        if end >= duration_ms:
            break
        next_start = start + step
        if next_start <= start:
            break
        start = next_start
    return windows


def snap_window_ends(
    windows: list[tuple[int, int]],
    scene_boundaries_ms: list[int],
    *,
    tolerance_ms: int = 1500,
    min_length_ms: int = 1000,
) -> list[tuple[int, int]]:
    """Move a window end onto a nearby scene cut. Starts stay on the grid."""

    if not scene_boundaries_ms:
        return list(windows)
    scenes = sorted(set(scene_boundaries_ms))
    snapped: list[tuple[int, int]] = []
    for start, end in windows:
        new_end = end
        for scene in scenes:
            if scene <= start + min_length_ms:
                continue
            if abs(scene - end) <= tolerance_ms:
                new_end = scene
                break
        if new_end <= start:
            new_end = end
        snapped.append((start, new_end))
    return snapped


def segment_text(text: str, size: int = 1200, overlap: int = 200) -> list[tuple[int, int, str]]:
    if size <= 0:
        raise ValueError("size must be positive")
    if overlap < 0 or overlap >= size:
        raise ValueError("overlap must be >= 0 and smaller than size")
    if text == "":
        return [(0, 0, "")]
    chunks: list[tuple[int, int, str]] = []
    start = 0
    length = len(text)
    while start < length:
        end = min(start + size, length)
        if end < length:
            window = text[start:end]
            break_at = window.rfind("\n")
            if break_at < size // 2:
                break_at = window.rfind(" ")
            if break_at >= size // 2:
                end = start + break_at
        chunk = text[start:end]
        chunks.append((start, end, chunk))
        if end >= length:
            break
        next_start = max(end - overlap, start + 1)
        start = next_start
    return chunks


def group_transcript_windows(
    passages: list[dict],
    duration_ms: int,
    segment_ms: int,
    overlap_ms: int,
) -> list[dict]:
    """Pack timed transcript passages into coherent windows against the original timeline.

    `passages` items have startMs, endMs, text. Offsets are already relative to the
    original recording (callers add chunk offsets before this runs).
    """

    windows = build_windows(duration_ms, segment_ms, overlap_ms)
    grouped: list[dict] = []
    for start, end in windows:
        texts: list[str] = []
        for passage in passages:
            p0 = int(passage.get("startMs") or 0)
            p1 = int(passage.get("endMs") or p0)
            if p1 < start or p0 > end:
                continue
            text = (passage.get("text") or "").strip()
            if text:
                texts.append(text)
        grouped.append(
            {
                "startMs": start,
                "endMs": end,
                "text": " ".join(texts).strip(),
            }
        )
    return grouped
