from datetime import datetime, timezone

from app.search.filters import build_metadata_filter, workspace_guard


def _match(document: dict, query: dict) -> bool:
    if "$and" in query:
        return all(_match(document, part) for part in query["$and"])
    if "$or" in query:
        return any(_match(document, part) for part in query["$or"])
    for field, expected in query.items():
        value = document.get(field)
        if isinstance(expected, dict) and "$in" in expected:
            if isinstance(value, list):
                if not set(value) & set(expected["$in"]):
                    return False
            elif value not in expected["$in"]:
                return False
        elif isinstance(expected, dict) and ("$gte" in expected or "$lte" in expected):
            if not isinstance(value, datetime):
                return False
            if "$gte" in expected and value < expected["$gte"]:
                return False
            if "$lte" in expected and value > expected["$lte"]:
                return False
        elif isinstance(expected, dict):
            if not _match(value if isinstance(value, dict) else {field: value}, expected):
                return False
        elif value != expected:
            return False
    return True


def test_workspace_is_always_present():
    query = build_metadata_filter("ws-a", {"mediaTypes": ["video"]})
    assert _match({"workspaceId": "ws-a", "mediaType": "video", "processingStatus": "ready"}, query)
    assert not _match({"workspaceId": "ws-b", "mediaType": "video", "processingStatus": "ready"}, query)


def test_capture_range_excludes_unknown_unless_requested():
    start = datetime(2024, 1, 1, tzinfo=timezone.utc)
    end = datetime(2024, 12, 31, tzinfo=timezone.utc)
    known = {
        "workspaceId": "ws-a",
        "processingStatus": "ready",
        "capturedAt": datetime(2024, 6, 1, tzinfo=timezone.utc),
        "captureDateUnknown": False,
        "mediaType": "image",
    }
    unknown = {
        "workspaceId": "ws-a",
        "processingStatus": "ready",
        "capturedAt": None,
        "captureDateUnknown": True,
        "mediaType": "image",
    }
    ranged = build_metadata_filter(
        "ws-a",
        {"dateField": "capturedAt", "dateFrom": start, "dateTo": end, "unknownCapture": "exclude", "mediaTypes": ["image"]},
    )
    assert _match(known, ranged)
    assert not _match(unknown, ranged)
    included = build_metadata_filter(
        "ws-a",
        {"dateField": "capturedAt", "dateFrom": start, "dateTo": end, "unknownCapture": "include", "mediaTypes": ["image"]},
    )
    assert _match(unknown, included)
    only = build_metadata_filter("ws-a", {"dateField": "capturedAt", "unknownCapture": "only"})
    assert _match(unknown, only)
    assert not _match(known, only)


def test_upload_time_is_not_used_as_capture_time():
    uploaded = datetime(2026, 10, 20, tzinfo=timezone.utc)
    document = {
        "workspaceId": "ws-a",
        "processingStatus": "ready",
        "capturedAt": None,
        "captureDateUnknown": True,
        "uploadedAt": uploaded,
        "mediaType": "audio",
    }
    query = build_metadata_filter(
        "ws-a",
        {
            "dateField": "capturedAt",
            "dateFrom": uploaded,
            "dateTo": uploaded,
            "unknownCapture": "exclude",
            "mediaTypes": ["audio"],
        },
    )
    assert not _match(document, query)


def test_workspace_guard():
    assert workspace_guard({"workspaceId": "ws-a"}, "ws-a")
    assert not workspace_guard({"workspaceId": "ws-b"}, "ws-a")
    assert not workspace_guard(None, "ws-a")
