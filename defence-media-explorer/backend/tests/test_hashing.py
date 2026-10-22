from pathlib import Path

from app.media.hashing import sha256_bytes, sha256_file


def test_sha256_is_stable():
    assert sha256_bytes(b"defence") == sha256_bytes(b"defence")
    assert sha256_bytes(b"defence") != sha256_bytes(b"defence-2")


def test_sha256_file_matches_bytes(tmp_path: Path):
    path = tmp_path / "file.bin"
    payload = b"tracked-vehicle" * 1000
    path.write_bytes(payload)
    assert sha256_file(path) == sha256_bytes(payload)
