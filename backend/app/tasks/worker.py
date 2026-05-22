"""Celery worker availability helpers."""

from app.tasks.celery_app import celery_app


def celery_workers_available(timeout: float = 1.5) -> bool:
    try:
        ping = celery_app.control.inspect(timeout=timeout).ping() or {}
        return len(ping) > 0
    except Exception:
        return False
