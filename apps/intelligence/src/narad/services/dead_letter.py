from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from celery import Celery
from redis.asyncio import Redis

from narad.db.session import Database

DLQ_KEY_PREFIX = "narad:dlq"
KNOWN_DLQ_QUEUES = ("ingest", "enrichment", "entity", "event", "projection", "maintenance")


def _json_safe(value: Any) -> Any:
    return json.loads(json.dumps(value, default=str))


def _parse_datetime(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


def _stable_entry_id(*parts: Any) -> str:
    payload = json.dumps(parts, default=str, sort_keys=True).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


@dataclass(slots=True)
class DeadLetterEntry:
    id: str
    queue_name: str
    task_name: str | None
    payload: dict[str, Any]
    error_message: str | None
    retry_count: int
    created_at: datetime
    resolved_at: datetime | None = None
    transport: str = "redis"

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "queue_name": self.queue_name,
            "task_name": self.task_name,
            "payload": self.payload,
            "error_message": self.error_message,
            "retry_count": self.retry_count,
            "created_at": self.created_at.isoformat(),
            "resolved_at": None if self.resolved_at is None else self.resolved_at.isoformat(),
            "transport": self.transport,
        }


class DeadLetterService:
    async def _table_exists(self, database: Database) -> bool:
        try:
            row = await database.fetchrow("SELECT to_regclass('core.dead_letter_queue') IS NOT NULL AS exists")
        except Exception:
            return False
        return bool(row and row["exists"])

    def _normalize_payload(self, value: Any) -> dict[str, Any]:
        if isinstance(value, str):
            try:
                value = json.loads(value)
            except json.JSONDecodeError:
                value = {"raw": value}
        if not isinstance(value, dict):
            value = {"value": _json_safe(value)}
        return value

    def _normalize_entry(self, row: dict[str, Any], transport: str) -> DeadLetterEntry:
        payload = self._normalize_payload(row.get("payload", {}))
        entry_id = str(
            row.get("id")
            or row.get("entry_id")
            or payload.get("id")
            or _stable_entry_id(row.get("queue_name"), row.get("task_name"), payload, row.get("error_message"))
        )
        queue_name = str(row.get("queue_name") or payload.get("queue_name") or "unknown")
        task_name = row.get("task_name") or payload.get("task_name")
        error_message = row.get("error_message") or payload.get("error_message") or payload.get("error")
        retry_count = int(row.get("retry_count") or payload.get("retry_count") or 0)
        created_at = _parse_datetime(row.get("created_at") or payload.get("created_at")) or datetime.now(UTC)
        resolved_at = _parse_datetime(row.get("resolved_at") or payload.get("resolved_at"))
        return DeadLetterEntry(
            id=entry_id,
            queue_name=queue_name,
            task_name=None if task_name is None else str(task_name),
            payload=payload,
            error_message=None if error_message is None else str(error_message),
            retry_count=retry_count,
            created_at=created_at,
            resolved_at=resolved_at,
            transport=transport,
        )

    def _current_entry_id(self, payload: dict[str, Any]) -> str:
        return str(payload.get("id") or _stable_entry_id(payload.get("queue_name"), payload.get("task_name"), payload))

    def _matches_task_name(self, entry: DeadLetterEntry, task_name: str) -> bool:
        return entry.task_name == task_name or entry.payload.get("task_name") == task_name

    def _is_unresolved(self, entry: DeadLetterEntry) -> bool:
        return entry.resolved_at is None and entry.payload.get("resolved_at") is None

    async def _fetch_database_entries(self, database: Database) -> list[DeadLetterEntry]:
        if not await self._table_exists(database):
            return []

        tenant_id = await database.resolve_default_tenant_id()
        try:
            rows = await database.fetch(
                """
                SELECT *
                FROM core.dead_letter_queue
                ORDER BY created_at DESC
                LIMIT 200
                """,
                tenant_id=tenant_id,
            )
        except Exception:
            return []

        return [self._normalize_entry(dict(row), "database") for row in rows]

    async def _fetch_redis_entries(self, redis_client: Redis) -> list[DeadLetterEntry]:
        entries: list[DeadLetterEntry] = []
        async for key in redis_client.scan_iter(match=f"{DLQ_KEY_PREFIX}:*"):
            if isinstance(key, bytes):
                queue_name = key.decode("utf-8").rsplit(":", 1)[-1]
            else:
                queue_name = str(key).rsplit(":", 1)[-1]
            values = await redis_client.lrange(key, 0, -1)
            for raw_value in values:
                text = raw_value.decode("utf-8") if isinstance(raw_value, bytes) else str(raw_value)
                entries.append(
                    self._normalize_entry(
                        {
                            "queue_name": queue_name,
                            "payload": text,
                        },
                        "redis",
                    )
                )
        return entries

    def _filter_entries(
        self,
        entries: list[DeadLetterEntry],
        *,
        task_name: str | None = None,
        unresolved_only: bool = True,
    ) -> list[DeadLetterEntry]:
        filtered = entries
        if task_name is not None:
            filtered = [entry for entry in filtered if self._matches_task_name(entry, task_name)]
        if unresolved_only:
            filtered = [entry for entry in filtered if self._is_unresolved(entry)]
        filtered.sort(key=lambda entry: entry.created_at, reverse=True)
        return filtered

    async def snapshot(
        self,
        database: Database,
        redis_client: Redis,
        *,
        task_name: str | None = None,
        limit: int = 100,
        offset: int = 0,
        include_resolved: bool = False,
    ) -> dict[str, Any]:
        entries_by_id: dict[str, DeadLetterEntry] = {}
        for entry in await self._fetch_database_entries(database):
            entries_by_id[entry.id] = entry
        for entry in await self._fetch_redis_entries(redis_client):
            entries_by_id.setdefault(entry.id, entry)

        entries = self._filter_entries(
            list(entries_by_id.values()),
            task_name=task_name,
            unresolved_only=not include_resolved,
        )
        start = max(offset, 0)
        stop = start + max(limit, 0)
        window = entries[start:stop]

        by_queue: dict[str, int] = dict.fromkeys(KNOWN_DLQ_QUEUES, 0)
        by_task: dict[str, int] = {}
        for entry in entries:
            by_queue[entry.queue_name] = by_queue.get(entry.queue_name, 0) + 1
            if entry.task_name:
                by_task[entry.task_name] = by_task.get(entry.task_name, 0) + 1

        return {
            "total": len(entries),
            "task_name": task_name,
            "include_resolved": include_resolved,
            "by_queue": by_queue,
            "by_task": by_task,
            "items": [entry.as_dict() for entry in window],
        }

    async def _find_entry(
        self,
        database: Database,
        redis_client: Redis,
        entry_id: str,
    ) -> DeadLetterEntry | None:
        for entry in await self._fetch_database_entries(database):
            if entry.id == entry_id:
                return entry
        for entry in await self._fetch_redis_entries(redis_client):
            if entry.id == entry_id:
                return entry
        return None

    async def _update_database_entry(
        self,
        database: Database,
        entry_id: str,
        *,
        retry_count: int | None = None,
        resolved_at: datetime | None = None,
    ) -> None:
        if not await self._table_exists(database):
            return

        tenant_id = await database.resolve_default_tenant_id()
        if resolved_at is not None:
            await database.execute(
                """
                UPDATE core.dead_letter_queue
                SET resolved_at = $2,
                    status = 'resolved'
                WHERE id = $1
                """,
                entry_id,
                resolved_at,
                tenant_id=tenant_id,
            )
            return

        if retry_count is not None:
            await database.execute(
                """
                UPDATE core.dead_letter_queue
                SET retry_count = $2,
                    last_retried_at = now(),
                    status = 'retried'
                WHERE id = $1
                """,
                entry_id,
                retry_count,
                tenant_id=tenant_id,
            )

    async def _replace_redis_entry(
        self,
        redis_client: Redis,
        entry: DeadLetterEntry,
    ) -> None:
        key = f"{DLQ_KEY_PREFIX}:{entry.queue_name}"
        serialized = json.dumps(entry.as_dict())
        values = await redis_client.lrange(key, 0, -1)
        for index, raw_value in enumerate(values):
            text = raw_value.decode("utf-8") if isinstance(raw_value, bytes) else str(raw_value)
            try:
                payload = json.loads(text)
            except json.JSONDecodeError:
                continue
            current_id = self._current_entry_id(payload)
            if current_id == entry.id:
                await redis_client.lset(key, index, serialized)
                return
        await redis_client.lpush(key, serialized)

    async def _remove_redis_entry(
        self,
        redis_client: Redis,
        entry: DeadLetterEntry,
    ) -> None:
        key = f"{DLQ_KEY_PREFIX}:{entry.queue_name}"
        values = await redis_client.lrange(key, 0, -1)
        for raw_value in values:
            text = raw_value.decode("utf-8") if isinstance(raw_value, bytes) else str(raw_value)
            try:
                payload = json.loads(text)
            except json.JSONDecodeError:
                continue
            current_id = self._current_entry_id(payload)
            if current_id == entry.id:
                await redis_client.lrem(key, 1, text)
                return

    async def retry(
        self,
        database: Database,
        redis_client: Redis,
        celery_app: Celery,
        entry_id: str,
    ) -> dict[str, Any]:
        entry = await self._find_entry(database, redis_client, entry_id)
        if entry is None:
            raise KeyError(f"Dead-letter entry '{entry_id}' was not found")
        if entry.resolved_at is not None:
            raise ValueError(f"Dead-letter entry '{entry_id}' has already been resolved")
        if not entry.task_name:
            raise ValueError(f"Dead-letter entry '{entry_id}' does not include a task name")

        payload = dict(entry.payload)
        args = payload.get("args", [])
        kwargs = payload.get("kwargs", {})
        if not isinstance(args, list):
            args = [args]
        if not isinstance(kwargs, dict):
            kwargs = {}

        task_result = celery_app.send_task(entry.task_name, args=args, kwargs=kwargs, queue=entry.queue_name)
        now = datetime.now(UTC)
        updated_entry = DeadLetterEntry(
            id=entry.id,
            queue_name=entry.queue_name,
            task_name=entry.task_name,
            payload={**entry.payload, "retry_count": entry.retry_count + 1, "last_retry_at": now.isoformat()},
            error_message=entry.error_message,
            retry_count=entry.retry_count + 1,
            created_at=entry.created_at,
            resolved_at=entry.resolved_at,
            transport=entry.transport,
        )

        if entry.transport == "database":
            await self._update_database_entry(database, entry.id, retry_count=updated_entry.retry_count)
        else:
            await self._replace_redis_entry(redis_client, updated_entry)

        return {
            "task_id": task_result.id,
            "entry": updated_entry.as_dict(),
            "status": "queued",
        }

    async def resolve(
        self,
        database: Database,
        redis_client: Redis,
        entry_id: str,
    ) -> dict[str, Any]:
        entry = await self._find_entry(database, redis_client, entry_id)
        if entry is None:
            raise KeyError(f"Dead-letter entry '{entry_id}' was not found")

        resolved_at = datetime.now(UTC)
        if entry.transport == "database":
            await self._update_database_entry(database, entry.id, resolved_at=resolved_at)
        else:
            await self._remove_redis_entry(redis_client, entry)

        return {
            "entry": {**entry.as_dict(), "resolved_at": resolved_at.isoformat()},
            "status": "resolved",
        }

    async def publish_failure(
        self,
        database: Database,
        redis_client: Redis,
        *,
        queue_name: str,
        task_name: str | None,
        payload: dict[str, Any],
        error_message: str,
        retry_count: int = 0,
    ) -> dict[str, Any]:
        now = datetime.now(UTC)
        normalized_payload = self._normalize_payload(payload)
        payload_id = str(normalized_payload.get("id") or uuid4())
        entry = DeadLetterEntry(
            id=payload_id,
            queue_name=queue_name,
            task_name=task_name,
            payload={
                **normalized_payload,
                "id": payload_id,
                "queue_name": queue_name,
                "task_name": task_name,
                "error_message": error_message,
                "retry_count": retry_count,
                "created_at": now.isoformat(),
            },
            error_message=error_message,
            retry_count=retry_count,
            created_at=now,
            transport="redis",
        )

        stored_in_database = False
        if await self._table_exists(database):
            tenant_id = await database.resolve_default_tenant_id()
            try:
                await database.execute(
                    """
                    INSERT INTO core.dead_letter_queue (
                        tenant_id,
                        queue_name,
                        task_name,
                        payload,
                        error_message,
                        retry_count,
                        source_slug,
                        document_id,
                        event_id,
                        created_at
                    )
                    VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10)
                    """,
                    tenant_id,
                    entry.queue_name,
                    entry.task_name,
                    json.dumps(entry.payload),
                    entry.error_message,
                    entry.retry_count,
                    normalized_payload.get("source_slug"),
                    normalized_payload.get("document_id"),
                    normalized_payload.get("event_id"),
                    entry.created_at,
                    tenant_id=tenant_id,
                )
                entry.transport = "database"
                stored_in_database = True
            except Exception:
                entry.transport = "redis"

        if not stored_in_database:
            await redis_client.lpush(f"{DLQ_KEY_PREFIX}:{queue_name}", json.dumps(entry.as_dict()))

        return entry.as_dict()
