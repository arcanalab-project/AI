"""Always-on ingestion worker.

Run from the backend directory:

    python -m app.workers

The same command is the container command. Point it at Atlas and object storage.
A worker on a laptop means ingestion waits for that laptop. Run it on an
always-on host when uploads must proceed while no one is logged in.
"""

from __future__ import annotations

import logging
import signal
import sys
import threading

from app.config import get_settings
from app.db.client import configure_logging
from app.runtime import build_deps
from app.workers.loop import run_worker
from app.workers.queue import JobQueue

logger = logging.getLogger(__name__)


def main() -> None:
    configure_logging()
    settings = get_settings()
    deps = build_deps(settings)
    if deps.repo is None:
        logger.error("ingestion worker cannot start because MongoDB is not reachable")
        sys.exit(1)
    queue = JobQueue(deps.repo.db.ingestion_jobs, settings)
    stop = threading.Event()

    def _stop(signum, _frame) -> None:
        logger.info("ingestion worker stopping signal=%s", signum)
        stop.set()

    signal.signal(signal.SIGTERM, _stop)
    signal.signal(signal.SIGINT, _stop)
    run_worker(queue, deps, settings, stop=stop)


if __name__ == "__main__":
    main()
