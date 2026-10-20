"""One ingestion worker process. More processes can run the same command.

Claim is atomic, so a second instance does not take a job this one still holds.
Heavy work (FFmpeg, transcription, embeddings) stays in this process.
"""

from __future__ import annotations

import logging
import os
import shutil
import socket
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from app.pipeline.runner import process_job
from app.workers.control import LeaseControl, OwnershipLost
from app.workers.queue import JobQueue

logger = logging.getLogger(__name__)


def disk_has_room(path: Path, min_free_mb: int) -> bool:
    path.mkdir(parents=True, exist_ok=True)
    usage = shutil.disk_usage(path)
    return usage.free >= int(min_free_mb) * 1024 * 1024


def run_worker(queue: JobQueue, deps, settings, *, stop: threading.Event | None = None, sleep=None) -> None:
    stop = stop or threading.Event()
    worker_id = settings.worker_id.strip() or f"{socket.gethostname()}-{os.getpid()}"
    capacity = max(1, int(settings.ingestion_concurrency))
    executor = ThreadPoolExecutor(max_workers=capacity, thread_name_prefix="dme-ingest")
    inflight: set = set()
    idle_steps = 0
    logger.info("ingestion worker started id=%s concurrency=%s", worker_id, capacity)
    try:
        while not stop.is_set():
            inflight = {item for item in inflight if not item.done()}
            claimed = None
            if len(inflight) < capacity and disk_has_room(deps.workdir, settings.max_temp_disk_mb):
                claimed = queue.claim(worker_id)
            elif len(inflight) < capacity:
                logger.warning("ingestion paused because free temp disk is below the configured limit")
            if claimed is not None:
                idle_steps = 0
                inflight.add(executor.submit(_run_claimed, claimed, queue, deps, settings))
                if len(inflight) < capacity:
                    continue
            else:
                idle_steps += 1
            delay = _delay(settings, idle_steps, found=claimed is not None)
            if stop.wait(delay):
                break
    finally:
        stop.set()
        executor.shutdown(wait=True, cancel_futures=False)
        logger.info("ingestion worker stopped id=%s", worker_id)


def _delay(settings, idle_steps: int, *, found: bool) -> float:
    if found:
        return float(settings.job_poll_interval_seconds)
    grown = float(settings.job_poll_interval_seconds) * (2 ** min(idle_steps, 4))
    return min(float(settings.job_idle_backoff_seconds), grown)


def _run_claimed(claim, queue: JobQueue, deps, settings) -> None:
    lost = threading.Event()

    def beat() -> None:
        interval = max(1, int(settings.job_heartbeat_seconds))
        while not lost.wait(interval):
            if not queue.heartbeat(claim):
                lost.set()
                return

    thread = threading.Thread(target=beat, name=f"dme-heartbeat-{claim.job_id}", daemon=True)
    thread.start()
    control = LeaseControl(queue, claim, lost)
    try:
        process_job(str(claim.job_id), deps, control=control)
    except OwnershipLost:
        logger.info("worker lost ownership and did not publish")
    finally:
        lost.set()
