"""Voyage multimodal embeddings and optional text rerank.

Docs checked for this implementation:
- multimodal_embed(inputs, model, input_type, truncation, output_dtype, output_dimension)
- Video.from_path(..., model=..., optimize=True) for voyage-multimodal-3.5
- Client.rerank(query, documents, model, top_k, truncation) is text-only
"""

from __future__ import annotations

from app.config import Settings
from app.errors import ProviderError
from app.providers.base import EmbeddingResult


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
        return self._embed([parts], input_type="document", strategy=strategy)

    def embed_query(self, text: str) -> list[float]:
        result = self._embed([[text]], input_type="query", strategy="query")
        return list(result["vector"])

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
            raise _map_voyage(exc, capability="rerank") from exc
        order = sorted(result.results, key=lambda item: item.index)
        # relevance_score is a reranker score, not a probability. Callers must not display it as certainty.
        ranked = sorted(result.results, key=lambda item: item.relevance_score, reverse=True)
        return [int(item.index) for item in ranked]

    def _embed(self, inputs: list, *, input_type: str, strategy: str) -> EmbeddingResult:
        try:
            result = self._sdk().multimodal_embed(
                inputs=inputs,
                model=self.model,
                input_type=input_type,
                truncation=False,
                output_dtype="float",
                output_dimension=self.dimensions,
            )
        except ProviderError:
            raise
        except Exception as exc:
            raise _map_voyage(exc, capability="embeddings") from exc
        vector = list(result.embeddings[0])
        if len(vector) != self.dimensions:
            raise ProviderError(
                "EMBEDDING_DIMENSION_MISMATCH",
                {"expected": self.dimensions, "actual": len(vector), "model": self.model},
                retryable=False,
            )
        returned_model = getattr(result, "model", None)
        if returned_model and returned_model != self.model:
            raise ProviderError(
                "EMBEDDING_MODEL_MISMATCH",
                {"expected": self.model, "actual": returned_model},
                retryable=False,
            )
        return EmbeddingResult(
            vector=vector,
            model=self.model,
            dimensions=len(vector),
            strategy=strategy,
            inputType=input_type,
        )


def _map_voyage(exc: Exception, *, capability: str) -> ProviderError:
    name = exc.__class__.__name__.lower()
    text = str(exc).lower()
    if "ratelimit" in name or "429" in text or "rate limit" in text:
        return ProviderError("PROVIDER_RATE_LIMITED", {"provider": "voyage", "capability": capability}, retryable=True)
    return ProviderError("PROVIDER_FAILED", {"provider": "voyage", "capability": capability}, retryable=True)
