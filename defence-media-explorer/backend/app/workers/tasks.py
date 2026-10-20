"""Celery entrypoint. Step retries live inside the pipeline; this task does not invent results."""

from app.pipeline.runner import process_job
from app.runtime import build_deps
from app.workers.celery_app import celery_app


@celery_app.task(name="process_asset")
def process_asset_task(job_id: str) -> None:
    process_job(job_id, build_deps())
