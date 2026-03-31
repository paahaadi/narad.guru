from __future__ import annotations

import asyncio
from collections import Counter

from celery import Celery
from kombu import Queue

from narad.config import get_settings

settings = get_settings()
TASK_MODULES = (
    "narad.workers.ingest_tasks",
    "narad.workers.enrichment_tasks",
    "narad.workers.projection_tasks",
    "narad.workers.maintenance_tasks",
)

celery = Celery(
    "narad-intelligence",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=list(TASK_MODULES),
)

celery.conf.update(
    task_default_queue="default",
    task_queues=[Queue(name) for name in settings.broker_queue_names],
    task_routes={
        "narad.ingest.*": {"queue": "ingest"},
        "narad.enrichment.*": {"queue": "enrichment"},
        "narad.projection.*": {"queue": "projection"},
        "narad.maintenance.*": {"queue": "maintenance"},
    },
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    worker_prefetch_multiplier=settings.celery_worker_prefetch_multiplier,
    task_soft_time_limit=settings.celery_task_soft_time_limit,
    task_time_limit=settings.celery_task_time_limit,
    beat_schedule={
        "poll-active-sources": {
            "task": "narad.ingest.poll_active_sources",
            "schedule": settings.ingest_poll_interval_ms / 1000,
        },
        "flush-embedding-batch": {
            "task": "narad.enrichment.flush_embedding_batch",
            "schedule": max(settings.embed_batch_window_ms / 1000, 30),
        },
        "precreate-audit-partition": {
            "task": "narad.maintenance.create_next_audit_partition",
            "schedule": 24 * 60 * 60,
        },
        "rebuild-sector-forecasts": {
            "task": "narad.projection.rebuild_sector_forecasts",
            "schedule": 24 * 60 * 60,
        },
    },
)


def run_async(awaitable):
    return asyncio.run(awaitable)


def _inspect():
    return celery.control.inspect(timeout=1.0)


async def collect_celery_health(redis_client) -> dict[str, object]:
    try:
        inspector = _inspect()
        workers = inspector.ping() or {}
        queued_tasks = {
            queue_name: int(await redis_client.llen(queue_name))
            for queue_name in ("ingest", "enrichment", "projection", "maintenance")
        }
        return {
            "status": "healthy",
            "active_workers": len(workers),
            "queued_tasks": queued_tasks,
        }
    except Exception as exc:  # pragma: no cover - exercised when Celery is down
        return {
            "status": "unhealthy",
            "active_workers": 0,
            "error": str(exc),
        }


async def collect_pipeline_status(redis_client) -> dict[str, object]:
    inspector = _inspect()
    active = inspector.active() or {}
    reserved = inspector.reserved() or {}
    workers = list((inspector.ping() or {}).keys())

    queue_depths = {
        queue_name: int(await redis_client.llen(queue_name))
        for queue_name in ("ingest", "enrichment", "projection", "maintenance")
    }
    active_counter: Counter[str] = Counter()
    reserved_counter: Counter[str] = Counter()

    for tasks in active.values():
        for task in tasks:
            delivery_info = task.get("delivery_info", {})
            active_counter[delivery_info.get("routing_key", "default")] += 1

    for tasks in reserved.values():
        for task in tasks:
            delivery_info = task.get("delivery_info", {})
            reserved_counter[delivery_info.get("routing_key", "default")] += 1

    return {
        "queues": {
            queue_name: {
                "depth": queue_depths.get(queue_name, 0),
                "active": active_counter.get(queue_name, 0),
                "reserved": reserved_counter.get(queue_name, 0),
            }
            for queue_name in ("ingest", "enrichment", "projection", "maintenance")
        },
        "workers": {
            "total": len(workers),
            "active": sum(1 for queue_count in active.values() if queue_count),
            "idle": max(len(workers) - sum(1 for queue_count in active.values() if queue_count), 0),
        },
        "error_rates": {
            "last_1h": {"total_tasks": 0, "failed": 0, "rate": 0.0},
            "last_24h": {"total_tasks": 0, "failed": 0, "rate": 0.0},
        },
        "dlq": {
            "total": 0,
            "by_task": {},
        },
        "throughput": {
            "documents_per_minute": 0.0,
            "events_per_minute": 0.0,
            "claims_per_minute": 0.0,
        },
    }
