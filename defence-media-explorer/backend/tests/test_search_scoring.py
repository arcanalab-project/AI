from app.search.scoring import merge_fused_hits, relevance_for_hit


def test_merge_fused_hits_attaches_rrf_score():
    visual = [{"_id": "a", "vectorSearchScore": 0.91}, {"_id": "b", "vectorSearchScore": 0.42}]
    text = [{"_id": "b", "searchScore": 12.5}, {"_id": "c", "searchScore": 8.0}]
    hits = merge_fused_hits([visual, text], ["multimodalVector", "fullText"], k=60)
    by_id = {str(hit["_id"]): hit for hit in hits}
    assert by_id["b"]["_rrfScore"] > by_id["c"]["_rrfScore"]
    assert "multimodalVector" in by_id["b"]["_scoreComponents"]
    assert "fullText" in by_id["b"]["_scoreComponents"]


def test_relevance_for_semantic_vector_score():
    hit = {"vectorSearchScore": 0.8241, "_scoreComponents": {"vectorSearchScore": 0.8241}}
    payload = relevance_for_hit(hit, "semantic", None)
    assert payload is not None
    assert payload["scoreType"] == "semantic"
    assert payload["score"] == 0.8241


def test_relevance_for_hybrid_rrf():
    hit = {"_rrfScore": 0.0323, "_scoreComponents": {"rrfScore": 0.0323, "multimodalVector": 0.5}}
    payload = relevance_for_hit(hit, "hybrid", "backend_rrf")
    assert payload is not None
    assert payload["scoreType"] == "hybrid_rrf"
    assert payload["score"] == 0.0323


def test_relevance_for_fulltext():
    hit = {"searchScore": 4.2, "_scoreComponents": {"searchScore": 4.2}}
    payload = relevance_for_hit(hit, "fulltext", None)
    assert payload is not None
    assert payload["scoreType"] == "fulltext"
    assert payload["score"] == 4.2
