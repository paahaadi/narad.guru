from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

from narad.adapters.base import RawDocument
from narad.commands.extract_claims import extract_claim_candidates, persist_claims
from narad.commands.generate_story_capsule import upsert_story_capsule
from narad.config import Settings
from narad.db.models import IngestedDocumentRecord, SourceRecord
from narad.db.session import Database
from narad.events.publisher import EventPublisher
from narad.events.types import DeltaEnvelope
from narad.projections.pulseboard import upsert_event_projection
from narad.services.claim_extraction import ClaimExtractionService
from narad.services.entity_resolution import EntityResolutionService
from narad.services.event_canonicalization import EventCanonicalizationService
from narad.services.ingestion import DocumentIngestionService, StoredDocumentRecord
from narad.services.story_capsules import StoryCapsuleService
from narad.services.translation import TranslationService


@dataclass(slots=True)
class EnrichmentOutcome:
    record: IngestedDocumentRecord
    entity_ids: list[UUID]
    event_type: str


async def _existing_record(
    database: Database,
    *,
    tenant_id: UUID,
    document: StoredDocumentRecord,
) -> IngestedDocumentRecord | None:
    row = await database.fetchrow(
        """
        SELECT
            edl.event_id,
            d.id AS document_id,
            d.source_id,
            d.title,
            d.content_hash,
            COALESCE(d.published_at, d.fetched_at) AS published_at
        FROM core.documents AS d
        LEFT JOIN core.event_document_links AS edl
          ON edl.tenant_id = d.tenant_id
         AND edl.document_id = d.id
        WHERE d.tenant_id = $1 AND d.id = $2
        ORDER BY edl.created_at DESC NULLS LAST
        LIMIT 1
        """,
        tenant_id,
        document.document_id,
        tenant_id=tenant_id,
    )
    if row is None or row["event_id"] is None:
        return None
    return IngestedDocumentRecord(
        document_id=row["document_id"],
        event_id=row["event_id"],
        source_id=row["source_id"],
        title=row["title"],
        content_hash=row["content_hash"],
        published_at=row["published_at"],
    )


async def enrich_stored_document(
    database: Database,
    event_publisher: EventPublisher | None,
    *,
    settings: Settings,
    source: SourceRecord,
    document: StoredDocumentRecord,
    claim_service: ClaimExtractionService,
    entity_resolution_service: EntityResolutionService,
    event_canonicalization_service: EventCanonicalizationService,
    story_capsule_service: StoryCapsuleService,
    publish_pulseboard: bool = False,
) -> EnrichmentOutcome:
    claims = await extract_claim_candidates(
        claim_service,
        document_hash=document.content_hash,
        title=document.title,
        body_text=document.translated_text or document.body_text,
        source_slug=source.slug,
        source_name=source.name,
    )
    persisted_claims = await persist_claims(
        database,
        claim_service,
        tenant_id=source.tenant_id,
        document_id=document.document_id,
        event_id=None,
        claims=claims,
    )
    resolved_entities = await entity_resolution_service.resolve_entities(
        database,
        tenant_id=source.tenant_id,
        source=source,
        claims=persisted_claims,
    )
    await entity_resolution_service.attach_claim_entities(
        database,
        tenant_id=source.tenant_id,
        claims=persisted_claims,
        entities=resolved_entities,
    )
    event_context = await event_canonicalization_service.canonicalize_document(
        database,
        tenant_id=source.tenant_id,
        source=source,
        document=document,
        entities=resolved_entities,
    )
    await event_canonicalization_service.link_claims_to_event(
        database,
        tenant_id=source.tenant_id,
        event_id=event_context.event_id,
        claim_ids=[claim.claim_id for claim in persisted_claims],
    )
    await entity_resolution_service.link_entities_to_event(
        database,
        tenant_id=source.tenant_id,
        event_id=event_context.event_id,
        entities=resolved_entities,
    )
    await upsert_story_capsule(
        database,
        story_capsule_service,
        tenant_id=source.tenant_id,
        event_id=event_context.event_id,
        title=event_context.title,
        summary=event_context.summary,
        evidence_urls=[document.fetch_url] if document.fetch_url else [],
    )

    if publish_pulseboard and event_publisher is not None:
        projection_card = await upsert_event_projection(
            database,
            tenant_id=source.tenant_id,
            event_id=event_context.event_id,
        )
        await event_publisher.publish(
            "narad:pulseboard:event",
            DeltaEnvelope(
                channel="narad:pulseboard:event",
                tenant_id=str(source.tenant_id),
                entity_type="event",
                entity_id=str(event_context.event_id),
                changes={"card": projection_card.model_dump(mode="json")},
                timestamp=(document.published_at or datetime.now(UTC)).isoformat(),
            ),
        )

    return EnrichmentOutcome(
        record=IngestedDocumentRecord(
            document_id=document.document_id,
            event_id=event_context.event_id,
            source_id=source.id,
            title=document.title,
            content_hash=document.content_hash,
            published_at=document.published_at,
        ),
        entity_ids=[entity.entity_id for entity in resolved_entities],
        event_type=event_context.event_type,
    )


async def ingest_raw_document(
    database: Database,
    event_publisher: EventPublisher | None,
    *,
    settings: Settings,
    source: SourceRecord,
    raw_document: RawDocument,
    translation_service: TranslationService,
    claim_service: ClaimExtractionService,
    entity_resolution_service: EntityResolutionService,
    event_canonicalization_service: EventCanonicalizationService,
    story_capsule_service: StoryCapsuleService,
    document_ingestion_service: DocumentIngestionService,
    publish_pulseboard: bool = False,
) -> EnrichmentOutcome:
    document = await document_ingestion_service.store_raw_document(
        database,
        source=source,
        raw_document=raw_document,
        translation_service=translation_service,
        defer_translation=False,
    )
    if not document.is_new:
        existing = await _existing_record(
            database,
            tenant_id=source.tenant_id,
            document=document,
        )
        if existing is not None:
            return EnrichmentOutcome(
                record=existing,
                entity_ids=[],
                event_type=settings.default_event_type,
            )
    return await enrich_stored_document(
        database,
        event_publisher,
        settings=settings,
        source=source,
        document=document,
        claim_service=claim_service,
        entity_resolution_service=entity_resolution_service,
        event_canonicalization_service=event_canonicalization_service,
        story_capsule_service=story_capsule_service,
        publish_pulseboard=publish_pulseboard,
    )
