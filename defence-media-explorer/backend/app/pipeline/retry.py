"""Provider calls retry on rate limits and transient failures. Permanent errors do not retry."""

from __future__ import annotations

import time
from collections.abc import Callable
from typing import TypeVar

from app.errors import ProviderError

T = TypeVar("T")


def call_provider(fn: Callable[[], T], *, attempts: int = 3, sleep=time.sleep) -> T:
    delay = 0.5
    last: ProviderError | None = None
    for attempt in range(attempts):
        try:
            return fn()
        except ProviderError as exc:
            last = exc
            if not exc.retryable or attempt == attempts - 1:
                raise
            sleep(delay)
            delay *= 2
    assert last is not None
    raise last
