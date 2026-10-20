"""Stable error codes. The API returns codes and parameters, never raw exceptions."""

from __future__ import annotations

from typing import Any


class AppError(Exception):
    def __init__(self, code: str, status_code: int = 400, params: dict[str, Any] | None = None) -> None:
        self.code = code
        self.status_code = status_code
        self.params = params or {}
        super().__init__(code)


class ProviderError(AppError):
    def __init__(
        self,
        code: str,
        params: dict[str, Any] | None = None,
        *,
        retryable: bool = False,
        status_code: int = 502,
    ) -> None:
        super().__init__(code, status_code, params)
        self.retryable = retryable


# Codes the frontend knows how to localise. Keep this list and messages/*.json aligned.
ERROR_CODES: frozenset[str] = frozenset(
    {
        "AUTH_REQUIRED",
        "AUTH_INVALID",
        "FORBIDDEN",
        "NOT_FOUND",
        "VALIDATION_ERROR",
        "INTERNAL_ERROR",
        "MONGODB_UNAVAILABLE",
        "OBJECT_STORAGE_UNAVAILABLE",
        "OBJECT_STORAGE_FAILED",
        "QUEUE_UNAVAILABLE",
        "UPLOAD_TOO_LARGE",
        "FILE_TYPE_UNSUPPORTED",
        "FILE_TYPE_MISMATCH",
        "CORRUPT_MEDIA",
        "DURATION_LIMIT_EXCEEDED",
        "DUPLICATE_ASSET",
        "TEXT_ENCODING_UNSUPPORTED",
        "PROVIDER_NOT_CONFIGURED",
        "PROVIDER_RATE_LIMITED",
        "PROVIDER_FAILED",
        "EMBEDDING_DIMENSION_MISMATCH",
        "EMBEDDING_MODEL_MISMATCH",
        "DELETE_INCOMPLETE",
        "COLLECTION_NOT_EMPTY",
        "CONFIG_INVALID",
        "SEARCH_UNAVAILABLE",
        "INDEX_NOT_READY",
        "JOB_NOT_RETRYABLE",
        "UPLOAD_INCOMPLETE",
        "CSRF_REJECTED",
        "PASSWORD_POLICY",
    }
)


def error_body(code: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
    if code not in ERROR_CODES:
        code = "INTERNAL_ERROR"
        params = {}
    return {"error": {"code": code, "params": params or {}}}
