"""One worker heartbeat document. The Processing page reads it."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


def stale_after_seconds(settings) -> int:
    return max(30, int(settings.job_heartbeat_seconds) * 3)


def worker_view(document: dict | None, settings, moment: datetime | None = None) -> dict[str, Any]:
    """Alive means a heartbeat arrived inside the stale window. The worker id is not returned."""

    moment = moment or datetime.now(timezone.utc)
    limit = stale_after_seconds(settings)
    beat = None if not document else document.get("heartbeatAt")
    if isinstance(beat, datetime):
        if beat.tzinfo is None:
            beat = beat.replace(tzinfo=timezone.utc)
        alive = (moment - beat).total_seconds() <= limit
    else:
        alive = False
    return {"alive": alive, "staleAfterSeconds": limit}
