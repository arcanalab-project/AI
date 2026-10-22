from app.errors import ERROR_CODES, error_body


def test_known_code_is_preserved():
    body = error_body("DUPLICATE_ASSET", {"existingAssetId": "abc"})
    assert body == {"error": {"code": "DUPLICATE_ASSET", "params": {"existingAssetId": "abc"}}}


def test_unknown_code_becomes_internal_without_exception_text():
    body = error_body("Traceback (most recent call last)", {"detail": "boom"})
    assert body["error"]["code"] == "INTERNAL_ERROR"
    assert body["error"]["params"] == {}
    assert "Traceback" not in str(body)


def test_catalog_contains_pipeline_codes():
    for code in (
        "AUTH_REQUIRED",
        "DUPLICATE_ASSET",
        "CORRUPT_MEDIA",
        "PROVIDER_NOT_CONFIGURED",
        "EMBEDDING_DIMENSION_MISMATCH",
        "DELETE_INCOMPLETE",
        "QUEUE_UNAVAILABLE",
        "PASSWORD_POLICY",
    ):
        assert code in ERROR_CODES
