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
async def test_evaluate_event_rules_fires_alert_for_matching_rule(db: FakeDatabase, tid: UUID) -> None:
    from narad.services.rule_evaluation import evaluate_watchlist_rules

    event_id = uuid4()
    watchlist_id = uuid4()
    rule_id = uuid4()
    alert_id = uuid4()

    # Queue: load event context (called first since trigger_type="event")
    db.queue_fetchrow("core.events", {
        "id": event_id,
        "title": "Test critical event",
        "event_type": "regulatory",
        "severity": "critical",
        "confidence": 0.9,
        "source_count": 1,
        "state_code": "IN-DL",
        "district_code": "",
        "cluster_id": None,
    })

    # Queue: fetch active rules
    db.queue_fetch("watchlist_rules", [
        {
            "rule_id": rule_id,
            "watchlist_id": watchlist_id,
            "rule_name": "Critical events",
            "condition": {"==": [{"var": "severity"}, "critical"]},
            "severity_override": None,
            "is_active": True,
        },
    ])

    # Queue: episode resolution — use specific needle
    db.queue_fetchrow("SELECT episode_id", None)

    # Queue: alert creation — use specific needle
    db.queue_fetchrow("INSERT INTO workflow.watchlist_alerts", {
        "id": alert_id,
        "created_at": "2026-03-31T10:00:00Z",
    })

    # Queue: self-assign episode_id
    db.queue_execute("UPDATE workflow.watchlist_alerts SET episode_id")

    alerts = await evaluate_watchlist_rules(
        db, tenant_id=tid, trigger_type="event", trigger_id=event_id,
    )
    assert len(alerts) == 1
    assert alerts[0]["alert_id"] == alert_id

    insert_calls = [c for c in db.calls if "INSERT INTO workflow.watchlist_alerts" in c[1]]
    assert len(insert_calls) >= 1


@pytest.mark.asyncio
async def test_evaluate_event_rules_skips_non_matching_rule(db: FakeDatabase, tid: UUID) -> None:
    from narad.services.rule_evaluation import evaluate_watchlist_rules

    event_id = uuid4()

    # Queue: load event context — low severity
    db.queue_fetchrow("core.events", {
        "id": event_id,
        "title": "Low severity event",
        "event_type": "news",
        "severity": "low",
        "confidence": 0.5,
        "source_count": 1,
        "state_code": "IN-MH",
        "district_code": "",
        "cluster_id": None,
    })

    # Queue: fetch active rules — expects critical
    db.queue_fetch("watchlist_rules", [
        {
            "rule_id": uuid4(),
            "watchlist_id": uuid4(),
            "rule_name": "Critical only",
            "condition": {"==": [{"var": "severity"}, "critical"]},
            "severity_override": None,
            "is_active": True,
        },
    ])

    alerts = await evaluate_watchlist_rules(
        db, tenant_id=tid, trigger_type="event", trigger_id=event_id,
    )
    assert len(alerts) == 0


@pytest.mark.asyncio
async def test_evaluate_entity_rules_loads_entity_context(db: FakeDatabase, tid: UUID) -> None:
    from narad.services.rule_evaluation import evaluate_watchlist_rules

    entity_id = uuid4()
    alert_id = uuid4()

    # Queue: load entity context
    db.queue_fetchrow("core.entities", {
        "id": entity_id,
        "entity_type": "company",
        "canonical_name": "Test Corp",
        "description": "Test entity",
        "risk_score": 85,
        "health_score": 40,
        "sector": "finance",
    })

    # Queue: fetch active rules
    db.queue_fetch("watchlist_rules", [
        {
            "rule_id": uuid4(),
            "watchlist_id": uuid4(),
            "rule_name": "High risk entities",
            "condition": {">": [{"var": "risk_score"}, 70]},
            "severity_override": "high",
            "is_active": True,
        },
    ])

    # Queue: episode resolution
    db.queue_fetchrow("SELECT episode_id", None)

    # Queue: alert creation
    db.queue_fetchrow("INSERT INTO workflow.watchlist_alerts", {
        "id": alert_id,
        "created_at": "2026-03-31T10:00:00Z",
    })

    # Queue: self-assign episode_id
    db.queue_execute("UPDATE workflow.watchlist_alerts SET episode_id")

    alerts = await evaluate_watchlist_rules(
        db, tenant_id=tid, trigger_type="entity", trigger_id=entity_id,
    )
    assert len(alerts) == 1


@pytest.mark.asyncio
async def test_evaluate_rules_returns_empty_when_no_rules(db: FakeDatabase, tid: UUID) -> None:
    from narad.services.rule_evaluation import evaluate_watchlist_rules

    event_id = uuid4()

    # Queue: event context
    db.queue_fetchrow("core.events", {
        "id": event_id,
        "title": "Some event",
        "event_type": "news",
        "severity": "low",
        "confidence": 0.5,
        "source_count": 1,
        "state_code": "",
        "district_code": "",
        "cluster_id": None,
    })

    # Queue: no active rules
    db.queue_fetch("watchlist_rules", [])

    alerts = await evaluate_watchlist_rules(
        db, tenant_id=tid, trigger_type="event", trigger_id=event_id,
    )
    assert len(alerts) == 0
