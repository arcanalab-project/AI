"""Shared document helpers."""

from __future__ import annotations


def compose_search_text(*parts: object) -> str:
    chunks: list[str] = []
    for part in parts:
        if part is None:
            continue
        if isinstance(part, (list, tuple)):
            text = " ".join(str(item) for item in part if item)
        else:
            text = str(part)
        text = text.strip()
        if text:
            chunks.append(text)
    return "\n".join(chunks)[:20000]


def excerpt(*parts: object, limit: int = 280) -> str:
    text = compose_search_text(*parts).replace("\n", " ")
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


WHISPER_LANGUAGE_CODES = {
    "english": "en",
    "italian": "it",
    "french": "fr",
    "german": "de",
    "spanish": "es",
    "en": "en",
    "it": "it",
    "fr": "fr",
    "de": "de",
    "es": "es",
}
