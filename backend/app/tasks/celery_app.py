"""Celery application configuration."""

from celery import Celery

from app.core.config import settings

celery_app = Celery(
    "starpath",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=["app.tasks.calculate"],
)

celery_app.conf.update(
    task_track_started=True,
    result_expires=3600,
    task_soft_time_limit=settings.celery_soft_time_limit,
    task_routes={
        "app.tasks.calculate.*": {"queue": "calculations"},
    },
    worker_prefetch_multiplier=1,
)
