"""Collapse overlapping or nearby hits from the same video so one file does not flood the page."""

from __future__ import annotations

from typing import Any


def _interval(hit: dict[str, Any]) -> tuple[int, int]:
    start = hit.get("startMs")
    end = hit.get("endMs")
    start_ms = int(start) if isinstance(start, (int, float)) else 0
    end_ms = int(end) if isinstance(end, (int, float)) else start_ms
    return start_ms, end_ms


def _nearby(left: dict[str, Any], right: dict[str, Any], gap_ms: int) -> bool:
    if left.get("assetId") != right.get("assetId"):
        return False
    if left.get("mediaType") != "video" or right.get("mediaType") != "video":
        return False
    a0, a1 = _interval(left)
    b0, b1 = _interval(right)
    return a0 <= b1 + gap_ms and b0 <= a1 + gap_ms


def _hit_id(hit: dict[str, Any]) -> str:
    if hit.get("_id") is not None:
        return str(hit["_id"])
    return str(hit.get("segmentId") or "")


def group_nearby_hits(hits: list[dict[str, Any]], *, gap_ms: int = 2000) -> list[dict[str, Any]]:
    """Keep the better-ranked hit as the card and attach nearby segments from the same video."""

    used: set[str] = set()
    grouped: list[dict[str, Any]] = []
    for hit in hits:
        identity = _hit_id(hit)
        if identity in used:
            continue
        nearby: list[dict[str, Any]] = []
        if hit.get("mediaType") == "video":
            for other in hits:
                other_id = _hit_id(other)
                if other_id == identity or other_id in used:
                    continue
                if _nearby(hit, other, gap_ms):
                    nearby.append(other)
                    used.add(other_id)
        used.add(identity)
        card = dict(hit)
        card["nearby"] = nearby
        card["nearbyCount"] = len(nearby)
        grouped.append(card)
    return grouped
