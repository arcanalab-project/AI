from datetime import datetime, timezone

from app.search.clauses import to_search_filter_clauses
from app.search.filters import build_metadata_filter


def test_vector_and_text_filters_share_workspace_and_media_type():
    start = datetime(2024, 3, 1, tzinfo=timezone.utc)
    end = datetime(2024, 3, 31, tzinfo=timezone.utc)
    match = build_metadata_filter(
        "ws-a",
        {
            "mediaTypes": ["video", "image"],
            "dateField": "capturedAt",
            "dateFrom": start,
            "dateTo": end,
            "unknownCapture": "exclude",
            "tags": ["mud"],
        },
    )
    clauses = to_search_filter_clauses(match)
    paths = []
    for clause in clauses:
        if "equals" in clause:
            paths.append(clause["equals"]["path"])
        if "in" in clause:
            paths.append(clause["in"]["path"])
        if "range" in clause:
            paths.append(clause["range"]["path"])
    assert "workspaceId" in paths
    assert "mediaType" in paths
    assert "capturedAt" in paths
    assert "tags" in paths
    assert match["$and"][0] == {"workspaceId": "ws-a"}
