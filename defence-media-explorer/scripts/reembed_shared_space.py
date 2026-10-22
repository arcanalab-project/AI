"""Rewrite shared-space embeddings at EMBEDDING_DIMENSIONS.

Keeps the original input for each segment: transcript text, image pixels, or the
video proxy. Skips segments that already have the target width. Recreates the
Atlas vector index only after every segment matches.
"""

from __future__ import annotations

import os
import sys
import tempfile
import traceback
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

os.environ["EMBEDDING_DIMENSIONS"] = os.environ.get("EMBEDDING_DIMENSIONS", "2048")

from PIL import Image  # noqa: E402

from app.config import Settings  # noqa: E402
from app.db.indexes import ensure_database  # noqa: E402
from app.errors import ProviderError  # noqa: E402
from app.pipeline.retry import call_provider  # noqa: E402
from app.pipeline.routing import text_for_shared_space  # noqa: E402
from app.providers.base import VideoInput  # noqa: E402
from app.providers.voyage import VoyageEmbeddingProvider  # noqa: E402
from app.storage.gridfs import GridFSStore  # noqa: E402
from pymongo import MongoClient  # noqa: E402


def main() -> int:
    settings = Settings()
    target = settings.embedding_dimensions
    if not settings.mongodb_configured or not settings.embeddings_configured:
        print("missing mongodb or voyage configuration")
        return 1
    client = MongoClient(settings.mongodb_uri, serverSelectionTimeoutMS=20000)
    database = client[settings.mongodb_database]
    segments = database["segments"]
    store = GridFSStore(database)
    provider = VoyageEmbeddingProvider(settings)
    total = segments.count_documents({})
    pending = segments.count_documents({"embeddingDimensions": {"$ne": target}})
    print(f"segments={total} pending={pending} dimensions={target}")
    failures = 0
    done = 0
    cursor = segments.find(
        {"embeddingDimensions": {"$ne": target}},
        {"embedding": 0},
    )
    seen = 0
    for doc in cursor:
        seen += 1
        strategy_name = doc.get("embeddingStrategy") or "text"
        if seen <= 3 or seen % 25 == 0:
            print(f"embed {seen}/{pending} strategy={strategy_name}", flush=True)
        try:
            vector, strategy = _embed(doc, provider, store)
        except Exception:
            failures += 1
            print(f"fail id={doc.get('_id')} strategy={doc.get('embeddingStrategy')}")
            traceback.print_exc(limit=2)
            continue
        result = segments.update_one(
            {"_id": doc["_id"], "embeddingDimensions": {"$ne": target}},
            {
                "$set": {
                    "embedding": vector,
                    "embeddingDimensions": target,
                    "embeddingModel": settings.voyage_multimodal_model,
                    "embeddingStrategy": strategy,
                    "embeddingInputType": "document",
                }
            },
        )
        if result.modified_count:
            done += 1
        if done and done % 20 == 0:
            print(f"updated={done} failures={failures}")
    remaining = segments.count_documents({"embeddingDimensions": {"$ne": target}})
    print(f"updated={done} failures={failures} remaining={remaining}")
    if failures or remaining:
        print("index left unchanged")
        return 1
    status = ensure_database(client, settings)
    vector = status["vectorIndex"]
    print(
        "index "
        f"action={vector.get('action')} status={vector.get('status')} "
        f"dimensions={vector.get('dimensions', target)}"
    )
    return 0


def _embed(doc: dict, provider: VoyageEmbeddingProvider, store: GridFSStore) -> tuple[list[float], str]:
    strategy = doc.get("embeddingStrategy") or "text"
    if strategy == "image":
        return _embed_image(doc, provider, store), "image"
    if strategy == "native_video":
        return _embed_video(doc, provider, store), "native_video"
    if strategy == "sampled_frames":
        return _embed_frames(doc, provider, store), "sampled_frames"
    return _embed_text(doc, provider), "text"


def _embed_text(doc: dict, provider: VoyageEmbeddingProvider) -> list[float]:
    plan = "audio" if doc.get("modality") == "audio" or doc.get("segmentType") == "audio_passage" else "text"
    text = text_for_shared_space(
        plan,
        transcript=doc.get("transcript"),
        source_text=doc.get("searchText"),
        no_speech=bool(doc.get("noSpeech")),
    )
    if not text:
        text = (doc.get("searchText") or "").strip()
    if not text:
        raise ProviderError("PROVIDER_FAILED", {"provider": "voyage", "capability": "embeddings"}, retryable=False)
    result = call_provider(lambda: provider.embed_document([text], "text"), attempts=6)
    return list(result["vector"])


def _embed_image(doc: dict, provider: VoyageEmbeddingProvider, store: GridFSStore) -> list[float]:
    obj = doc.get("originalObject") or doc.get("previewObject") or doc.get("thumbnailObject")
    with tempfile.TemporaryDirectory() as tmp:
        path = store.download(obj, Path(tmp) / "image")
        image = Image.open(path).convert("RGB")
        try:
            result = call_provider(lambda: provider.embed_document([image], "image"), attempts=6)
        finally:
            image.close()
    return list(result["vector"])


def _embed_video(doc: dict, provider: VoyageEmbeddingProvider, store: GridFSStore) -> list[float]:
    obj = doc.get("proxyObject") or doc.get("originalObject")
    with tempfile.TemporaryDirectory() as tmp:
        path = store.download(obj, Path(tmp) / "clip.mp4")
        result = call_provider(lambda: provider.embed_document([VideoInput(path)], "native_video"), attempts=6)
    return list(result["vector"])


def _embed_frames(doc: dict, provider: VoyageEmbeddingProvider, store: GridFSStore) -> list[float]:
    boards = doc.get("storyboard") or []
    if not boards:
        return _embed_text(doc, provider)
    parts: list = []
    images: list[Image.Image] = []
    with tempfile.TemporaryDirectory() as tmp:
        for index, board in enumerate(boards):
            obj = board.get("object") if isinstance(board, dict) else None
            if not obj:
                continue
            path = store.download(obj, Path(tmp) / f"frame-{index}.jpg")
            image = Image.open(path).convert("RGB")
            images.append(image)
            parts.append(f"Frame at {board.get('timestampMs')} ms")
            parts.append(image)
        if not images:
            return _embed_text(doc, provider)
        try:
            result = call_provider(lambda: provider.embed_document(parts, "sampled_frames"), attempts=6)
        finally:
            for image in images:
                image.close()
    return list(result["vector"])


if __name__ == "__main__":
    raise SystemExit(main())
