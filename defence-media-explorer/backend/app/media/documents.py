"""Text extraction for PDF and Word (.docx). Both become the same text chunks as a TXT upload."""

from __future__ import annotations

import zipfile
from pathlib import Path
from xml.etree import ElementTree

from pypdf import PdfReader
from pypdf.errors import PdfReadError

from app.errors import AppError

PDF_MIME = "application/pdf"
DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
_WORD_NS = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def looks_like_pdf(header: bytes) -> bool:
    window = header[:1024].lstrip(b"\xef\xbb\xbf \t\r\n")
    return window.startswith(b"%PDF")


def docx_has_document(path: Path) -> bool:
    try:
        with zipfile.ZipFile(path) as archive:
            return "word/document.xml" in archive.namelist()
    except (zipfile.BadZipFile, OSError):
        return False


def read_text_content(path: Path, mime: str) -> str:
    kind = (mime or "text/plain").split(";", 1)[0].strip().lower()
    if kind == PDF_MIME:
        return _pdf_text(path)
    if kind == DOCX_MIME:
        return _docx_text(path)
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError as exc:
        raise AppError("TEXT_ENCODING_UNSUPPORTED", 422, {}) from exc
    if "\x00" in text:
        raise AppError("CORRUPT_MEDIA", 422, {"reason": "binary"})
    return text


def _pdf_text(path: Path) -> str:
    try:
        reader = PdfReader(str(path))
    except (PdfReadError, OSError, ValueError) as exc:
        raise AppError("CORRUPT_MEDIA", 422, {"reason": "unreadable_pdf"}) from exc
    if reader.is_encrypted:
        raise AppError("CORRUPT_MEDIA", 422, {"reason": "encrypted_pdf"})
    parts: list[str] = []
    for page in reader.pages:
        try:
            extracted = page.extract_text() or ""
        except (PdfReadError, ValueError, KeyError):
            extracted = ""
        cleaned = extracted.strip()
        if cleaned:
            parts.append(cleaned)
    return "\n\n".join(parts)


def _docx_text(path: Path) -> str:
    try:
        with zipfile.ZipFile(path) as archive:
            payload = archive.read("word/document.xml")
    except (KeyError, zipfile.BadZipFile, OSError) as exc:
        raise AppError("CORRUPT_MEDIA", 422, {"reason": "unreadable_docx"}) from exc
    try:
        root = ElementTree.fromstring(payload)
    except ElementTree.ParseError as exc:
        raise AppError("CORRUPT_MEDIA", 422, {"reason": "unreadable_docx"}) from exc
    lines: list[str] = []
    for paragraph in root.iter(f"{_WORD_NS}p"):
        line = "".join(node.text or "" for node in paragraph.iter(f"{_WORD_NS}t")).strip()
        if line:
            lines.append(line)
    return "\n".join(lines)
