"""Provider adapters. Business logic calls these protocols and does not import SDKs."""

from __future__ import annotations

from typing import Protocol

from PIL import Image


class EmbeddingResult(dict):
    pass


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
