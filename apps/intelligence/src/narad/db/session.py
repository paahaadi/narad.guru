"""Async database service and PgBouncer-safe connection helpers."""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from time import perf_counter
from typing import Any
from uuid import UUID

import asyncpg

from narad.config import Settings

TenantId = str | UUID | None


async def _setup_connection(conn: asyncpg.Connection) -> None:
    """Prepare each pooled connection for PgBouncer transaction mode."""

    await conn.execute("SET TIME ZONE 'UTC'")
    await conn.set_type_codec(
        "json",
        schema="pg_catalog",
        encoder=json.dumps,
        decoder=json.loads,
        format="text",
    )
    await conn.set_type_codec(
        "jsonb",
        schema="pg_catalog",
        encoder=json.dumps,
        decoder=json.loads,
        format="text",
    )


async def create_pool(database_url: str, min_size: int = 5, max_size: int = 20) -> asyncpg.Pool:
    """Create a PgBouncer-safe asyncpg pool."""

    return await asyncpg.create_pool(
        database_url,
        min_size=min_size,
        max_size=max_size,
        statement_cache_size=0,
        setup=_setup_connection,
    )


async def close_pool(pool: asyncpg.Pool) -> None:
    """Close all database connections."""

    await pool.close()


async def set_tenant(conn: asyncpg.Connection, tenant_id: str | UUID) -> None:
    """Set transaction-local tenant context for RLS-protected tables."""

    await conn.execute("SELECT set_config('app.current_tenant_id', $1, TRUE)", str(tenant_id))


async def get_default_tenant_id(pool: asyncpg.Pool) -> UUID | None:
    """Resolve the first tenant for admin-mode fallback access."""

    async with pool.acquire() as conn:
        return await conn.fetchval("SELECT id FROM core.tenants ORDER BY created_at ASC LIMIT 1")


@asynccontextmanager
async def tenant_connection(pool: asyncpg.Pool, tenant_id: TenantId) -> AsyncIterator[asyncpg.Connection]:
    """Open a transaction-scoped connection with tenant context set when available."""

    async with pool.acquire() as conn, conn.transaction():
        if tenant_id is not None:
            await set_tenant(conn, tenant_id)
        yield conn


async def ping_database(pool: asyncpg.Pool) -> tuple[bool, float]:
    """Return database health and latency in milliseconds."""

    started = perf_counter()
    async with pool.acquire() as conn:
        await conn.fetchval("SELECT 1")
    return True, (perf_counter() - started) * 1000


class Database:
    """Thin asyncpg-backed service with tenant-aware query helpers."""

    def __init__(self, settings: Settings, pool: asyncpg.Pool | None = None) -> None:
        self._settings = settings
        self._pool = pool
        self._owns_pool = pool is None
        self._default_tenant_id = UUID(settings.default_tenant_id) if settings.default_tenant_id else None

    @property
    def pool(self) -> asyncpg.Pool:
        if self._pool is None:
            raise RuntimeError("Database pool is not connected")
        return self._pool

    async def connect(self) -> None:
        """Open the shared pool when this instance owns it."""

        if self._pool is not None:
            return

        self._pool = await create_pool(
            self._settings.database_url,
            min_size=self._settings.database_pool_min_size,
            max_size=self._settings.database_pool_size,
        )

    async def disconnect(self) -> None:
        """Close the owned pool and clear cached state."""

        if self._pool is None or not self._owns_pool:
            return

        await close_pool(self._pool)
        self._pool = None

    async def resolve_default_tenant_id(self) -> UUID:
        """Return configured tenant or fall back to the earliest seeded tenant."""

        if self._default_tenant_id is not None:
            return self._default_tenant_id

        tenant_id = await get_default_tenant_id(self.pool)
        if tenant_id is None:
            raise RuntimeError("No tenant is configured in core.tenants")

        self._default_tenant_id = tenant_id
        return tenant_id

    async def healthcheck(self) -> dict[str, object]:
        """Report database availability and round-trip latency."""

        try:
            _, latency_ms = await ping_database(self.pool)
        except Exception as exc:  # pragma: no cover - exercised with infra down
            return {"status": "unhealthy", "error": str(exc)}
        return {"status": "healthy", "latency_ms": round(latency_ms, 2)}

    async def fetch(self, query: str, *args: Any, tenant_id: TenantId = None) -> list[asyncpg.Record]:
        async with tenant_connection(self.pool, tenant_id) as conn:
            return await conn.fetch(query, *args)

    async def fetchrow(
        self,
        query: str,
        *args: Any,
        tenant_id: TenantId = None,
    ) -> asyncpg.Record | None:
        async with tenant_connection(self.pool, tenant_id) as conn:
            return await conn.fetchrow(query, *args)

    async def execute(self, query: str, *args: Any, tenant_id: TenantId = None) -> str:
        async with tenant_connection(self.pool, tenant_id) as conn:
            return await conn.execute(query, *args)
