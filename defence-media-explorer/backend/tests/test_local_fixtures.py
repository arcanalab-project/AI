from app.media.local_fixtures import fixture_file, local_playback_url


def test_synthetic_fixture_resolves_and_traversal_does_not():
    path, media_type = fixture_file("training-block.mp4")
    assert path is not None and path.name == "training-block.mp4"
    assert media_type == "video/mp4"
    assert fixture_file("../.env") == (None, None)
    assert fixture_file("..\\..\\..\\..\\.env") == (None, None)
    assert fixture_file("training-block.mp4/../../.env") == (None, None)
    assert fixture_file("") == (None, None)


def test_local_fixture_playback_url_ignores_object_storage_keys():
    assert local_playback_url({"bucket": "local", "key": "fixtures/synthetic/training-block.mp4"}) == (
        "/api/media/fixtures/training-block.mp4"
    )
    assert local_playback_url({"bucket": "defence-media", "key": "workspaces/demo/assets/clip.mp4"}) is None
    assert local_playback_url({"bucket": "local", "key": "fixtures/synthetic/missing.mp4"}) is None
    assert local_playback_url(None) is None
