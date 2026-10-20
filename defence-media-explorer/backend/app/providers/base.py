"""Provider adapters. Business logic calls these protocols and does not import SDKs."""

from __future__ import annotations

from pathlib import Path
from typing import Protocol

from PIL import Image


class EmbeddingResult(dict):
    pass


class VideoInput:
    """A local MP4 clip. The provider reads the bytes; it does not use a second model."""

    def __init__(self, path: str | Path) -> None:
        self.path = str(path)


class EmbeddingProvider(Protocol):
    model: str
    dimensions: int

    def embed_document(self, parts: list, strategy: str) -> EmbeddingResult: ...

    def embed_query(self, text: str) -> list[float]: ...

    def rerank(self, query: str, documents: list[str]) -> list[int]: ...


class VisionProvider(Protocol):
    def describe(self, images: list[Image.Image], context: dict) -> dict: ...


class TranscriptionProvider(Protocol):
    def transcribe(self, wav_path: str) -> dict: ...
