from __future__ import annotations

import json
from datetime import UTC, datetime
from uuid import UUID

from narad.db.session import Database
from narad.events.types import PulseboardCard

SEVERITY_RANK = {
    "critical": 1,
    "high": 2,
    "medium": 3,
    "low": 4,
    "informational": 5,
}


def _place_label(state_code: str | None, district_code: str | None) -> str | None:
    if district_code and state_code:
        return f"{district_code}, {state_code}"
    return district_code or state_code


async def upsert_event_projection(
    database: Database,
    *,
    tenant_id: UUID,
    event_id: UUID,
) -> PulseboardCard:
    event_row = await database.fetchrow(
        """
        SELECT
            e.id,
            e.title,
            COALESCE(sc.explanation, e.summary, e.title) AS summary,
            e.severity,
            e.confidence,
            e.source_count,
            e.state_code,
            e.district_code,
            COALESCE(e.occurred_at, e.created_at) AS event_timestamp,
            COALESCE(s.trust_tier, 1) AS source_trust_tier
        FROM core.events AS e
        LEFT JOIN core.story_capsules AS sc ON sc.id = e.story_capsule_id
        LEFT JOIN core.sources AS s ON s.id = e.primary_source_id
        WHERE e.tenant_id = $1 AND e.id = $2
        """,
        tenant_id,
        event_id,
        tenant_id=tenant_id,
    )
    if event_row is None:
        raise RuntimeError(f"Event {event_id} not found for projection rebuild")

    entity_rows = await database.fetch(
        """
        SELECT ent.canonical_name
        FROM core.event_entity_links AS eel
        JOIN core.entities AS ent ON ent.id = eel.entity_id
        WHERE eel.tenant_id = $1 AND eel.event_id = $2
        ORDER BY ent.canonical_name ASC
        LIMIT 6
        """,
        tenant_id,
        event_id,
        tenant_id=tenant_id,
    )
    linked_entities = [row["canonical_name"] for row in entity_rows]

    card = PulseboardCard(
        event_id=event_row["id"],
        title=event_row["title"],
        summary=event_row["summary"],
        severity=event_row["severity"],
        confidence=float(event_row["confidence"]),
        source_trust_tier=int(event_row["source_trust_tier"]),
        source_count=int(event_row["source_count"]),
        place_label=_place_label(event_row["state_code"], event_row["district_code"]),
        event_timestamp=event_row["event_timestamp"] or datetime.now(UTC),
        linked_entities=linked_entities,
    )

    await database.execute(
        """
        INSERT INTO projections.pulseboard_feed (
            event_id,
            tenant_id,
            card,
            severity_rank,
            occurred_at,
            projected_at
        )
        VALUES ($1, $2, $3::jsonb, $4, $5, now())
        ON CONFLICT (event_id)
        DO UPDATE SET
            card = EXCLUDED.card,
            severity_rank = EXCLUDED.severity_rank,
            occurred_at = EXCLUDED.occurred_at,
            projected_at = now()
        """,
        card.event_id,
        tenant_id,
        json.dumps(card.model_dump(mode="json")),
        SEVERITY_RANK[card.severity],
        card.event_timestamp,
        tenant_id=tenant_id,
    )
    return card
