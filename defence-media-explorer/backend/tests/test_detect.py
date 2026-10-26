import zipfile
from pathlib import Path

import pytest

from app.errors import AppError
from app.media.detect import detect_mime, media_type_for_mime
from app.media.documents import DOCX_MIME, PDF_MIME


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


def test_pdf_and_docx_join_the_text_path(tmp_path: Path):
    assert detect_mime(b"%PDF-1.7\n", "brief.pdf") == PDF_MIME
    assert media_type_for_mime(PDF_MIME) == "text"
    document = tmp_path / "note.docx"
    _write_docx(document, "Convoy order KILO-4418")
    header = document.read_bytes()[:64]
    assert detect_mime(header, "note.docx", source=document) == DOCX_MIME
    assert media_type_for_mime(DOCX_MIME) == "text"


def test_pdf_and_docx_must_match_their_contents(tmp_path: Path):
    with pytest.raises(AppError) as caught:
        detect_mime(b"\xff\xd8\xff", "brief.pdf")
    assert caught.value.code == "FILE_TYPE_MISMATCH"
    archive = tmp_path / "sheet.docx"
    with zipfile.ZipFile(archive, "w") as handle:
        handle.writestr("xl/workbook.xml", "<workbook/>")
    with pytest.raises(AppError) as caught:
        detect_mime(archive.read_bytes()[:64], "sheet.docx", source=archive)
    assert caught.value.code == "FILE_TYPE_MISMATCH"


def _write_docx(path: Path, sentence: str) -> None:
    xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        f"<w:body><w:p><w:r><w:t>{sentence}</w:t></w:r></w:p></w:body></w:document>"
    )
    with zipfile.ZipFile(path, "w") as handle:
        handle.writestr("word/document.xml", xml)
