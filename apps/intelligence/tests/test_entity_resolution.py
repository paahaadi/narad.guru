from __future__ import annotations

from uuid import uuid4

import pytest

from narad.services.claim_extraction import PersistedClaim
from narad.services.entity_resolution import EntityResolutionService

from .conftest import FakeDatabase, json_arg


@pytest.mark.asyncio
async def test_extract_mentions_includes_regulator_company_and_cin(source_record_factory, settings) -> None:
    service = EntityResolutionService(settings)
    source = source_record_factory(slug="sebi_rss", name="SEBI RSS")
    claims = [
        PersistedClaim(
            claim_id=uuid4(),
            claim_text="Alpha Industries Limited received SEBI/HO/CFD/123/2026 under CIN L12345MH2020PLC123456.",
            confidence=0.92,
            entities_mentioned=["Alpha Industries Limited", "L12345MH2020PLC123456"],
            event_type_hint="regulatory",
        )
    ]

    mentions = service._extract_mentions(source, claims)
    names = {mention.name: mention for mention in mentions}

    assert "Securities and Exchange Board of India" in names
    assert names["Securities and Exchange Board of India"].role == "regulator"
    assert "Alpha Industries Limited" in names
    assert names["Alpha Industries Limited"].entity_type == "company"
    assert "L12345MH2020PLC123456" in names
    assert names["L12345MH2020PLC123456"].external_ids["cin"] == "L12345MH2020PLC123456"


@pytest.mark.asyncio
async def test_resolve_entities_creates_new_entity_when_no_match(
    source_record_factory,
    settings,
    tenant_id,
) -> None:
    service = EntityResolutionService(settings)
    database = FakeDatabase()
    source = source_record_factory(slug="imd", name="IMD Alerts", source_type="portal")
    claims = [
        PersistedClaim(
            claim_id=uuid4(),
            claim_text="Heavy rainfall warning for Alpha Industries Limited.",
            confidence=0.81,
            entities_mentioned=["Alpha Industries Limited"],
            event_type_hint="weather",
        )
    ]
    entity_id = uuid4()

    database.queue_fetchrow("external_ids @> $3::jsonb", None)
    database.queue_fetchrow("lower(canonical_name) = lower($3)", None)
    database.queue_fetchrow("GREATEST(", None)
    database.queue_fetchrow(
        "INSERT INTO core.entities",
        {
            "id": entity_id,
            "canonical_name": "Alpha Industries Limited",
            "entity_type": "company",
        },
    )

    resolved = await service.resolve_entities(
        database,
        tenant_id=tenant_id,
        source=source,
        claims=claims,
    )

    assert len(resolved) == 1
    assert resolved[0].entity_id == entity_id
    assert resolved[0].canonical_name == "Alpha Industries Limited"
    assert resolved[0].entity_type == "company"


@pytest.mark.asyncio
async def test_resolve_entities_handles_json_string_external_ids_on_existing_entity(
    source_record_factory,
    settings,
    tenant_id,
) -> None:
    service = EntityResolutionService(settings)
    database = FakeDatabase()
    source = source_record_factory(slug="imd", name="IMD Alerts", source_type="portal")
    claims = [
        PersistedClaim(
            claim_id=uuid4(),
            claim_text="Heavy rainfall warning for Alpha Industries Limited.",
            confidence=0.81,
            entities_mentioned=["Alpha Industries Limited"],
            event_type_hint="weather",
        )
    ]
    entity_id = uuid4()

    database.queue_fetchrow("external_ids @> $3::jsonb", None)
    database.queue_fetchrow(
        "lower(canonical_name) = lower($3)",
        {
            "id": entity_id,
            "canonical_name": "Alpha Industries Limited",
            "entity_type": "company",
            "aliases": [],
            "external_ids": '{"cin":"L12345MH2020PLC123456"}',
        },
    )

    resolved = await service.resolve_entities(
        database,
        tenant_id=tenant_id,
        source=source,
        claims=claims,
    )

    assert len(resolved) == 1
    assert resolved[0].entity_id == entity_id
    assert resolved[0].external_ids == {"cin": "L12345MH2020PLC123456"}

    execute_calls = [call for call in database.calls if call[0] == "execute" and "UPDATE core.entities" in call[1]]
    assert len(execute_calls) == 1
    assert json_arg(execute_calls[0][2], 3) == {"cin": "L12345MH2020PLC123456"}
