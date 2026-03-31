from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import pytest

from narad.services.entity_resolution import ResolvedEntity
from narad.services.event_canonicalization import EventCanonicalizationService

from .conftest import FakeDatabase


@pytest.mark.asyncio
async def test_canonicalize_document_uses_existing_candidate(
    settings,
    source_record_factory,
    stored_document_factory,
    tenant_id,
) -> None:
    database = FakeDatabase()
    service = EventCanonicalizationService(settings)
    source = source_record_factory(slug="cwc", name="CWC Bulletins", source_type="portal")
    document = stored_document_factory(
        title="Flood warning for Yamuna basin",
        translated_text="Flood levels are rising in the Yamuna basin.",
        doc_type="forecast",
        metadata={"geometry": {"lat": 28.6139, "lon": 77.2090}},
        published_at=datetime(2026, 3, 29, 10, 0, tzinfo=UTC),
    )
    event_id = uuid4()
    database.queue_fetchrow(
        "FROM core.events AS e",
        {
            "id": event_id,
            "title": document.title,
            "summary": "Existing summary",
            "severity": "medium",
            "confidence": 0.78,
            "occurred_at": document.published_at,
            "source_count": 2,
            "title_similarity": 0.92,
            "entity_overlap": True,
        },
    )

    context = await service.canonicalize_document(
        database,
        tenant_id=tenant_id,
        source=source,
        document=document,
        entities=[
            ResolvedEntity(
                entity_id=uuid4(),
                canonical_name="Yamuna River",
                entity_type="location",
                role="mentioned",
                confidence=0.9,
            )
        ],
    )

    assert context.event_id == event_id
    assert context.is_new is False
    assert context.event_type == "weather"
    assert context.source_count == 3
    update_call = database.calls[1]
    assert update_call[0] == "execute"
    assert "geometry = CASE" in update_call[1]
    assert update_call[2][2] == 28.6139
    assert update_call[2][3] == 77.209


@pytest.mark.asyncio
async def test_canonicalize_document_creates_new_event_when_no_candidate(
    settings,
    source_record_factory,
    stored_document_factory,
    tenant_id,
) -> None:
    database = FakeDatabase()
    service = EventCanonicalizationService(settings)
    source = source_record_factory(slug="sebi_rss", name="SEBI RSS")
    document = stored_document_factory(
        title="SEBI issues fresh disclosure circular",
        translated_text="SEBI issued a new disclosure circular for listed companies.",
        doc_type="circular",
        published_at=datetime(2026, 3, 29, 11, 0, tzinfo=UTC),
    )
    event_id = uuid4()

    database.queue_fetchrow("FROM core.events AS e", None)
    database.queue_fetchrow(
        "INSERT INTO core.events",
        {
            "id": event_id,
            "title": document.title,
            "summary": document.translated_text[: settings.pulseboard_max_summary_chars],
            "event_type": "regulatory",
            "severity": settings.default_event_severity,
            "confidence": settings.default_event_confidence,
            "occurred_at": document.published_at,
            "source_count": 1,
        },
    )

    context = await service.canonicalize_document(
        database,
        tenant_id=tenant_id,
        source=source,
        document=document,
        entities=[],
    )

    assert context.event_id == event_id
    assert context.is_new is True
    assert context.event_type == "regulatory"
    assert context.source_count == 1


@pytest.mark.asyncio
async def test_canonicalize_document_uses_explicit_temporal_bounds_for_candidate_lookup(
    settings,
    source_record_factory,
    stored_document_factory,
    tenant_id,
) -> None:
    database = FakeDatabase()
    service = EventCanonicalizationService(settings)
    source = source_record_factory(slug="imd", name="IMD Alerts", source_type="portal")
    published_at = datetime(2026, 3, 29, 10, 0, tzinfo=UTC)
    document = stored_document_factory(
        title="Heavy rainfall warning for Delhi",
        translated_text="IMD has issued a heavy rainfall warning for Delhi.",
        doc_type="warning",
        published_at=published_at,
    )
    event_id = uuid4()
    database.queue_fetchrow(
        "FROM core.events AS e",
        {
            "id": event_id,
            "title": document.title,
            "summary": "Existing summary",
            "severity": "medium",
            "confidence": 0.82,
            "occurred_at": published_at,
            "source_count": 1,
            "title_similarity": 0.91,
            "entity_overlap": True,
        },
    )

    await service.canonicalize_document(
        database,
        tenant_id=tenant_id,
        source=source,
        document=document,
        entities=[],
    )

    method, query, args, query_tenant_id = database.calls[0]

    assert method == "fetchrow"
    assert query_tenant_id == tenant_id
    assert "BETWEEN $3 AND $4" in query
    assert "make_interval" not in query
    assert args[2] == datetime(2026, 3, 28, 10, 0, tzinfo=UTC)
    assert args[3] == datetime(2026, 3, 30, 10, 0, tzinfo=UTC)


@pytest.mark.asyncio
async def test_canonicalize_document_accepts_stringified_geometry_metadata(
    settings,
    source_record_factory,
    stored_document_factory,
    tenant_id,
) -> None:
    database = FakeDatabase()
    service = EventCanonicalizationService(settings)
    source = source_record_factory(slug="cwc", name="CWC Bulletins", source_type="portal")
    published_at = datetime(2026, 3, 29, 10, 0, tzinfo=UTC)
    document = stored_document_factory(
        title="Daily Flood Situation Report cum Advisories",
        translated_text="National flood advisory.",
        doc_type="forecast",
        metadata={"geometry": '{"lat": 20.5937, "lon": 78.9629}'},
        published_at=published_at,
    )
    event_id = uuid4()
    database.queue_fetchrow(
        "FROM core.events AS e",
        {
            "id": event_id,
            "title": document.title,
            "summary": "Existing summary",
            "severity": "medium",
            "confidence": 0.78,
            "occurred_at": published_at,
            "source_count": 1,
            "title_similarity": 0.95,
            "entity_overlap": True,
        },
    )

    context = await service.canonicalize_document(
        database,
        tenant_id=tenant_id,
        source=source,
        document=document,
        entities=[],
    )

    assert context.event_id == event_id
    update_call = database.calls[1]
    assert update_call[2][2] == 20.5937
    assert update_call[2][3] == 78.9629
