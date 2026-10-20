from celery import Celery

from app.config import get_settings

settings = get_settings()
celery_app = Celery("defence_media", broker=settings.redis_url, backend=settings.redis_url)
celery_app.conf.update(
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_track_started=True,
    broker_connection_retry_on_startup=True,
    task_default_queue="ingestion",
)
celery_app.autodiscover_tasks(["app.workers"])
