from app.search.rrf import reciprocal_rank_fusion


def test_rrf_rewards_agreement():
    fused = reciprocal_rank_fusion([["a", "b", "c"], ["b", "c", "a"]], k=60)
    scores = dict(fused)
    assert scores["b"] > scores["a"]
    assert scores["a"] > scores["c"] or scores["a"] == scores["c"]
    assert fused[0][0] == "b"


def test_rrf_does_not_add_raw_scores():
    fused = reciprocal_rank_fusion([["only-vector"], ["only-text"]], k=60)
    scores = dict(fused)
    assert scores["only-vector"] == scores["only-text"] == 1 / 61


def test_rrf_ignores_duplicate_ids_in_one_list():
    fused = dict(reciprocal_rank_fusion([["a", "a", "b"]], k=60))
    assert fused["a"] == 1 / 61
    assert fused["b"] == 1 / 62
