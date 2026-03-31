from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import pytest

from narad.services.entity_narratives import EntityNarrativeService

from .conftest import FakeDatabase


class StubNarrativeLLM:
    def __init__(self, payload):
        self.payload = payload
        self.calls = 0
        self.configured = True

    async def generate_json(self, prompt: str):
        self.calls += 1
        return self.payload


@pytest.mark.asyncio
async def test_generate_entity_narrative_uses_cache(settings, tenant_id) -> None:
    database = FakeDatabase()
    entity_id = uuid4()
    expires_at = datetime(2026, 3, 30, tzinfo=UTC)
    database.queue_fetchrow(
        "FROM corp_watch.entity_narratives",
        {
            "narrative": "Cached entity narrative.",
            "confidence": 0.73,
            "generated_by": "cache",
            "expires_at": expires_at,
        },
    )
    llm = StubNarrativeLLM({"narrative": "Should not be used", "confidence": 0.92})
    service = EntityNarrativeService(settings, llm_service=llm)

    result = await service.generate_entity_narrative(
        database,
        tenant_id=tenant_id,
        entity_id=entity_id,
    )

    assert result.cached is True
    assert result.narrative == "Cached entity narrative."
    assert llm.calls == 0


@pytest.mark.asyncio
async def test_generate_entity_narrative_persists_llm_result(settings, tenant_id) -> None:
    database = FakeDatabase()
    entity_id = uuid4()
    database.queue_fetchrow("FROM corp_watch.entity_narratives", None)
    database.queue_fetchrow(
        "FROM core.entities AS e",
        {
            "id": entity_id,
            "canonical_name": "Narad Infrastructure Ltd",
            "entity_type": "company",
            "description": "Infrastructure operator",
            "risk_score": 72.0,
            "external_ids": {"cin": "L123"},
            "sector": "Infrastructure",
            "company_status": "Active",
            "listing_status": "Listed",
            "authorized_capital_inr": None,
            "paid_up_capital_inr": None,
            "last_filing_date": None,
        },
    )
    database.queue_fetch(
        "FROM core.relationships AS rel",
        [
            {
                "relationship_type": "subsidiary",
                "confidence": 0.91,
                "counterparty_name": "Narad Projects Pvt Ltd",
                "counterparty_type": "company",
            }
        ],
    )
    database.queue_fetch(
        "FROM core.event_entity_links AS eel",
        [
            {
                "title": "SEBI filing update",
                "event_type": "regulatory",
                "severity": "medium",
                "occurred_at": datetime(2026, 3, 29, tzinfo=UTC),
            }
        ],
    )
    database.queue_execute("INSERT INTO corp_watch.entity_narratives", "INSERT 0 1")

    llm = StubNarrativeLLM({"narrative": "LLM narrative.", "confidence": 0.88})
    service = EntityNarrativeService(settings, llm_service=llm)

    result = await service.generate_entity_narrative(
        database,
        tenant_id=tenant_id,
        entity_id=entity_id,
        force_refresh=True,
    )

    assert result.cached is False
    assert result.narrative == "LLM narrative."
    assert result.generated_by == settings.gemini_model
    assert llm.calls == 1
