"""Semantic, full-text, and hybrid retrieval.

$rankFusion is used on MongoDB 8+. If this deployment rejects the stage, ranks are
fused in the API with reciprocal rank fusion. Raw scores are never added together.
"""

from __future__ import annotations

import time
from typing import Any

from datetime import datetime

from pymongo.errors import OperationFailure

from app.config import Settings
from app.errors import AppError, ProviderError
from app.pipeline.retry import call_provider
from app.pipeline.text import excerpt
from app.search.clauses import text_should_clauses, to_search_filter_clauses
from app.search.filters import build_metadata_filter
from app.search.grouping import group_nearby_hits
from app.search.rrf import reciprocal_rank_fusion


class SearchService:
    def __init__(self, settings: Settings, repo, embeddings, storage, *, server_version: str | None) -> None:
        self.settings = settings
        self.repo = repo
        self.embeddings = embeddings
        self.storage = storage
        self.server_version = server_version or ""

    def search(self, workspace_id: str, body: dict[str, Any]) -> dict[str, Any]:
        started = time.perf_counter()
        query = (body.get("query") or "").strip()
        mode = body.get("mode") or "hybrid"
        if mode not in {"semantic", "fulltext", "hybrid"}:
            raise AppError("VALIDATION_ERROR", 422, {"fields": ["mode"]})
        filters = self._normalise_filters(body.get("filters") or {})
        page = max(int(body.get("page") or 1), 1)
        page_size = min(max(int(body.get("pageSize") or self.settings.search_top_k), 1), 50)
        sort = body.get("sort") or ("relevance" if query else "uploadedAt_desc")
        time_zone = filters.get("timeZone") or self.settings.default_timezone
        warnings: list[dict[str, Any]] = []

        if not query:
            payload = self._browse(workspace_id, filters, sort, page, page_size)
            payload["fusion"] = None
            payload["rerankApplied"] = False
        else:
            window = max(self.settings.search_top_k, page * page_size)
            if mode == "semantic":
                hits, fusion = self._semantic(workspace_id, query, filters, window)
            elif mode == "fulltext":
                hits, fusion = self._fulltext(workspace_id, query, filters, window, body.get("queryLanguage")), None
            else:
                hits, fusion = self._hybrid(workspace_id, query, filters, window, body.get("queryLanguage"))
            hits, rerank_applied, rerank_warning = self._maybe_rerank(query, hits)
            if rerank_warning:
                warnings.append(rerank_warning)
            if sort != "relevance":
                hits = _sort_window(hits, sort)
                warnings.append({"code": "SORT_WINDOW", "params": {}})
            for hit in hits:
                hit["segmentId"] = str(hit.get("_id"))
                hit["assetId"] = str(hit.get("assetId"))
            grouped = group_nearby_hits(hits, gap_ms=self.settings.nearby_gap_ms)
            start = (page - 1) * page_size
            page_items = grouped[start : start + page_size]
            payload = {
                "results": [self._card(item, rank=start + index + 1) for index, item in enumerate(page_items)],
                "mode": mode,
                "fusion": fusion,
                "retrievedCandidateCount": len(hits),
                "returnedCount": len(page_items),
                "completeMatchCount": None,
                "assetCount": None,
                "countKind": "retrieved_candidates",
                "rerankApplied": rerank_applied,
            }
        payload.update(
            {
                "timeZone": time_zone,
                "elapsedMs": int((time.perf_counter() - started) * 1000),
                "page": page,
                "pageSize": page_size,
                "warnings": warnings,
                "queryLanguage": body.get("queryLanguage"),
            }
        )
        return payload

    def similar(self, workspace_id: str, segment: dict, limit: int) -> dict[str, Any]:
        started = time.perf_counter()
        vector = segment.get("embedding")
        if not vector:
            raise AppError("SEARCH_UNAVAILABLE", 409, {"reason": "segment_has_no_embedding"})
        if len(vector) != self.settings.embedding_dimensions:
            raise AppError(
                "EMBEDDING_DIMENSION_MISMATCH",
                409,
                {"expected": self.settings.embedding_dimensions, "actual": len(vector)},
            )
        filt = build_metadata_filter(workspace_id, {"processingStatuses": ["ready", "partial"]})
        hits = self._vector_query(vector, filt, max(limit + 1, 5))
        hits = [hit for hit in hits if hit["_id"] != segment["_id"]][:limit]
        grouped = group_nearby_hits(hits, gap_ms=self.settings.nearby_gap_ms)
        return {
            "results": [self._card(item, rank=index + 1) for index, item in enumerate(grouped)],
            "mode": "semantic",
            "fusion": None,
            "retrievedCandidateCount": len(hits),
            "returnedCount": len(grouped),
            "completeMatchCount": None,
            "assetCount": None,
            "countKind": "retrieved_candidates",
            "rerankApplied": False,
            "timeZone": self.settings.default_timezone,
            "elapsedMs": int((time.perf_counter() - started) * 1000),
            "page": 1,
            "pageSize": limit,
            "warnings": [],
            "queryLanguage": None,
        }

    def _browse(self, workspace_id: str, filters: dict, sort: str, page: int, page_size: int) -> dict[str, Any]:
        query = build_metadata_filter(workspace_id, filters)
        mongo_sort = _mongo_sort(sort if sort != "relevance" else "uploadedAt_desc")
        skip = (page - 1) * page_size
        rows, total = self.repo.find_segments(query, mongo_sort, skip, page_size)
        asset_count = self.repo.count_assets_for_segments(query)
        cards = [self._card({**row, "segmentId": str(row["_id"]), "assetId": str(row["assetId"])}, rank=skip + index + 1) for index, row in enumerate(rows)]
        return {
            "results": cards,
            "mode": "browse",
            "retrievedCandidateCount": len(rows),
            "returnedCount": len(rows),
            "completeMatchCount": total,
            "assetCount": asset_count,
            "countKind": "matching_segments",
        }

    def _semantic(self, workspace_id: str, query: str, filters: dict, limit: int) -> tuple[list[dict], str | None]:
        vector = self._query_vector(query)
        filt = build_metadata_filter(workspace_id, filters)
        text_vector = self._text_query_vector(query)
        if text_vector is None:
            return self._vector_query(vector, filt, limit), None
        if self._supports_rank_fusion():
            try:
                return self._rank_fusion(vector, filt, query, None, limit, text_vector=text_vector, include_lexical=False), "rankFusion"
            except OperationFailure as exc:
                if not _rank_fusion_rejected(exc):
                    raise _search_error(exc) from exc
        visual = self._vector_query(vector, filt, limit)
        textual = self._text_vector_query(text_vector, filt, limit)
        return _fuse_hits([visual, textual], self.settings.rrf_k), "backend_rrf"

    def _fulltext(self, workspace_id: str, query: str, filters: dict, limit: int, query_language: str | None) -> list[dict]:
        filt = build_metadata_filter(workspace_id, filters)
        pipeline = [
            {
                "$search": {
                    "index": self.settings.atlas_search_index,
                    "compound": {
                        "filter": to_search_filter_clauses(filt),
                        "should": text_should_clauses(query, query_language),
                        "minimumShouldMatch": 1,
                    },
                }
            },
            {"$limit": limit},
            {"$project": {"embedding": 0, "textEmbedding": 0}},
        ]
        try:
            rows = self.repo.aggregate_segments(pipeline)
        except OperationFailure as exc:
            raise _search_error(exc) from exc
        return rows

    def _hybrid(self, workspace_id: str, query: str, filters: dict, limit: int, query_language: str | None) -> tuple[list[dict], str]:
        vector = self._query_vector(query)
        filt = build_metadata_filter(workspace_id, filters)
        text_vector = self._text_query_vector(query)
        if self._supports_rank_fusion():
            try:
                return self._rank_fusion(vector, filt, query, query_language, limit, text_vector=text_vector, include_lexical=True), "rankFusion"
            except OperationFailure as exc:
                if not _rank_fusion_rejected(exc):
                    raise _search_error(exc) from exc
        groups = [self._vector_query(vector, filt, limit), self._fulltext(workspace_id, query, filters, limit, query_language)]
        if text_vector is not None:
            groups.append(self._text_vector_query(text_vector, filt, limit))
        return _fuse_hits(groups, self.settings.rrf_k), "backend_rrf"

    def _rank_fusion(
        self,
        vector: list[float],
        filt: dict,
        query: str,
        query_language: str | None,
        limit: int,
        *,
        text_vector: list[float] | None = None,
        include_lexical: bool = True,
    ) -> list[dict]:
        candidates = max(self.settings.vector_num_candidates, limit)
        pipelines: dict[str, list] = {
            "vector": [
                {
                    "$vectorSearch": {
                        "index": self.settings.atlas_vector_index,
                        "path": "embedding",
                        "queryVector": vector,
                        "numCandidates": candidates,
                        "limit": limit,
                        "filter": filt,
                    }
                }
            ]
        }
        if include_lexical:
            pipelines["text"] = [
                {
                    "$search": {
                        "index": self.settings.atlas_search_index,
                        "compound": {
                            "filter": to_search_filter_clauses(filt),
                            "should": text_should_clauses(query, query_language),
                            "minimumShouldMatch": 1,
                        },
                    }
                },
                {"$limit": limit},
            ]
        if text_vector is not None:
            if len(text_vector) != self.settings.text_embedding_dimensions:
                raise AppError(
                    "EMBEDDING_DIMENSION_MISMATCH",
                    502,
                    {
                        "expected": self.settings.text_embedding_dimensions,
                        "actual": len(text_vector),
                        "model": self.settings.voyage_text_model,
                    },
                )
            pipelines["textVector"] = [
                {
                    "$vectorSearch": {
                        "index": self.settings.atlas_text_vector_index,
                        "path": "textEmbedding",
                        "queryVector": text_vector,
                        "numCandidates": candidates,
                        "limit": limit,
                        "filter": filt,
                    }
                }
            ]
        pipeline = [
            {
                "$rankFusion": {
                    "input": {"pipelines": pipelines},
                    "combination": {"weights": {name: 1 for name in pipelines}},
                }
            },
            {"$project": {"embedding": 0, "textEmbedding": 0}},
            {"$limit": limit},
        ]
        return self.repo.aggregate_segments(pipeline)

    def _vector_query(self, vector: list[float], filt: dict, limit: int) -> list[dict]:
        if len(vector) != self.settings.embedding_dimensions:
            raise AppError(
                "EMBEDDING_DIMENSION_MISMATCH",
                502,
                {"expected": self.settings.embedding_dimensions, "actual": len(vector), "model": self.settings.voyage_multimodal_model},
            )
        pipeline = [
            {
                "$vectorSearch": {
                    "index": self.settings.atlas_vector_index,
                    "path": "embedding",
                    "queryVector": vector,
                    "numCandidates": max(self.settings.vector_num_candidates, limit),
                    "limit": limit,
                    "filter": filt,
                }
            },
            {"$project": {"embedding": 0, "textEmbedding": 0}},
        ]
        try:
            return self.repo.aggregate_segments(pipeline)
        except OperationFailure as exc:
            raise _search_error(exc) from exc

    def _text_vector_query(self, vector: list[float], filt: dict, limit: int) -> list[dict]:
        if len(vector) != self.settings.text_embedding_dimensions:
            raise AppError(
                "EMBEDDING_DIMENSION_MISMATCH",
                502,
                {"expected": self.settings.text_embedding_dimensions, "actual": len(vector), "model": self.settings.voyage_text_model},
            )
        pipeline = [
            {
                "$vectorSearch": {
                    "index": self.settings.atlas_text_vector_index,
                    "path": "textEmbedding",
                    "queryVector": vector,
                    "numCandidates": max(self.settings.vector_num_candidates, limit),
                    "limit": limit,
                    "filter": filt,
                }
            },
            {"$project": {"embedding": 0, "textEmbedding": 0}},
        ]
        try:
            return self.repo.aggregate_segments(pipeline)
        except OperationFailure as exc:
            raise _search_error(exc) from exc

    def _query_vector(self, query: str) -> list[float]:
        if not self.settings.embeddings_configured:
            raise AppError("PROVIDER_NOT_CONFIGURED", 503, {"provider": "voyage", "capability": "embeddings"})
        try:
            vector = call_provider(lambda: self.embeddings.embed_query(query))
        except ProviderError as exc:
            raise AppError(exc.code, exc.status_code, exc.params) from exc
        return vector

    def _text_query_vector(self, query: str) -> list[float] | None:
        if not self.settings.enable_text_embeddings:
            return None
        if not self.settings.embeddings_configured:
            raise AppError("PROVIDER_NOT_CONFIGURED", 503, {"provider": "voyage", "capability": "textEmbeddings"})
        try:
            return call_provider(lambda: self.embeddings.embed_text_query(query))
        except ProviderError as exc:
            raise AppError(exc.code, exc.status_code, exc.params) from exc

    def _maybe_rerank(self, query: str, hits: list[dict]) -> tuple[list[dict], bool, dict | None]:
        if not self.settings.enable_rerank or not hits:
            return hits, False, None
        documents = [excerpt(hit.get("searchText"), hit.get("transcript"), hit.get("title"), limit=4000) or hit.get("title") or "" for hit in hits]
        try:
            order = call_provider(lambda: self.embeddings.rerank(query, documents))
        except ProviderError as exc:
            return hits, False, {"code": exc.code, "params": exc.params}
        reranked = []
        for index in order:
            if 0 <= index < len(hits):
                reranked.append(hits[index])
        seen = {id(item) for item in reranked}
        for item in hits:
            if id(item) not in seen:
                reranked.append(item)
        return reranked, True, None

    def _supports_rank_fusion(self) -> bool:
        major = self.server_version.split(".", 1)[0]
        return major.isdigit() and int(major) >= 8

    def _normalise_filters(self, filters: dict) -> dict:
        cleaned = dict(filters)
        for key in ("dateFrom", "dateTo"):
            value = cleaned.get(key)
            if isinstance(value, str) and value:
                from app.api.parsing import parse_instant

                cleaned[key] = parse_instant(value, cleaned.get("timeZone") or self.settings.default_timezone)
            elif value in ("", None):
                cleaned[key] = None
        return cleaned

    def _card(self, hit: dict, *, rank: int) -> dict:
        segment_id = str(hit.get("segmentId") or hit.get("_id"))
        asset_id = str(hit.get("assetId"))
        thumb = hit.get("thumbnailObject") or {}
        description = hit.get("modelDescription") or hit.get("description") or ""
        return {
            "segmentId": segment_id,
            "assetId": asset_id,
            "mediaType": hit.get("mediaType"),
            "segmentType": hit.get("segmentType"),
            "title": hit.get("title") or "",
            "source": hit.get("source"),
            "capturedAt": hit.get("capturedAt"),
            "uploadedAt": hit.get("uploadedAt"),
            "captureDateUnknown": bool(hit.get("captureDateUnknown")),
            "description": description,
            "matchText": excerpt(hit.get("transcript"), hit.get("ocrText"), description, hit.get("userDescription")),
            "startMs": hit.get("startMs"),
            "endMs": hit.get("endMs"),
            "thumbnailUrl": _sign(self.storage, thumb) if thumb.get("key") else None,
            "tags": hit.get("tags") or [],
            "categories": hit.get("categories") or [],
            "sourceLanguage": hit.get("sourceLanguage"),
            "processingStatus": hit.get("processingStatus"),
            "rank": rank,
            "nearbyCount": len(hit.get("nearby") or []),
            "nearby": [
                {
                    "segmentId": str(item.get("segmentId") or item.get("_id")),
                    "startMs": item.get("startMs"),
                    "endMs": item.get("endMs"),
                    "matchText": excerpt(item.get("transcript"), item.get("ocrText"), item.get("modelDescription")),
                }
                for item in hit.get("nearby") or []
            ],
        }


def _sign(storage, obj: dict) -> str | None:
    if storage is None or not obj or not obj.get("key"):
        return None
    try:
        return storage.presign_get(obj["key"], 900)
    except Exception:
        return None


def _mongo_sort(sort: str) -> list[tuple[str, int]]:
    mapping = {
        "capturedAt_desc": [("capturedAt", -1)],
        "capturedAt_asc": [("capturedAt", 1)],
        "uploadedAt_desc": [("uploadedAt", -1)],
        "uploadedAt_asc": [("uploadedAt", 1)],
    }
    return mapping.get(sort, [("uploadedAt", -1)])


def _sort_window(hits: list[dict], sort: str) -> list[dict]:
    field, _, direction = sort.partition("_")
    if field not in {"capturedAt", "uploadedAt"}:
        return hits
    dated = [item for item in hits if isinstance(item.get(field), datetime)]
    missing = [item for item in hits if not isinstance(item.get(field), datetime)]
    dated.sort(key=lambda item: item[field], reverse=direction != "asc")
    return dated + missing


def _fuse_hits(groups: list[list[dict]], k: int) -> list[dict]:
    fused = reciprocal_rank_fusion([[str(item["_id"]) for item in group] for group in groups], k=k)
    by_id: dict[str, dict] = {}
    for group in groups:
        for item in group:
            by_id[str(item["_id"])] = item
    return [by_id[doc_id] for doc_id, _score in fused if doc_id in by_id]


def _rank_fusion_rejected(exc: OperationFailure) -> bool:
    text = str(exc).lower()
    return "rankfusion" in text or getattr(exc, "code", None) in {40324, 40323}


def _search_error(exc: OperationFailure) -> AppError:
    text = str(exc).lower()
    if "index" in text and ("not found" in text or "does not exist" in text):
        return AppError("INDEX_NOT_READY", 503, {})
    return AppError("SEARCH_UNAVAILABLE", 503, {})
