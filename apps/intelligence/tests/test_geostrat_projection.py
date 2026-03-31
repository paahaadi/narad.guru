from __future__ import annotations

from uuid import UUID, uuid4

import pytest

from tests.conftest import FakeDatabase


@pytest.fixture
def db() -> FakeDatabase:
    return FakeDatabase()


@pytest.fixture
def tid() -> UUID:
    return uuid4()


@pytest.mark.asyncio
async def test_upsert_creates_row_for_geolocated_event(db: FakeDatabase, tid: UUID) -> None:
    from narad.projections.geostrat import upsert_geostrat_projection

    event_id = uuid4()

    # Queue: fetch event with geometry
    db.queue_fetchrow("core.events", {
        "id": event_id,
        "title": "Flood warning in Bihar",
        "event_type": "natural_disaster",
        "severity": "critical",
        "confidence": 0.95,
        "source_count": 3,
        "occurred_at": "2026-03-30T10:00:00Z",
        "geometry": "POINT(85.1 25.6)",
        "state_code": "IN-BR",
        "district_code": "patna",
        "cluster_label": "Bihar floods 2026",
    })

    # Queue: upsert into projection
    db.queue_execute("INSERT INTO projections.geostrat_events")

    result = await upsert_geostrat_projection(db, tenant_id=tid, event_id=event_id)

    assert result is not None
    assert result["status"] == "projected"
    assert result["event_type"] == "natural_disaster"

    upsert_calls = [c for c in db.calls if "projections.geostrat_events" in c[1] and "INSERT" in c[1]]
    assert len(upsert_calls) == 1


@pytest.mark.asyncio
async def test_upsert_deletes_event_without_geometry(db: FakeDatabase, tid: UUID) -> None:
    from narad.projections.geostrat import upsert_geostrat_projection

    event_id = uuid4()

    # Queue: event not found (geometry IS NOT NULL filter excludes it)
    db.queue_fetchrow("core.events", None)

    # Queue: DELETE from projection (cleanup)
    db.queue_execute("DELETE FROM projections.geostrat_events")

    result = await upsert_geostrat_projection(db, tenant_id=tid, event_id=event_id)

    assert result is None

    delete_calls = [c for c in db.calls if "DELETE" in c[1] and "projections.geostrat_events" in c[1]]
    assert len(delete_calls) == 1


@pytest.mark.asyncio
async def test_upsert_handles_invalidated_event(db: FakeDatabase, tid: UUID) -> None:
    from narad.projections.geostrat import upsert_geostrat_projection

    event_id = uuid4()

    # Queue: event not found (status = 'invalidated' filter excludes it)
    db.queue_fetchrow("core.events", None)

    # Queue: DELETE for cleanup
    db.queue_execute("DELETE FROM projections.geostrat_events")

    result = await upsert_geostrat_projection(db, tenant_id=tid, event_id=event_id)

    assert result is None
