from app.errors import ProviderError
from app.pipeline.retry import call_provider


def test_retryable_errors_are_retried():
    calls = {"count": 0}

    def flaky():
        calls["count"] += 1
        if calls["count"] < 3:
            raise ProviderError("PROVIDER_RATE_LIMITED", {"provider": "voyage"}, retryable=True)
        return "ok"

    assert call_provider(flaky, sleep=lambda _: None) == "ok"
    assert calls["count"] == 3


def test_permanent_errors_are_not_retried():
    calls = {"count": 0}

    def fail():
        calls["count"] += 1
        raise ProviderError("EMBEDDING_DIMENSION_MISMATCH", {"expected": 1024, "actual": 8}, retryable=False)

    try:
        call_provider(fail, sleep=lambda _: None)
    except ProviderError as exc:
        assert exc.code == "EMBEDDING_DIMENSION_MISMATCH"
    assert calls["count"] == 1
