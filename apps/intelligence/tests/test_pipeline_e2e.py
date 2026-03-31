from __future__ import annotations

from uuid import UUID, uuid4

import pytest

from narad.commands.ingest_document import enrich_stored_document
from narad.db.models import IngestedDocumentRecord
from narad.services.claim_extraction import ClaimCandidate, PersistedClaim
from narad.services.entity_resolution import ResolvedEntity
from narad.services.event_canonicalization import EventContext
from narad.services.story_capsules import StoryCapsuleResult

from .conftest import FakeDatabase


class StubClaimService:
    configured = False

    async def extract_claims(self, **_kwargs):
        return [
            ClaimCandidate(
                claim_text="Alpha Industries announces a new filing",
                confidence=1.0,
                entities_mentioned=["Alpha Industries Limited"],
                event_type_hint="corporate",
            )
        ]

    async def persist_claims(self, _database, *, tenant_id, document_id, event_id, claims):
        assert tenant_id
        assert document_id
        assert event_id is None
        return [
            PersistedClaim(
                claim_id=uuid4(),
                claim_text=claims[0].claim_text,
                confidence=claims[0].confidence,
                entities_mentioned=claims[0].entities_mentioned,
                event_type_hint=claims[0].event_type_hint,
            )
        ]


class StubEntityResolutionService:
    def __init__(self) -> None:
        self.claim_links: list[tuple[UUID, UUID]] = []
        self.event_links: list[tuple[UUID, UUID]] = []

    async def resolve_entities(self, _database, *, claims, **_kwargs):
        assert claims
        return [
            ResolvedEntity(
                entity_id=uuid4(),
                canonical_name="Alpha Industries Limited",
                entity_type="company",
                role="target",
                confidence=0.93,
            )
        ]

    async def attach_claim_entities(self, _database, *, claims, entities, **_kwargs):
        for claim in claims:
            for entity in entities:
                self.claim_links.append((claim.claim_id, entity.entity_id))

    async def link_entities_to_event(self, _database, *, event_id, entities, **_kwargs):
        for entity in entities:
            self.event_links.append((event_id, entity.entity_id))


class StubEventCanonicalizationService:
    def __init__(self) -> None:
        self.claim_link_event: tuple[UUID, list[UUID]] | None = None

    async def canonicalize_document(self, _database, *, document, **_kwargs):
        return EventContext(
            event_id=uuid4(),
            title=document.title,
            summary=document.translated_text,
            event_type="corporate",
            severity="medium",
            confidence=0.82,
            occurred_at=document.published_at,
            source_count=1,
            is_new=True,
        )

    async def link_claims_to_event(self, _database, *, event_id, claim_ids, **_kwargs):
        self.claim_link_event = (event_id, list(claim_ids))


class StubStoryCapsuleService:
    def __init__(self) -> None:
        self.calls: list[dict[str, object]] = []

    async def upsert(self, _database, *, tenant_id, event_id, title, summary, evidence_urls, force_refresh=False):
        self.calls.append(
            {
                "tenant_id": tenant_id,
                "event_id": event_id,
                "title": title,
                "summary": summary,
                "evidence_urls": evidence_urls,
                "force_refresh": force_refresh,
            }
        )
        return StoryCapsuleResult(
            capsule_id=uuid4(),
            event_id=event_id,
            headline=title[:120],
            explanation=summary,
            ai_model="deterministic-fallback",
            confidence=0.75,
        )


@pytest.mark.asyncio
async def test_enrich_stored_document_wires_claims_entities_events_and_story_capsules(
    settings,
    source_record_factory,
    stored_document_factory,
) -> None:
    database = FakeDatabase()
    source = source_record_factory(slug="nse_rss", name="NSE Corporate Announcements")
    document = stored_document_factory(
        source_id=source.id,
        title="Alpha Industries files exchange disclosure",
        translated_text="Alpha Industries filed an exchange disclosure about a board decision.",
        fetch_url="https://nse.example/notice",
    )
    claim_service = StubClaimService()
    entity_service = StubEntityResolutionService()
    event_service = StubEventCanonicalizationService()
    story_service = StubStoryCapsuleService()

    outcome = await enrich_stored_document(
        database,
        None,
        settings=settings,
        source=source,
        document=document,
        claim_service=claim_service,
        entity_resolution_service=entity_service,
        event_canonicalization_service=event_service,
        story_capsule_service=story_service,
        publish_pulseboard=False,
    )

    assert isinstance(outcome.record, IngestedDocumentRecord)
    assert outcome.record.document_id == document.document_id
    assert outcome.event_type == "corporate"
    assert len(outcome.entity_ids) == 1
    assert event_service.claim_link_event is not None
    assert len(event_service.claim_link_event[1]) == 1
    assert len(entity_service.claim_links) == 1
    assert len(entity_service.event_links) == 1
    assert len(story_service.calls) == 1
    assert story_service.calls[0]["evidence_urls"] == [document.fetch_url]
