"""Single HTTP Range parser for the media route. End is inclusive."""

from __future__ import annotations


def parse_byte_range(header: str | None, length: int) -> tuple[int, int] | None:
    """Return an inclusive span, None for the whole file, or raise ValueError."""

    if header is None or header == "":
        return None
    if length < 0:
        raise ValueError("negative length")
    text = header.strip()
    if not text.lower().startswith("bytes="):
        raise ValueError("unsupported unit")
    spec = text.split("=", 1)[1].split(",", 1)[0].strip()
    if "-" not in spec:
        raise ValueError("missing hyphen")
    start_text, end_text = spec.split("-", 1)
    if length == 0:
        raise ValueError("empty")
    if start_text == "":
        if not end_text:
            raise ValueError("empty suffix")
        suffix = int(end_text)
        if suffix <= 0:
            raise ValueError("suffix")
        if suffix >= length:
            return 0, length - 1
        return length - suffix, length - 1
    start = int(start_text)
    end = length - 1 if end_text == "" else int(end_text)
    if start < 0 or start >= length or end < start:
        raise ValueError("unsatisfiable")
    return start, min(end, length - 1)
