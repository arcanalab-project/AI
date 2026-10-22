from app.search.grouping import group_nearby_hits


def test_nearby_video_hits_collapse():
    hits = [
        {"segmentId": "1", "assetId": "v", "mediaType": "video", "startMs": 0, "endMs": 10000},
        {"segmentId": "2", "assetId": "v", "mediaType": "video", "startMs": 8000, "endMs": 18000},
        {"segmentId": "3", "assetId": "v", "mediaType": "video", "startMs": 60000, "endMs": 70000},
        {"segmentId": "4", "assetId": "i", "mediaType": "image", "startMs": None, "endMs": None},
    ]
    grouped = group_nearby_hits(hits, gap_ms=2000)
    assert [item["segmentId"] for item in grouped] == ["1", "3", "4"]
    assert grouped[0]["nearbyCount"] == 1
    assert grouped[0]["nearby"][0]["segmentId"] == "2"


def test_different_assets_are_not_grouped():
    hits = [
        {"segmentId": "1", "assetId": "a", "mediaType": "video", "startMs": 0, "endMs": 5000},
        {"segmentId": "2", "assetId": "b", "mediaType": "video", "startMs": 0, "endMs": 5000},
    ]
    assert len(group_nearby_hits(hits)) == 2
