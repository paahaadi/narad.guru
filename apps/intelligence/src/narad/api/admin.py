from __future__ import annotations

from collections import Counter
from datetime import UTC, datetime
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from narad.adapters.registry import AdapterRegistry
from narad.config import Settings
from narad.db.models import PartitionRequest
from narad.db.session import Database
from narad.dependencies import (
    admin_auth_dependency,
    database_dependency,
    get_celery,
    redis_dependency,
    settings_dependency,
)
from narad.services.dead_letter import DeadLetterService
from narad.workers.celery_app import collect_pipeline_status
from narad.workers.ingest_tasks import force_trigger_source_ingest, trigger_source_ingest
from narad.workers.maintenance_tasks import ensure_audit_partition

router = APIRouter(tags=["admin"], dependencies=[Depends(admin_auth_dependency)])
dead_letter_service = DeadLetterService()


def _source_health(row: dict[str, Any], now: datetime) -> dict[str, Any]:
    is_active = bool(row.get("is_active"))
    last_success = row.get("last_successful_fetch")
    last_error = row.get("last_error")
    cadence_seconds = int(row.get("update_cadence_seconds") or 3600)
    cadence_seconds = max(cadence_seconds, 1)

    if not is_active:
        status = "inactive"
        reason = "source is disabled"
        age_seconds = None
    elif last_success is None and last_error:
        status = "unhealthy"
        reason = str(last_error)
        age_seconds = None
    elif last_success is None:
        status = "unknown"
        reason = "source has not completed a successful fetch yet"
        age_seconds = None
    else:
        age_seconds = max((now - last_success).total_seconds(), 0.0)
        if last_error and age_seconds > cadence_seconds:
            status = "degraded"
            reason = str(last_error)
        elif age_seconds <= cadence_seconds * 1.5:
            status = "healthy"
            reason = "latest fetch is within cadence"
        elif age_seconds <= cadence_seconds * 3:
            status = "degraded"
            reason = "last successful fetch is stale"
        else:
            status = "unhealthy"
            reason = "last successful fetch is beyond the expected cadence"

    breaker_state = {
        "healthy": "closed",
        "unknown": "closed",
        "degraded": "half_open",
        "unhealthy": "open",
        "inactive": "open",
    }[status]

    return {
        "status": status,
        "reason": reason,
        "age_seconds": age_seconds,
        "expected_cadence_seconds": cadence_seconds,
        "last_error": last_error,
        "circuit_breaker_state": breaker_state,
    }


async def _fetch_source_rows(settings: Settings, database: Database) -> list[dict[str, Any]]:
    registry = AdapterRegistry(settings)
    await registry.ensure_sources(database)
    tenant_id = await database.resolve_default_tenant_id()
    rows = await database.fetch(
        """
        SELECT
            s.id,
            s.name,
            s.slug,
            s.source_type,
            s.trust_tier,
            s.is_active,
            s.governance_approved,
            s.last_successful_fetch,
            s.last_error,
            s.updated_at,
            s.update_cadence_seconds,
            COALESCE(doc_counts.documents_ingested_24h, 0) AS documents_ingested_24h
        FROM core.sources AS s
        LEFT JOIN (
            SELECT source_id, COUNT(*)::int AS documents_ingested_24h
            FROM core.documents
            WHERE fetched_at >= now() - interval '24 hours'
            GROUP BY source_id
        ) AS doc_counts ON doc_counts.source_id = s.id
        WHERE s.tenant_id = $1
        ORDER BY s.trust_tier ASC, s.name ASC
        """,
        tenant_id,
        tenant_id=tenant_id,
    )
    return [dict(row) for row in rows]


async def _build_source_snapshot(settings: Settings, database: Database) -> dict[str, Any]:
    now = datetime.now(UTC)
    rows = await _fetch_source_rows(settings, database)
    items: list[dict[str, Any]] = []
    status_counts: Counter[str] = Counter()
    active_count = 0

    for row in rows:
        health = _source_health(row, now)
        row["health"] = health
        row["circuit_breaker_state"] = health["circuit_breaker_state"]
        items.append(row)
        status_counts[health["status"]] += 1
        if row.get("is_active"):
            active_count += 1

    return {
        "sources": items,
        "total": len(items),
        "active": active_count,
        "healthy": status_counts.get("healthy", 0),
        "degraded": status_counts.get("degraded", 0),
        "unhealthy": status_counts.get("unhealthy", 0),
        "inactive": status_counts.get("inactive", 0),
        "unknown": status_counts.get("unknown", 0),
        "status_counts": dict(status_counts),
    }


async def _build_pipeline_metrics(database: Database) -> dict[str, Any]:
    tenant_id = await database.resolve_default_tenant_id()
    row = await database.fetchrow(
        """
        SELECT
            (SELECT COUNT(*)::int FROM core.documents WHERE tenant_id = $1) AS documents_total,
            (
                SELECT COUNT(*)::int
                FROM core.documents
                WHERE tenant_id = $1 AND fetched_at >= now() - interval '1 hour'
            ) AS documents_last_1h,
            (
                SELECT COUNT(*)::int
                FROM core.documents
                WHERE tenant_id = $1 AND fetched_at >= now() - interval '24 hours'
            ) AS documents_last_24h,
            (SELECT COUNT(*)::int FROM core.events WHERE tenant_id = $1) AS events_total,
            (
                SELECT COUNT(*)::int
                FROM core.events
                WHERE tenant_id = $1 AND created_at >= now() - interval '1 hour'
            ) AS events_last_1h,
            (
                SELECT COUNT(*)::int
                FROM core.events
                WHERE tenant_id = $1 AND created_at >= now() - interval '24 hours'
            ) AS events_last_24h,
            (SELECT COUNT(*)::int FROM core.claims WHERE tenant_id = $1) AS claims_total,
            (
                SELECT COUNT(*)::int
                FROM core.claims
                WHERE tenant_id = $1 AND created_at >= now() - interval '1 hour'
            ) AS claims_last_1h,
            (
                SELECT COUNT(*)::int
                FROM core.claims
                WHERE tenant_id = $1 AND created_at >= now() - interval '24 hours'
            ) AS claims_last_24h,
            (SELECT COUNT(*)::int FROM core.entities WHERE tenant_id = $1) AS entities_total,
            (SELECT COUNT(*)::int FROM core.story_capsules WHERE tenant_id = $1) AS story_capsules_total,
            (
                SELECT COUNT(*)::int
                FROM core.dead_letter_queue
                WHERE tenant_id = $1
                  AND status != 'resolved'
                  AND created_at >= now() - interval '1 hour'
            ) AS dlq_last_1h,
            (
                SELECT COUNT(*)::int
                FROM core.dead_letter_queue
                WHERE tenant_id = $1
                  AND status != 'resolved'
                  AND created_at >= now() - interval '24 hours'
            ) AS dlq_last_24h
        """,
        tenant_id,
        tenant_id=tenant_id,
    )
    metrics = dict(row or {})
    last_1h_total = max(
        int(metrics.get("documents_last_1h", 0))
        + int(metrics.get("events_last_1h", 0))
        + int(metrics.get("claims_last_1h", 0)),
        int(metrics.get("dlq_last_1h", 0)),
    )
    last_24h_total = max(
        int(metrics.get("documents_last_24h", 0))
        + int(metrics.get("events_last_24h", 0))
        + int(metrics.get("claims_last_24h", 0)),
        int(metrics.get("dlq_last_24h", 0)),
    )
    failed_1h = int(metrics.get("dlq_last_1h", 0))
    failed_24h = int(metrics.get("dlq_last_24h", 0))

    return {
        "totals": {
            "documents": int(metrics.get("documents_total", 0)),
            "events": int(metrics.get("events_total", 0)),
            "claims": int(metrics.get("claims_total", 0)),
            "entities": int(metrics.get("entities_total", 0)),
            "story_capsules": int(metrics.get("story_capsules_total", 0)),
        },
        "throughput": {
            "documents_per_minute": round(int(metrics.get("documents_last_1h", 0)) / 60, 2),
            "events_per_minute": round(int(metrics.get("events_last_1h", 0)) / 60, 2),
            "claims_per_minute": round(int(metrics.get("claims_last_1h", 0)) / 60, 2),
        },
        "error_rates": {
            "last_1h": {
                "total_tasks": last_1h_total,
                "failed": failed_1h,
                "rate": round((failed_1h / last_1h_total) if last_1h_total else 0.0, 4),
            },
            "last_24h": {
                "total_tasks": last_24h_total,
                "failed": failed_24h,
                "rate": round((failed_24h / last_24h_total) if last_24h_total else 0.0, 4),
            },
        },
    }


@router.get("/sources")
async def list_sources(
    settings: Annotated[Settings, Depends(settings_dependency)],
    database: Annotated[Database, Depends(database_dependency)],
):
    return await _build_source_snapshot(settings, database)


@router.post("/sources/{source_id}/trigger", status_code=202)
async def trigger_source(
    source_id: UUID,
    database: Annotated[Database, Depends(database_dependency)],
    force: bool = False,
):
    tenant_id = await database.resolve_default_tenant_id()
    source = await database.fetchrow(
        "SELECT id, slug FROM core.sources WHERE tenant_id = $1 AND id = $2",
        tenant_id,
        source_id,
        tenant_id=tenant_id,
    )
    if source is None:
        raise HTTPException(status_code=404, detail="Source not found")

    task = force_trigger_source_ingest if force else trigger_source_ingest
    async_result = task.delay(str(source["id"]))
    return {
        "task_id": async_result.id,
        "source_id": str(source["id"]),
        "status": "queued",
        "force": force,
        "message": (
            f"Forced ingestion task queued for source '{source['slug']}'"
            if force
            else f"Ingestion task queued for source '{source['slug']}'"
        ),
    }


@router.get("/pipeline/stats")
@router.get("/pipeline/status")
async def pipeline_status(
    settings: Annotated[Settings, Depends(settings_dependency)],
    database: Annotated[Database, Depends(database_dependency)],
    redis_client: Annotated[Any, Depends(redis_dependency)],
):
    stats = await collect_pipeline_status(redis_client)
    source_snapshot = await _build_source_snapshot(settings, database)
    dlq_snapshot = await dead_letter_service.snapshot(database, redis_client, limit=25)
    pipeline_metrics = await _build_pipeline_metrics(database)

    stats["sources"] = {
        key: source_snapshot[key]
        for key in ("total", "active", "healthy", "degraded", "unhealthy", "inactive", "unknown", "status_counts")
    }
    stats["totals"] = pipeline_metrics["totals"]
    stats["throughput"] = pipeline_metrics["throughput"]
    stats["error_rates"] = pipeline_metrics["error_rates"]
    stats["dlq"] = {
        "total": dlq_snapshot["total"],
        "by_queue": dlq_snapshot["by_queue"],
        "by_task": dlq_snapshot["by_task"],
        "items": dlq_snapshot["items"],
    }
    stats["summary"] = {
        "sources": source_snapshot["status_counts"],
        "dlq_total": dlq_snapshot["total"],
        "queue_total": sum(queue_info["depth"] for queue_info in stats["queues"].values()),
        "pipeline_totals": pipeline_metrics["totals"],
    }
    return stats


@router.get("/dlq")
@router.get("/dlq/{task_name}")
@router.get("/pipeline/dlq")
@router.get("/pipeline/dlq/{task_name}")
async def list_dlq(
    database: Annotated[Database, Depends(database_dependency)],
    redis_client: Annotated[Any, Depends(redis_dependency)],
    task_name: str | None = None,
    limit: int = 100,
    offset: int = 0,
    include_resolved: bool = False,
):
    return await dead_letter_service.snapshot(
        database,
        redis_client,
        task_name=task_name,
        limit=limit,
        offset=offset,
        include_resolved=include_resolved,
    )


@router.post("/dlq/{task_id}/retry", status_code=202)
@router.post("/pipeline/dlq/{task_id}/retry", status_code=202)
async def retry_dlq(
    database: Annotated[Database, Depends(database_dependency)],
    redis_client: Annotated[Any, Depends(redis_dependency)],
    celery: Annotated[Any, Depends(get_celery)],
    task_id: str,
):
    try:
        return await dead_letter_service.retry(database, redis_client, celery, task_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/dlq/{task_id}/resolve")
@router.post("/pipeline/dlq/{task_id}/discard")
async def resolve_dlq(
    database: Annotated[Database, Depends(database_dependency)],
    redis_client: Annotated[Any, Depends(redis_dependency)],
    task_id: str,
):
    try:
        return await dead_letter_service.resolve(database, redis_client, task_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/maintenance/create-partition")
async def create_partition(
    database: Annotated[Database, Depends(database_dependency)],
    settings: Annotated[Settings, Depends(settings_dependency)],
    payload: PartitionRequest | None = None,
):
    now = datetime.now(UTC)
    default_year = now.year + 1 if now.month == 12 else now.year
    default_month = 1 if now.month == 12 else now.month + 1
    request = payload or PartitionRequest(year=default_year, month=default_month)
    return await ensure_audit_partition(database, settings, request.year, request.month)
