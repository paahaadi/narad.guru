"""FastAPI dependency providers for the intelligence plane."""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Annotated, Any

import asyncpg
from celery import Celery
from fastapi import Depends, Header, HTTPException, Request, status
from redis.asyncio import Redis

from narad.config import Settings
from narad.db.session import Database, tenant_connection


def settings_dependency(request: Request) -> Settings:
    return request.app.state.settings  # type: ignore[no-any-return]


def get_settings(request: Request) -> Settings:
    return settings_dependency(request)


def get_db_pool(request: Request) -> asyncpg.Pool:
    return request.app.state.db_pool  # type: ignore[no-any-return]


def database_dependency(request: Request) -> Database:
    return request.app.state.database  # type: ignore[no-any-return]


def get_redis(request: Request) -> Redis:
    return request.app.state.redis  # type: ignore[no-any-return]


def redis_dependency(request: Request) -> Redis:
    return get_redis(request)


def get_celery(request: Request) -> Celery:
    return request.app.state.celery  # type: ignore[no-any-return]


async def admin_auth_dependency() -> None:
    """Phase 2B leaves admin routes open but keeps a single auth hook for Phase 2C."""

    return None


async def get_tenant_id(
    request: Request,
    x_tenant_id: Annotated[str | None, Header()] = None,
) -> str | None:
    """Resolve tenant from request header or app fallback."""

    if x_tenant_id:
        return x_tenant_id
    default_tenant_id = getattr(request.app.state, "default_tenant_id", None)
    return None if default_tenant_id is None else str(default_tenant_id)


async def require_tenant_id(
    tenant_id: Annotated[str | None, Depends(get_tenant_id)],
) -> str:
    if tenant_id is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No tenant is configured yet. Seed a tenant or pass X-Tenant-Id.",
        )
    return tenant_id


async def get_connection(
    pool: Annotated[asyncpg.Pool, Depends(get_db_pool)],
    tenant_id: Annotated[str, Depends(require_tenant_id)],
) -> AsyncIterator[asyncpg.Connection]:
    async with tenant_connection(pool, tenant_id) as conn:
        yield conn


async def get_runtime_context(
    settings: Annotated[Settings, Depends(settings_dependency)],
    database: Annotated[Database, Depends(database_dependency)],
    redis: Annotated[Redis, Depends(redis_dependency)],
    celery: Annotated[Celery, Depends(get_celery)],
) -> dict[str, Any]:
    return {
        "settings": settings,
        "database": database,
        "pool": database.pool,
        "redis": redis,
        "celery": celery,
    }
