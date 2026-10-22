import pytest

from app.errors import AppError
from app.media.detect import detect_mime, media_type_for_mime


def test_magic_bytes_and_extension_agree():
    assert detect_mime(b"\xff\xd8\xff extra", "photo.jpg") == "image/jpeg"
    assert detect_mime(b"\x89PNG\r\n\x1a\n rest", "photo.png") == "image/png"
    assert detect_mime(b"RIFF0000WEBP", "photo.webp") == "image/webp"
    assert detect_mime(b"RIFF0000WAVE", "note.wav") == "audio/wav"
    assert detect_mime(b"ID3rest", "note.mp3") == "audio/mpeg"
    assert detect_mime(b"\x00\x00\x00\x18ftypmp42", "clip.mp4") == "video/mp4"
    assert detect_mime(b"\x00\x00\x00\x18ftypqt  ", "clip.mov") == "video/quicktime"
    assert detect_mime(b"\x00\x00\x00\x18ftypM4A ", "clip.m4a") == "audio/mp4"
    assert detect_mime("Ispezione dell'equipaggiamento".encode(), "note.txt") == "text/plain"
    assert media_type_for_mime("image/jpeg") == "image"


def test_extension_mismatch_is_rejected():
    with pytest.raises(AppError) as caught:
        detect_mime(b"\xff\xd8\xff", "clip.mp4")
    assert caught.value.code == "FILE_TYPE_MISMATCH"


def test_binary_text_is_rejected():
    with pytest.raises(AppError) as caught:
        detect_mime(b"\x00\x01\x02", "notes.txt")
    assert caught.value.code == "FILE_TYPE_MISMATCH"


def test_unknown_type_is_rejected():
    with pytest.raises(AppError) as caught:
        detect_mime(b"not-a-media-file", "file.bin")
    assert caught.value.code == "FILE_TYPE_UNSUPPORTED"
