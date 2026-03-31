from __future__ import annotations

from datetime import UTC, date

import asyncpg

from narad.config import Settings, get_settings
from narad.db.session import Database
from narad.workers.celery_app import celery, run_async


async def ensure_audit_partition(
    database: Database,
    settings: Settings,
    year: int,
    month: int,
) -> dict[str, object]:
    partition_name = f"audit_log_{year}_{month:02d}"
    range_start = date(year, month, 1)
    range_end = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)

    direct_dsn = getattr(settings, "database_direct_url", None) or settings.database_url
    conn = await asyncpg.connect(direct_dsn, statement_cache_size=0)
    try:
        exists = await conn.fetchval("SELECT to_regclass($1)", f"audit.{partition_name}")
        if exists:
            return {
                "partition_name": partition_name,
                "range_start": range_start.isoformat(),
                "range_end": range_end.isoformat(),
                "created": False,
                "message": f"Partition {partition_name} already exists",
            }

        await conn.execute(
            f"""
            CREATE TABLE audit.{partition_name}
            PARTITION OF audit.audit_log
            FOR VALUES FROM ('{range_start.isoformat()}') TO ('{range_end.isoformat()}')
            """
        )
        return {
            "partition_name": partition_name,
            "range_start": range_start.isoformat(),
            "range_end": range_end.isoformat(),
            "created": True,
            "message": f"Partition {partition_name} created successfully",
        }
    finally:
        await conn.close()


@celery.task(name="narad.maintenance.create_next_audit_partition")
def create_next_audit_partition() -> dict[str, object]:
    return run_async(_create_next_audit_partition())


async def _create_next_audit_partition() -> dict[str, object]:
    settings = get_settings()
    database = Database(settings)
    await database.connect()
    try:
        from datetime import datetime

        now = datetime.now(UTC)
        next_month = 1 if now.month == 12 else now.month + 1
        next_year = now.year + 1 if now.month == 12 else now.year
        return await ensure_audit_partition(database, settings, next_year, next_month)
    finally:
        await database.disconnect()


@celery.task(name="narad.maintenance.cleanup_stale_cache")
def cleanup_stale_cache() -> dict[str, str]:
    return {"status": "noop"}
