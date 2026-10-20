"""Wire concrete adapters. Tests construct their own dependencies."""

from __future__ import annotations

from pathlib import Path

from app.config import Settings, get_settings
from app.db.client import connect, database
from app.db.repository import Repository
from app.providers.openai_transcription import OpenAITranscriptionProvider
from app.providers.openai_vision import OpenAIVisionProvider
from app.providers.voyage import VoyageEmbeddingProvider
from app.storage.gridfs import GridFSStore


def build_repo(settings: Settings | None = None):
    settings = settings or get_settings()
    db = database(settings)
    if db is None:
        return None
    return Repository(db)


def build_storage(settings: Settings | None = None):
    settings = settings or get_settings()
    db = database(settings)
    if db is None:
        return None
    return GridFSStore(db)


def build_deps(settings: Settings | None = None, workdir: Path | None = None):
    from app.pipeline.runner import PipelineDeps

    settings = settings or get_settings()
    return PipelineDeps(
        settings=settings,
        repo=build_repo(settings),
        storage=build_storage(settings),
        vision=OpenAIVisionProvider(settings),
        transcription=OpenAITranscriptionProvider(settings),
        embeddings=VoyageEmbeddingProvider(settings),
        workdir=workdir or Path("/tmp/dme-work"),
    )


def mongo_client(settings: Settings | None = None):
    return connect(settings or get_settings())
