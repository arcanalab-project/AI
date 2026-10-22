from app.config import Settings
from app.search.service import SearchService


class _Archive:
    def find_segments(self, *_args, **_kwargs):
        raise AssertionError("empty query must not browse the archive")

    def count_assets_for_segments(self, *_args, **_kwargs):
        raise AssertionError("empty query must not count the archive")


def test_empty_query_returns_no_results():
    settings = Settings(embedding_dimensions=2048, session_secret="x" * 16)
    service = SearchService(settings, _Archive(), None, None, server_version="8.0.0")
    payload = service.search("workspace", {"query": "   ", "mode": "hybrid"})
    assert payload["results"] == []
    assert payload["returnedCount"] == 0
    assert payload["completeMatchCount"] == 0
    assert payload["rerankApplied"] is False
