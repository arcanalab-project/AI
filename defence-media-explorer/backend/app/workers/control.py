"""Ownership gate between the pipeline and the job queue."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.workers.queue import Claim, JobQueue, is_retryable


class OwnershipLost(Exception):
    """This worker's lease ended. Do not publish."""


class DirectControl:
    """Used by tests and any in-process call that is not a leased worker.

    Failures are terminal here. The leased worker classifies retries.
    """

    uses_queue = False
    token: str | None = None

    def __init__(self, repo) -> None:
        self.repo = repo

    def mark(self, job: dict, status: str, progress: int, steps: list) -> bool:
        job["status"] = status
        job["stage"] = status
        job["progress"] = progress
        job["steps"] = steps
        job["error"] = None
        self.repo.update_job(
            job["_id"],
            {"status": status, "stage": status, "progress": progress, "steps": steps, "error": None},
        )
        return True

    def remember(self, job: dict, stage: str, progress: int, payload: dict) -> bool:
        checkpoints = dict(job.get("checkpoints") or {})
        checkpoints[stage] = {"done": True, **payload, "at": datetime.now(timezone.utc)}
        job["checkpoints"] = checkpoints
        job["stage"] = stage
        job["progress"] = progress
        self.repo.update_job(job["_id"], {"checkpoints": checkpoints, "stage": stage, "progress": progress})
        return True

    def allow_publish(self, job: dict) -> bool:
        return True

    def finish(self, job: dict, patch: dict) -> bool:
        stored = dict(patch)
        stored["queueState"] = "done"
        stored["progress"] = int(patch.get("progress", 100))
        job.update(stored)
        self.repo.update_job(job["_id"], stored)
        return True

    def fail(self, job: dict, code: str, params: dict, retryable: bool) -> str:
        moment = datetime.now(timezone.utc)
        steps = list(job.get("steps") or [])
        if steps and steps[-1].get("status") == "running":
            steps[-1]["status"] = "failed"
            steps[-1]["finishedAt"] = moment
        error = {"code": code, "params": params, "retryable": False}
        job["steps"] = steps
        job["status"] = "failed"
        job["error"] = error
        job["queueState"] = "failed"
        self.repo.update_job(
            job["_id"],
            {"status": "failed", "steps": steps, "error": error, "queueState": "failed"},
        )
        return "terminal"

    def deactivate(self, job: dict) -> None:
        patch = {
            "activated": False,
            "queueState": "inactive",
            "status": "uploaded",
            "nextRunAt": None,
            "workerId": None,
            "ownershipToken": None,
            "leaseUntil": None,
        }
        job.update(patch)
        self.repo.update_job(job["_id"], patch)


class LeaseControl:
    """Pipeline control that refuses to write once the lease is no longer ours."""

    uses_queue = True

    def __init__(self, queue: JobQueue, claim: Claim, lost_event=None) -> None:
        self.queue = queue
        self.claim = claim
        self.lost_event = lost_event
        self.token: str | None = None

    def _alive(self) -> bool:
        if self.lost_event is not None and self.lost_event.is_set():
            return False
        return self.queue.still_owner(self.claim)

    def mark(self, job: dict, status: str, progress: int, steps: list) -> bool:
        if not self.queue.touch(self.claim, status, progress, steps):
            return False
        job["status"] = status
        job["stage"] = status
        job["progress"] = progress
        job["steps"] = steps
        job["error"] = None
        return True

    def remember(self, job: dict, stage: str, progress: int, payload: dict) -> bool:
        if not self.queue.checkpoint(self.claim, stage, progress, payload):
            return False
        checkpoints = dict(job.get("checkpoints") or {})
        checkpoints[stage] = {"done": True, **payload}
        job["checkpoints"] = checkpoints
        job["stage"] = stage
        job["progress"] = progress
        job["status"] = stage
        return True

    def allow_publish(self, job: dict) -> bool:
        if not self._alive():
            return False
        self.token = self.claim.ownership_token
        return True

    def finish(self, job: dict, patch: dict) -> bool:
        if not self.queue.complete(self.claim, patch):
            return False
        job.update(patch)
        job["queueState"] = "done"
        job["progress"] = int(patch.get("progress", 100))
        return True

    def fail(self, job: dict, code: str, params: dict, retryable: bool) -> str:
        if not self._alive():
            return "lost"
        outcome = self.queue.fail(self.claim, code, params, is_retryable(code, hinted=retryable))
        if outcome == "retry":
            job["status"] = "retrying"
            job["error"] = {"code": code, "params": params, "retryable": True}
            job["queueState"] = "retry_wait"
        elif outcome == "terminal":
            job["status"] = "failed"
            job["error"] = {"code": code, "params": params, "retryable": False}
            job["queueState"] = "failed"
        return outcome

    def deactivate(self, job: dict) -> None:
        if self.queue.deactivate(self.claim):
            job["activated"] = False
            job["queueState"] = "inactive"


def failure_is_retryable(code: str, exc: Any) -> bool:
    hinted = getattr(exc, "retryable", None)
    if hinted is not None and not isinstance(hinted, bool):
        hinted = None
    return is_retryable(code, hinted=hinted)
