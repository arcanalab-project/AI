"""Voyage embeddings.

Multimodal calls go to the HTTP API. voyageai 0.3.5 `multimodal_embed` does not
send video, `output_dimension`, or `output_dtype`. Text embeddings and rerank use
the official client, which does accept `output_dimension`.

input_type is document for stored segments and query for retrieval.
"""

from __future__ import annotations

import base64
from io import BytesIO
from pathlib import Path

import httpx
from PIL import Image

from app.config import Settings
from app.errors import ProviderError
from app.providers.base import EmbeddingResult, VideoInput

_MULTIMODAL_URL = "https://api.voyageai.com/v1/multimodalembeddings"
_MAX_VIDEO_BYTES = 20 * 1024 * 1024


class VoyageEmbeddingProvider:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.model = settings.voyage_multimodal_model
        self.dimensions = settings.embedding_dimensions
        self._client = None

    def _sdk(self):
        if not self.settings.embeddings_configured:
            raise ProviderError(
                "PROVIDER_NOT_CONFIGURED",
                {"provider": "voyage", "capability": "embeddings"},
                retryable=False,
            )
        if self._client is None:
            import voyageai

            self._client = voyageai.Client(api_key=self.settings.voyage_api_key)
        return self._client

    def embed_document(self, parts: list, strategy: str) -> EmbeddingResult:
        return self._embed_multimodal(parts, input_type="document", strategy=strategy)

    def embed_query(self, text: str) -> list[float]:
        result = self._embed_multimodal([text], input_type="query", strategy="query")
        return list(result["vector"])

    def embed_text_document(self, text: str) -> EmbeddingResult:
        return self._embed_text(text, input_type="document")

    def embed_text_query(self, text: str) -> list[float]:
        return list(self._embed_text(text, input_type="query")["vector"])

    def rerank(self, query: str, documents: list[str]) -> list[int]:
        if not self.settings.embeddings_configured:
            raise ProviderError(
                "PROVIDER_NOT_CONFIGURED",
                {"provider": "voyage", "capability": "rerank"},
                retryable=False,
            )
        try:
            result = self._sdk().rerank(
                query=query,
                documents=documents,
                model=self.settings.voyage_rerank_model,
                top_k=len(documents),
                truncation=True,
            )
        except ProviderError:
            raise
        except Exception as exc:
            raise _map_sdk(exc, capability="rerank") from exc
        ranked = sorted(result.results, key=lambda item: item.relevance_score, reverse=True)
        return [int(item.index) for item in ranked]

    def _embed_multimodal(self, parts: list, *, input_type: str, strategy: str) -> EmbeddingResult:
        if not self.settings.embeddings_configured:
            raise ProviderError(
                "PROVIDER_NOT_CONFIGURED",
                {"provider": "voyage", "capability": "embeddings"},
                retryable=False,
            )
        content = [_content_part(part) for part in parts]
        payload = {
            "inputs": [{"content": content}],
            "model": self.model,
            "input_type": input_type,
            "truncation": False,
            "output_dimension": self.dimensions,
            "output_dtype": "float",
        }
        try:
            response = httpx.post(
                _MULTIMODAL_URL,
                headers={"Authorization": f"Bearer {self.settings.voyage_api_key}", "Content-Type": "application/json"},
                json=payload,
                timeout=120,
            )
        except httpx.TimeoutException as exc:
            raise ProviderError("PROVIDER_FAILED", {"provider": "voyage", "capability": "embeddings"}, retryable=True) from exc
        except httpx.HTTPError as exc:
            raise ProviderError("PROVIDER_FAILED", {"provider": "voyage", "capability": "embeddings"}, retryable=True) from exc
        if response.status_code >= 400:
            raise ProviderError(
                "PROVIDER_RATE_LIMITED" if response.status_code == 429 else "PROVIDER_FAILED",
                {"provider": "voyage", "capability": "embeddings", "status": response.status_code},
                retryable=response.status_code == 429 or response.status_code >= 500,
            )
        body = response.json()
        data = body.get("data") or []
        if not data or not isinstance(data[0].get("embedding"), list):
            raise ProviderError("PROVIDER_FAILED", {"provider": "voyage", "capability": "embeddings"}, retryable=False)
        vector = [float(value) for value in data[0]["embedding"]]
        _check_vector(vector, self.dimensions, self.model, body.get("model"))
        return EmbeddingResult(
            vector=vector,
            model=self.model,
            dimensions=len(vector),
            strategy=strategy,
            inputType=input_type,
        )

    def _embed_text(self, text: str, *, input_type: str) -> EmbeddingResult:
        if not self.settings.embeddings_configured or not self.settings.enable_text_embeddings:
            raise ProviderError(
                "PROVIDER_NOT_CONFIGURED",
                {"provider": "voyage", "capability": "textEmbeddings"},
                retryable=False,
            )
        model = self.settings.voyage_text_model
        dimensions = self.settings.text_embedding_dimensions
        try:
            result = self._sdk().embed(
                texts=[text],
                model=model,
                input_type=input_type,
                truncation=False,
                output_dtype="float",
                output_dimension=dimensions,
            )
        except ProviderError:
            raise
        except Exception as exc:
            raise _map_sdk(exc, capability="textEmbeddings") from exc
        vector = list(result.embeddings[0])
        returned = getattr(result, "model", None)
        _check_vector(vector, dimensions, model, returned)
        return EmbeddingResult(
            vector=vector,
            model=model,
            dimensions=len(vector),
            strategy="text_channel",
            inputType=input_type,
        )


def _content_part(part) -> dict:
    if isinstance(part, str):
        return {"type": "text", "text": part}
    if isinstance(part, Image.Image):
        buffer = BytesIO()
        part.convert("RGB").save(buffer, format="JPEG", quality=85)
        encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
        return {"type": "image_base64", "image_base64": f"data:image/jpeg;base64,{encoded}"}
    if isinstance(part, VideoInput):
        payload = Path(part.path).read_bytes()
        if len(payload) > _MAX_VIDEO_BYTES:
            raise ProviderError("PROVIDER_FAILED", {"provider": "voyage", "capability": "video_bytes"}, retryable=False)
        encoded = base64.b64encode(payload).decode("ascii")
        return {"type": "video_base64", "video_base64": f"data:video/mp4;base64,{encoded}"}
    raise ProviderError("PROVIDER_FAILED", {"provider": "voyage", "capability": "embeddings"}, retryable=False)


def _check_vector(vector: list[float], expected: int, model: str, returned_model: str | None) -> None:
    if len(vector) != expected:
        raise ProviderError(
            "EMBEDDING_DIMENSION_MISMATCH",
            {"expected": expected, "actual": len(vector), "model": model},
            retryable=False,
        )
    if returned_model and returned_model != model:
        raise ProviderError(
            "EMBEDDING_MODEL_MISMATCH",
            {"expected": model, "actual": returned_model},
            retryable=False,
        )


def _map_sdk(exc: Exception, *, capability: str) -> ProviderError:
    name = exc.__class__.__name__.lower()
    text = str(exc).lower()
    if "ratelimit" in name or "429" in text or "rate limit" in text:
        return ProviderError("PROVIDER_RATE_LIMITED", {"provider": "voyage", "capability": capability}, retryable=True)
    return ProviderError("PROVIDER_FAILED", {"provider": "voyage", "capability": capability}, retryable=True)
