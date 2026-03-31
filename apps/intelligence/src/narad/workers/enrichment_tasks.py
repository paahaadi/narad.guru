from __future__ import annotations

from uuid import UUID

import redis.asyncio as redis

from narad.commands.ingest_document import enrich_stored_document
from narad.config import get_settings
from narad.db.models import SourceRecord
from narad.db.session import Database
from narad.services.claim_extraction import ClaimExtractionService
from narad.services.dead_letter import DeadLetterService
from narad.services.embedding import EmbeddingService, vector_literal
from narad.services.entity_resolution import EntityResolutionService
from narad.services.event_canonicalization import REGULATORY_EVENT_TYPES, EventCanonicalizationService
from narad.services.ingestion import DocumentIngestionService
from narad.services.llm import LLMService
from narad.services.story_capsules import StoryCapsuleService
from narad.services.translation import TranslationService
from narad.workers.celery_app import celery, run_async
from narad.workers.projection_tasks import (
    evaluate_rules_for_event,
    rebuild_entity_summary_projection,
    rebuild_geostrat_projection,
    rebuild_pulseboard_projection,
    rebuild_regulatory_digest_projection,
)

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


@celery.task(name="narad.enrichment.enrich_document")
def enrich_document(document_id: str) -> dict[str, object]:
    return run_async(_enrich_document(UUID(document_id)))


@celery.task(name="narad.enrichment.translate_document")
def translate_document(document_id: str) -> dict[str, object]:
    return run_async(_translate_document(UUID(document_id)))


async def _translate_document(document_id: UUID) -> dict[str, object]:
    settings = get_settings()
    database = Database(settings)
    redis_client = redis.from_url(settings.redis_url, decode_responses=False)
    document_ingestion_service = DocumentIngestionService()
    translation_service = TranslationService(settings)

    await database.connect()
    try:
        tenant_id = await database.resolve_default_tenant_id()
        document = await document_ingestion_service.load_document(
            database,
            tenant_id=tenant_id,
            document_id=document_id,
        )
        if document is None:
            raise RuntimeError(f"Document {document_id} not found")

        translation = await translation_service.translate(
            document.body_text,
            source_language=document.original_language,
            target_language=settings.bhashini_target_language,
        )
        translated_text = translation.text.strip() or document.body_text
        translated_language = (
            translation.target_language if translation.translated else document.original_language
        )
        updated_document = await document_ingestion_service.update_translation(
            database,
            tenant_id=tenant_id,
            document_id=document_id,
            translated_text=translated_text,
            translated_language=translated_language,
        )
        if updated_document is None:
            raise RuntimeError(f"Document {document_id} disappeared during translation")

        enrich_document.delay(str(document_id))
        return {
            "status": "translated" if translation.translated else "fallback",
            "document_id": str(document_id),
            "original_language": document.original_language,
            "translated_language": updated_document.translated_language,
        }
    except Exception as exc:
        await dead_letter_service.publish_failure(
            database,
            redis_client,
            queue_name="enrichment",
            task_name="narad.enrichment.translate_document",
            payload={"args": [str(document_id)], "kwargs": {}, "document_id": str(document_id)},
            error_message=str(exc),
        )
        raise
    finally:
        await redis_client.aclose()
        await database.disconnect()


async def _enrich_document(document_id: UUID) -> dict[str, object]:
    settings = get_settings()
    database = Database(settings)
    redis_client = redis.from_url(settings.redis_url, decode_responses=False)
    document_ingestion_service = DocumentIngestionService()
    llm_service = LLMService(settings)
    claim_service = ClaimExtractionService(llm_service)
    entity_resolution_service = EntityResolutionService(settings)
    event_canonicalization_service = EventCanonicalizationService(settings)
    story_capsule_service = StoryCapsuleService(llm_service)

    await database.connect()
    try:
        tenant_id = await database.resolve_default_tenant_id()
        document = await document_ingestion_service.load_document(
            database,
            tenant_id=tenant_id,
            document_id=document_id,
        )
        if document is None:
            raise RuntimeError(f"Document {document_id} not found")
        source = await _source_record_by_id(database, document.source_id)
        if source is None:
            raise RuntimeError(f"Source {document.source_id} not found")

        outcome = await enrich_stored_document(
            database,
            None,
            settings=settings,
            source=source,
            document=document,
            claim_service=claim_service,
            entity_resolution_service=entity_resolution_service,
            event_canonicalization_service=event_canonicalization_service,
            story_capsule_service=story_capsule_service,
            publish_pulseboard=False,
        )
        rebuild_pulseboard_projection.delay(str(outcome.record.event_id))
        rebuild_geostrat_projection.delay(str(outcome.record.event_id), str(source.tenant_id))
        for entity_id in outcome.entity_ids:
            rebuild_entity_summary_projection.delay(str(entity_id), str(source.tenant_id))
        if outcome.event_type in REGULATORY_EVENT_TYPES:
            rebuild_regulatory_digest_projection.delay(str(outcome.record.event_id), str(source.tenant_id))
        evaluate_rules_for_event.delay(str(outcome.record.event_id), str(source.tenant_id))
        refresh_story_capsule.delay(str(outcome.record.event_id))

        await database.execute(
            """
            UPDATE core.sources
            SET events_produced_total = events_produced_total + 1
            WHERE tenant_id = $1 AND id = $2
            """,
            source.tenant_id,
            source.id,
            tenant_id=source.tenant_id,
        )

        return {
            "status": "processed",
            "document_id": str(outcome.record.document_id),
            "event_id": str(outcome.record.event_id),
            "entity_ids": [str(entity_id) for entity_id in outcome.entity_ids],
            "event_type": outcome.event_type,
        }
    except Exception as exc:
        await dead_letter_service.publish_failure(
            database,
            redis_client,
            queue_name="enrichment",
            task_name="narad.enrichment.enrich_document",
            payload={"args": [str(document_id)], "kwargs": {}, "document_id": str(document_id)},
            error_message=str(exc),
        )
        raise
    finally:
        await redis_client.aclose()
        await database.disconnect()


@celery.task(name="narad.enrichment.flush_embedding_batch")
def flush_embedding_batch() -> dict[str, object]:
    return run_async(_flush_embedding_batch())


async def _flush_embedding_batch() -> dict[str, object]:
    settings = get_settings()
    database = Database(settings)
    embedding_service = EmbeddingService(settings)
    await database.connect()
    try:
        tenant_id = await database.resolve_default_tenant_id()
        batch_specs = [
            (
                "events",
                """
                SELECT id, title, COALESCE(summary, title) AS text_value
                FROM core.events
                WHERE tenant_id = $1 AND embedding IS NULL
                ORDER BY created_at DESC
                LIMIT $2
                """,
                "core.events",
            ),
            (
                "entities",
                """
                SELECT id, canonical_name AS title, COALESCE(description, canonical_name) AS text_value
                FROM core.entities
                WHERE tenant_id = $1 AND embedding IS NULL
                ORDER BY created_at DESC
                LIMIT $2
                """,
                "core.entities",
            ),
            (
                "documents",
                """
                SELECT
                    id,
                    COALESCE(title, external_id, doc_type) AS title,
                    COALESCE(translated_text, body_text, COALESCE(title, external_id, doc_type)) AS text_value
                FROM core.documents
                WHERE tenant_id = $1 AND embedding IS NULL
                ORDER BY fetched_at DESC
                LIMIT $2
                """,
                "core.documents",
            ),
        ]

        selected_rows = []
        selected_table = ""
        selected_kind = ""
        for kind, query, table_name in batch_specs:
            rows = await database.fetch(
                query,
                tenant_id,
                settings.embed_batch_size,
                tenant_id=tenant_id,
            )
            if rows:
                selected_rows = list(rows)
                selected_table = table_name
                selected_kind = kind
                break

        if not selected_rows:
            return {"status": "noop", "reason": "no embedding backlog"}

        vectors = await embedding_service.embed_texts([row["text_value"] for row in selected_rows])
        for row, vector in zip(selected_rows, vectors.vectors, strict=False):
            await database.execute(
                f"UPDATE {selected_table} SET embedding = $2::vector WHERE id = $1",
                row["id"],
                vector_literal(vector),
                tenant_id=tenant_id,
            )
        return {"status": "processed", "kind": selected_kind, "count": len(vectors.vectors)}
    finally:
        await database.disconnect()


@celery.task(name="narad.enrichment.refresh_story_capsule")
def refresh_story_capsule(event_id: str) -> dict[str, str]:
    return run_async(_refresh_story_capsule(UUID(event_id)))


async def _refresh_story_capsule(event_id: UUID) -> dict[str, str]:
    settings = get_settings()
    database = Database(settings)
    llm_service = LLMService(settings)
    story_capsule_service = StoryCapsuleService(llm_service)
    await database.connect()
    try:
        tenant_id = await database.resolve_default_tenant_id()
        row = await database.fetchrow(
            """
            SELECT
                e.id,
                e.title,
                COALESCE(e.summary, sc.explanation, e.title) AS summary,
                ARRAY_REMOVE(ARRAY_AGG(DISTINCT d.fetch_url), NULL) AS evidence_urls
            FROM core.events AS e
            LEFT JOIN core.story_capsules AS sc ON sc.id = e.story_capsule_id
            LEFT JOIN core.event_document_links AS edl ON edl.event_id = e.id AND edl.tenant_id = e.tenant_id
            LEFT JOIN core.documents AS d ON d.id = edl.document_id
            WHERE e.tenant_id = $1 AND e.id = $2
            GROUP BY e.id, e.title, e.summary, sc.explanation
            """,
            tenant_id,
            event_id,
            tenant_id=tenant_id,
        )
        if row is None:
            return {"status": "missing", "event_id": str(event_id)}
        await story_capsule_service.upsert(
            database,
            tenant_id=tenant_id,
            event_id=event_id,
            title=row["title"],
            summary=row["summary"],
            evidence_urls=[str(url) for url in row["evidence_urls"] or []],
            force_refresh=True,
        )
        return {"status": "refreshed", "event_id": str(event_id)}
    finally:
        await database.disconnect()
