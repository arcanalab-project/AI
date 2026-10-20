"""Deterministic Voyage routing.

The shared space is voyage-multimodal-3.5. Each modality has one primary input:

- images: the image pixels, never the OCR string
- video: the clip, or ordered frames with timestamps when native video cannot be sent
- audio and text: the transcript or chunk

A video clip with speech also gets a separate transcript document in that same space.
voyage-4-large is not decided here. It is an optional second channel with its own field.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class EmbeddingRoute:
    modality: str
    strategy: str
    kind: str


def route_primary(plan: str, *, clip_within_limit: bool, has_frames: bool, native_failed: bool) -> EmbeddingRoute:
    if plan == "image":
        return EmbeddingRoute("image", "image", "image")
    if plan == "video":
        if clip_within_limit and not native_failed:
            return EmbeddingRoute("video", "native_video", "video")
        if has_frames:
            return EmbeddingRoute("video", "sampled_frames", "frames")
        return EmbeddingRoute("video", "text", "text")
    if plan == "audio":
        return EmbeddingRoute("audio", "text", "text")
    return EmbeddingRoute("text", "text", "text")


def wants_transcript_document(plan: str, transcript: str | None) -> bool:
    """Video speech is embedded again as text. The clip vector stays a video vector."""

    return plan == "video" and bool((transcript or "").strip())


def text_for_shared_space(plan: str, *, transcript: str | None, source_text: str | None, no_speech: bool) -> str:
    """Text that belongs in the shared multimodal space. OCR is not included."""

    if plan == "audio":
        spoken = (transcript or "").strip()
        if spoken:
            return spoken
        if no_speech:
            return "No speech detected."
        return ""
    chunk = (source_text or transcript or "").strip()
    return chunk
