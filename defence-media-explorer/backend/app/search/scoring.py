"""Map Atlas and API fusion scores onto search result cards."""

from __future__ import annotations

from typing import Any


def add_vector_search_score_stage() -> dict[str, Any]:
    return {"$addFields": {"vectorSearchScore": {"$meta": "vectorSearchScore"}}}


def add_text_search_score_stage() -> dict[str, Any]:
    return {"$addFields": {"searchScore": {"$meta": "searchScore"}}}


def add_fusion_score_stage() -> dict[str, Any]:
    return {"$addFields": {"fusionScore": {"$meta": "searchScore"}}}


def merge_fused_hits(
    groups: list[list[dict[str, Any]]],
    channel_keys: list[str],
    *,
    k: int,
) -> list[dict[str, Any]]:
    from app.search.rrf import reciprocal_rank_fusion

    rankings = [[str(item["_id"]) for item in group] for group in groups]
    fused = reciprocal_rank_fusion(rankings, k=k)
    rrf_by_id = dict(fused)
    by_id: dict[str, dict[str, Any]] = {}
    components: dict[str, dict[str, float]] = {}
    for key, group in zip(channel_keys, groups):
        for item in group:
            doc_id = str(item["_id"])
            stored = by_id.get(doc_id)
            if stored is None:
                stored = dict(item)
                by_id[doc_id] = stored
            comp = components.setdefault(doc_id, {})
            if key:
                comp[key] = _channel_score(item)
    ordered: list[dict[str, Any]] = []
    for doc_id, rrf_score in fused:
        hit = by_id.get(doc_id)
        if hit is None:
            continue
        hit["_rrfScore"] = float(rrf_score)
        hit["_scoreComponents"] = components.get(doc_id, {})
        ordered.append(hit)
    return ordered


def _channel_score(item: dict[str, Any]) -> float:
    for key in ("fusionScore", "vectorSearchScore", "searchScore"):
        value = item.get(key)
        if isinstance(value, (int, float)):
            return float(value)
    return 0.0


def relevance_for_hit(hit: dict[str, Any], mode: str, fusion: str | None) -> dict[str, Any] | None:
    components = dict(hit.get("_scoreComponents") or {})
    for key, field in (
        ("vectorSearchScore", "vectorSearchScore"),
        ("searchScore", "searchScore"),
        ("textVectorSearchScore", "textVectorSearchScore"),
    ):
        value = hit.get(field)
        if isinstance(value, (int, float)):
            components[key] = float(value)
    if isinstance(hit.get("_rrfScore"), (int, float)):
        components["rrfScore"] = float(hit["_rrfScore"])
    if isinstance(hit.get("fusionScore"), (int, float)):
        components["fusionScore"] = float(hit["fusionScore"])

    score: float | None = None
    score_type = ""
    method = fusion

    if mode == "fulltext":
        score = _first_float(hit, "searchScore")
        score_type = "fulltext"
    elif mode == "semantic":
        if fusion == "backend_rrf" and isinstance(hit.get("_rrfScore"), (int, float)):
            score = float(hit["_rrfScore"])
            score_type = "semantic_rrf"
            method = "backend_rrf"
        else:
            score = _first_float(hit, "vectorSearchScore")
            score_type = "semantic"
    else:
        if fusion == "rankFusion":
            score = _first_float(hit, "fusionScore")
            score_type = "hybrid_rank_fusion"
        elif isinstance(hit.get("_rrfScore"), (int, float)):
            score = float(hit["_rrfScore"])
            score_type = "hybrid_rrf"
            method = "backend_rrf"
        else:
            score = _first_float(hit, "fusionScore", "vectorSearchScore", "searchScore")
            score_type = "hybrid"

    if score is None:
        return None
    payload: dict[str, Any] = {"score": score, "scoreType": score_type}
    if method:
        payload["fusion"] = method
    if components:
        payload["components"] = components
    return payload


def match_evidence(hit: dict[str, Any]) -> dict[str, Any]:
    evidence: dict[str, Any] = {}
    transcript = (hit.get("transcript") or "").strip()
    ocr = (hit.get("ocrText") or "").strip()
    description = (hit.get("modelDescription") or hit.get("description") or "").strip()
    user_description = (hit.get("userDescription") or "").strip()
    tags = [tag for tag in (hit.get("tags") or []) if isinstance(tag, str) and tag.strip()]
    if transcript:
        evidence["transcript"] = transcript
    if ocr:
        evidence["ocrText"] = ocr
    if description:
        evidence["sceneDescription"] = description
    if user_description:
        evidence["userDescription"] = user_description
    if tags:
        evidence["tags"] = tags
    strategy = hit.get("embeddingStrategy")
    if isinstance(strategy, str) and strategy:
        evidence["embeddingStrategy"] = strategy
    return evidence


def _first_float(hit: dict[str, Any], *keys: str) -> float | None:
    for key in keys:
        value = hit.get(key)
        if isinstance(value, (int, float)):
            return float(value)
    return None
