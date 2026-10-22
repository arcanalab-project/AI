from app.pipeline.routing import route_primary, text_for_shared_space, wants_transcript_document


def test_image_route_is_pixels_only():
    route = route_primary("image", clip_within_limit=False, has_frames=True, native_failed=False)
    assert route.modality == "image"
    assert route.strategy == "image"
    assert route.kind == "image"


def test_video_prefers_native_clip_and_falls_back_to_frames():
    native = route_primary("video", clip_within_limit=True, has_frames=True, native_failed=False)
    frames = route_primary("video", clip_within_limit=True, has_frames=True, native_failed=True)
    assert native.strategy == "native_video"
    assert frames.strategy == "sampled_frames"
    assert frames.modality == "video"


def test_audio_and_text_use_the_shared_text_input():
    assert route_primary("audio", clip_within_limit=False, has_frames=False, native_failed=False).modality == "audio"
    assert route_primary("text", clip_within_limit=False, has_frames=False, native_failed=False).modality == "text"


def test_video_speech_gets_its_own_transcript_document():
    assert wants_transcript_document("video", "Inspection complete.")
    assert not wants_transcript_document("video", "  ")
    assert not wants_transcript_document("audio", "Inspection complete.")


def test_ocr_is_not_part_of_the_shared_text_input():
    assert text_for_shared_space("text", transcript=None, source_text="Checklist line", no_speech=False) == "Checklist line"
    assert "TRAINING" not in text_for_shared_space("image", transcript=None, source_text=None, no_speech=False)
    assert text_for_shared_space("audio", transcript=None, source_text=None, no_speech=True) == "No speech detected."


def test_text_model_change_removes_the_previous_generation_first():
    from app.pipeline.generations import swap_deletes_previous_first

    assert swap_deletes_previous_first(
        previous_model="voyage-multimodal-3.5",
        previous_dimensions=1024,
        previous_pipeline_version="v1",
        next_model="voyage-multimodal-3.5",
        next_dimensions=1024,
        next_pipeline_version="v1",
        text_channel_enabled=True,
        previous_text_model=None,
        previous_text_dimensions=None,
        next_text_model="voyage-4-large",
        next_text_dimensions=1024,
    )
