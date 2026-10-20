"""Measure cross-modal ranking with the configured Voyage key.

Prints ranks and cosine values only. It does not print credentials.
Probe documents live in workspace ``__routing_probe__`` and are deleted before exit.
"""

from __future__ import annotations

import math
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from bson import ObjectId
from PIL import Image, ImageDraw

from app.config import get_settings
from app.db.client import get_client
from app.providers.base import VideoInput
from app.providers.voyage import VoyageEmbeddingProvider


def cosine(left: list[float], right: list[float]) -> float:
    dot = sum(a * b for a, b in zip(left, right, strict=True))
    left_norm = math.sqrt(sum(a * a for a in left))
    right_norm = math.sqrt(sum(b * b for b in right))
    return dot / (left_norm * right_norm)


def rank_against(query: list[float], docs: dict[str, list[float]]) -> list[tuple[str, float]]:
    ordered = sorted(((name, cosine(query, vector)) for name, vector in docs.items()), key=lambda item: item[1], reverse=True)
    return [(name, round(score, 4)) for name, score in ordered]


def main() -> int:
    settings = get_settings()
    if not settings.embeddings_configured:
        print("SKIP embeddings are not configured")
        return 2
    provider = VoyageEmbeddingProvider(settings)
    work = Path(tempfile.mkdtemp(prefix="dme-route-"))

    vehicle = Image.new("RGB", (320, 180), "#5b4636")
    draw = ImageDraw.Draw(vehicle)
    draw.rectangle((40, 90, 280, 150), fill="#6b4f2a")
    draw.rectangle((70, 70, 250, 100), fill="#3f4a32")
    sky = Image.new("RGB", (320, 180), "#7eb6d6")
    ImageDraw.Draw(sky).ellipse((40, 40, 120, 120), fill="#f4f4f4")

    video_path = work / "clip.mp4"
    subprocess.run(
        [
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-f", "lavfi", "-i", "color=c=0x5b4636:s=160x90:d=1",
            "-vf", "scale=160:90", "-r", "4", "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p",
            str(video_path),
        ],
        check=True,
    )

    transcripts = {
        "en": "Equipment inspection of the vehicle is complete.",
        "it": "L'ispezione dell'equipaggiamento del veicolo è completata.",
        "fr": "L'inspection de l'équipement du véhicule est terminée.",
        "es": "La inspección del equipo del vehículo ha terminado.",
        "de": "Die Inspektion der Fahrzeugausrüstung ist abgeschlossen.",
        "weather": "Tomorrow the weather on the coast will be sunny.",
    }
    queries = {
        "en": "Recordings that discuss equipment inspections.",
        "it": "Registrazioni che trattano ispezioni di equipaggiamento.",
        "fr": "Enregistrements qui évoquent des inspections d'équipement.",
        "es": "Grabaciones que tratan inspecciones de equipo.",
        "de": "Aufzeichnungen, in denen Ausrüstungsinspektionen besprochen werden.",
    }

    image_vehicle = provider.embed_document([vehicle], "image")["vector"]
    image_sky = provider.embed_document([sky], "image")["vector"]
    video_vector = provider.embed_document([VideoInput(video_path)], "native_video")["vector"]
    text_vectors = {name: provider.embed_document([text], "text")["vector"] for name, text in transcripts.items()}
    visual_docs = {"image_vehicle": image_vehicle, "image_sky": image_sky, "video_mud": video_vector, **text_vectors}
    terrain_query = provider.embed_query("Tracked vehicles on muddy terrain during a training exercise.")
    rectangle_query = provider.embed_query("A brown rectangle on a muddy brown background.")
    same = "Equipment inspection of the vehicle is complete."
    shared_query = provider.embed_query(same)
    text_model = None
    if settings.enable_text_embeddings:
        text_model = provider.embed_text_query(same)
    else:
        # Measure the other model without storing it beside the shared vector.
        from voyageai import Client

        other = Client(api_key=settings.voyage_api_key).embed(
            texts=[same],
            model=settings.voyage_text_model,
            input_type="query",
            truncation=False,
            output_dtype="float",
            output_dimension=settings.text_embedding_dimensions,
        )
        text_model = list(other.embeddings[0])

    print("text_to_image_defence", rank_against(terrain_query, {"image_vehicle": image_vehicle, "image_sky": image_sky, "video_mud": video_vector})[:3])
    print("text_to_image_literal", rank_against(rectangle_query, {"image_vehicle": image_vehicle, "image_sky": image_sky}) )
    print("text_to_video", rank_against(terrain_query, {"video_mud": video_vector, "image_sky": image_sky, "weather": text_vectors["weather"]})[:3])
    for language, query in queries.items():
        vector = provider.embed_query(query)
        print("transcript", language, rank_against(vector, text_vectors)[:3])
    print(
        "spaces_not_mixed",
        "shared_dim", len(shared_query),
        "text_dim", len(text_model),
        "cosine", round(cosine(shared_query, text_model), 4) if len(shared_query) == len(text_model) else "different_length",
    )

    client = get_client(settings.mongodb_uri)
    database = client[settings.mongodb_database]
    workspace = "__routing_probe__"
    now = datetime.now(timezone.utc)
    docs = []
    catalog = {
        "image_vehicle": (image_vehicle, "image", "image"),
        "image_sky": (image_sky, "image", "image"),
        "video_mud": (video_vector, "video", "video_clip"),
    }
    for name, vector in text_vectors.items():
        catalog[name] = (vector, "text", "text_chunk")
    try:
        for name, (vector, media_type, segment_type) in catalog.items():
            docs.append(
                {
                    "_id": ObjectId(),
                    "workspaceId": workspace,
                    "assetId": ObjectId(),
                    "mediaType": media_type,
                    "segmentType": segment_type,
                    "modality": media_type if media_type != "text" else "text",
                    "processingStatus": "ready",
                    "pipelineVersion": "v1",
                    "preprocessingVersion": "v1",
                    "uploadedAt": now,
                    "embedding": vector,
                    "embeddingModel": settings.voyage_multimodal_model,
                    "embeddingDimensions": len(vector),
                    "embeddingInputType": "document",
                    "title": name,
                    "probe": True,
                }
            )
        database.segments.insert_many(docs)
        by_id = {doc["_id"]: doc["title"] for doc in docs}
        filt = {"workspaceId": workspace}

        def atlas_titles(vector: list[float]) -> list[str]:
            last: list[str] = []
            for _ in range(6):
                rows = list(
                    database.segments.aggregate(
                        [
                            {
                                "$vectorSearch": {
                                    "index": settings.atlas_vector_index,
                                    "path": "embedding",
                                    "queryVector": vector,
                                    "numCandidates": 50,
                                    "limit": 5,
                                    "filter": filt,
                                }
                            },
                            {"$project": {"title": 1}},
                        ]
                    )
                )
                last = [row.get("title") for row in rows]
                if last:
                    return last
                time.sleep(5)
            return last

        for label, vector in (("defence", terrain_query), ("literal", rectangle_query)):
            print("atlas", label, atlas_titles(vector))
        inspection = provider.embed_query(queries["it"])
        print("atlas_it", atlas_titles(inspection), "known", sorted(by_id.values()))
    finally:
        deleted = database.segments.delete_many({"workspaceId": workspace})
        print("probe_removed", deleted.deleted_count)
        client.close()
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        text = str(exc)
        if "pa-" in text or "mongodb" in text:
            print("VERIFY_FAILED redacted")
        else:
            print("VERIFY_FAILED", type(exc).__name__)
        raise SystemExit(1)
