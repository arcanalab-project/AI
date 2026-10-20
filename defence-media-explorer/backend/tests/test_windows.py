import pytest

from app.media.windows import build_windows, group_transcript_windows, segment_text, snap_window_ends


def test_windows_cover_duration_with_overlap():
    windows = build_windows(12_000, 10_000, 2_000)
    assert windows == [(0, 10_000), (8_000, 12_000)]
    assert windows[-1][1] == 12_000


def test_short_media_is_one_window():
    assert build_windows(4_000, 10_000, 2_000) == [(0, 4_000)]
    assert build_windows(0, 10_000, 2_000) == [(0, 0)]


def test_overlap_must_be_smaller_than_window():
    with pytest.raises(ValueError):
        build_windows(20_000, 10_000, 10_000)


def test_scene_snap_moves_only_nearby_ends():
    snapped = snap_window_ends([(0, 10_000), (8_000, 18_000)], [10_400, 3_000])
    assert snapped[0] == (0, 10_400)
    assert snapped[1] == (8_000, 18_000)


def test_text_chunks_overlap_and_cover_the_end():
    text = "alpha " * 300
    chunks = segment_text(text, size=120, overlap=20)
    assert chunks[0][0] == 0
    assert chunks[-1][1] == len(text)
    assert chunks[1][0] < chunks[0][1]


def test_transcript_windows_keep_original_offsets():
    passages = [
        {"startMs": 1000, "endMs": 2500, "text": "Equipment inspection"},
        {"startMs": 9000, "endMs": 11000, "text": "of the vehicle"},
    ]
    grouped = group_transcript_windows(passages, 12_000, 10_000, 2_000)
    assert "Equipment inspection" in grouped[0]["text"]
    assert "vehicle" in grouped[1]["text"]
    assert grouped[1]["startMs"] == 8_000
