from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from narad.config import Settings
from narad.db.session import Database
from narad.dependencies import database_dependency, redis_dependency, settings_dependency
from narad.workers.celery_app import collect_celery_health

router = APIRouter(tags=["health"])


@router.get("/health")
async def get_health(
    settings: Annotated[Settings, Depends(settings_dependency)],
    database: Annotated[Database, Depends(database_dependency)],
    redis_client: Annotated[Any, Depends(redis_dependency)],
) -> JSONResponse:
    database_check = await database.healthcheck()

    try:
        started = datetime.now(UTC)
        await redis_client.ping()
        redis_check = {
            "status": "healthy",
            "latency_ms": max(
                0.0,
                round((datetime.now(UTC) - started).total_seconds() * 1000, 2),
            ),
        }
    except Exception as exc:  # pragma: no cover - exercised with infra down
        redis_check = {"status": "unhealthy", "error": str(exc)}

    celery_check = await collect_celery_health(redis_client)

    checks = {
        "database": database_check,
        "redis": redis_check,
        "celery": celery_check,
    }
    overall_status = (
        "healthy"
        if all(check.get("status") == "healthy" for check in checks.values())
        else "unhealthy"
    )

    payload = {
        "status": overall_status,
        "version": settings.app_version,
        "checks": checks,
        "timestamp": datetime.now(UTC).isoformat(),
    }
    return JSONResponse(payload, status_code=200 if overall_status == "healthy" else 503)
