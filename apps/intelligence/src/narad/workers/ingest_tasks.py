from __future__ import annotations

import traceback
from uuid import UUID

import redis.asyncio as redis

from narad.adapters.registry import AdapterRegistry
from narad.config import get_settings
from narad.db.models import SourceRecord
from narad.db.session import Database
from narad.services.dead_letter import DeadLetterService
from narad.services.ingestion import DocumentIngestionService
from narad.services.translation import TranslationService
from narad.workers.celery_app import celery, run_async

dead_letter_service = DeadLetterService()


async def _source_record_by_id(database: Database, source_id: UUID) -> SourceRecord | None:
    tenant_id = await database.resolve_default_tenant_id()
    row = await database.fetchrow(
        """
        SELECT
            id,
            tenant_id,
            name,
            slug,
            source_type,
            trust_tier,
            authority_level,
            is_active,
            governance_approved,
            base_url,
            update_cadence_seconds,
            last_polled_at,
            last_success_at,
            last_successful_fetch,
            last_error,
            consecutive_failures,
            status,
            documents_fetched_total,
            events_produced_total,
            config
        FROM core.sources
        WHERE tenant_id = $1 AND id = $2
        """,
        tenant_id,
        source_id,
        tenant_id=tenant_id,
    )
    if row is None:
        return None
    return SourceRecord.model_validate(
        {
            **dict(row),
            "documents_ingested_24h": 0,
            "circuit_breaker_state": "open" if row["status"] == "degraded" else "closed",
        }
    )


def _failure_status(source: SourceRecord, failure_count: int) -> str:
    if not source.is_active:
        return "disabled"
    if failure_count >= get_settings().source_circuit_breaker_threshold:
        return "degraded"
    return "active"


async def _mark_poll_start(database: Database, source: SourceRecord) -> None:
    await database.execute(
        """
        UPDATE core.sources
        SET last_polled_at = now()
        WHERE tenant_id = $1 AND id = $2
        """,
        source.tenant_id,
        source.id,
        tenant_id=source.tenant_id,
    )


async def _mark_poll_success(
    database: Database,
    source: SourceRecord,
    *,
    fetched_count: int,
) -> None:
    await database.execute(
        """
        UPDATE core.sources
        SET
            last_success_at = now(),
            last_successful_fetch = now(),
            last_error = NULL,
            consecutive_failures = 0,
            status = CASE WHEN is_active THEN 'active' ELSE 'disabled' END,
            documents_fetched_total = documents_fetched_total + $3
        WHERE tenant_id = $1 AND id = $2
        """,
        source.tenant_id,
        source.id,
        fetched_count,
        tenant_id=source.tenant_id,
    )


async def _mark_poll_failure(
    database: Database,
    source: SourceRecord,
    *,
    error_message: str,
) -> int:
    next_failure_count = source.consecutive_failures + 1
    await database.execute(
        """
        UPDATE core.sources
        SET
            last_error = $3,
            consecutive_failures = $4,
            status = $5
        WHERE tenant_id = $1 AND id = $2
        """,
        source.tenant_id,
        source.id,
        error_message,
        next_failure_count,
        _failure_status(source, next_failure_count),
        tenant_id=source.tenant_id,
    )
    return next_failure_count


async def _run_source_ingest(source_id: UUID, *, force: bool = False) -> dict[str, object]:
    settings = get_settings()
    database = Database(settings)
    redis_client = redis.from_url(settings.redis_url, decode_responses=False)
    registry = AdapterRegistry(settings)
    translation_service = TranslationService()
    document_ingestion_service = DocumentIngestionService()

    await database.connect()
    await registry.ensure_sources(database)

    try:
        source = await _source_record_by_id(database, source_id)
        if source is None:
            raise RuntimeError(f"Source {source_id} not found")
        if source.status == "disabled":
            return {
                "source_id": str(source.id),
                "source_slug": source.slug,
                "status": "skipped",
                "reason": "source is disabled",
            }

        adapter = registry.get(source.slug)
        if not force and not adapter.allow_request(
            consecutive_failures=source.consecutive_failures,
            last_failure_at=source.last_polled_at if source.last_error else None,
            threshold=settings.source_circuit_breaker_threshold,
            timeout_seconds=settings.source_circuit_breaker_timeout,
            max_backoff_seconds=settings.source_max_backoff_seconds,
        ):
            return {
                "source_id": str(source.id),
                "source_slug": source.slug,
                "status": "skipped",
                "reason": "circuit breaker is open",
            }

        await _mark_poll_start(database, source)
        documents = await adapter.fetch_documents(
            settings.ingest_batch_size,
            since=source.last_success_at or source.last_successful_fetch,
        )

        queued_documents: list[dict[str, object]] = []
        for raw_document in documents:
            stored = await document_ingestion_service.store_raw_document(
                database,
                source=source,
                raw_document=raw_document,
                translation_service=translation_service,
            )
            if not stored.is_new:
                continue
            task_name = (
                "narad.enrichment.translate_document"
                if stored.needs_translation
                else "narad.enrichment.enrich_document"
            )
            celery.send_task(task_name, args=[str(stored.document_id)], queue="enrichment")
            queued_documents.append(
                {
                    "document_id": str(stored.document_id),
                    "title": stored.title,
                    "doc_type": stored.doc_type,
                    "translation_pending": stored.needs_translation,
                }
            )

        await _mark_poll_success(database, source, fetched_count=len(queued_documents))
        return {
            "source_id": str(source.id),
            "source_slug": source.slug,
            "documents_processed": len(queued_documents),
            "results": queued_documents,
        }
    except Exception as exc:
        source = await _source_record_by_id(database, source_id)
        error_message = f"{exc}\n{traceback.format_exc(limit=5)}"
        if source is not None:
            retry_count = await _mark_poll_failure(
                database,
                source,
                error_message=error_message,
            )
            await dead_letter_service.publish_failure(
                database,
                redis_client,
                queue_name="ingest",
                task_name="narad.ingest.trigger_source_ingest",
                payload={
                    "args": [str(source_id)],
                    "kwargs": {},
                    "source_id": str(source_id),
                    "source_slug": source.slug,
                },
                error_message=error_message,
                retry_count=retry_count,
            )
        raise
    finally:
        await redis_client.aclose()
        await database.disconnect()


@celery.task(
    name="narad.ingest.trigger_source_ingest",
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_kwargs={"max_retries": 3},
)
def trigger_source_ingest(self, source_id: str) -> dict[str, object]:
    return run_async(_run_source_ingest(UUID(source_id)))


@celery.task(
    name="narad.ingest.force_trigger_source_ingest",
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_kwargs={"max_retries": 3},
)
def force_trigger_source_ingest(self, source_id: str) -> dict[str, object]:
    return run_async(_run_source_ingest(UUID(source_id), force=True))


@celery.task(name="narad.ingest.poll_active_sources")
def poll_active_sources() -> dict[str, object]:
    return run_async(_poll_active_sources())


async def _poll_active_sources() -> dict[str, object]:
    settings = get_settings()
    database = Database(settings)
    await database.connect()
    try:
        registry = AdapterRegistry(settings)
        await registry.ensure_sources(database)
        known_slugs = {adapter.definition.slug for adapter in registry.list()}
        tenant_id = await database.resolve_default_tenant_id()
        rows = await database.fetch(
            """
            SELECT id, slug
            FROM core.sources
            WHERE tenant_id = $1
              AND status != 'disabled'
              AND is_active = TRUE
              AND (
                last_polled_at IS NULL
                OR last_polled_at + make_interval(secs => COALESCE(update_cadence_seconds, 300)) <= now()
              )
            ORDER BY trust_tier ASC, COALESCE(last_polled_at, to_timestamp(0)) ASC, name ASC
            LIMIT $2
            """,
            tenant_id,
            settings.ingest_max_concurrent_sources,
            tenant_id=tenant_id,
        )
        queued = 0
        for row in rows:
            if row["slug"] not in known_slugs:
                await database.execute(
                    """
                    UPDATE core.sources
                    SET
                        is_active = FALSE,
                        status = 'disabled',
                        last_error = $3
                    WHERE tenant_id = $1 AND id = $2
                    """,
                    tenant_id,
                    row["id"],
                    f"No adapter registered for slug '{row['slug']}'",
                    tenant_id=tenant_id,
                )
                continue
            trigger_source_ingest.delay(str(row["id"]))
            queued += 1
        return {"queued": queued}
    finally:
        await database.disconnect()
