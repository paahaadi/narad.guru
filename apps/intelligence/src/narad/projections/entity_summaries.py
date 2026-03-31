from __future__ import annotations

import json
from datetime import UTC, datetime
from uuid import UUID

from narad.db.session import Database


def _json_safe(value: object) -> object:
    return json.loads(json.dumps(value, default=str))


def _location_label(state_code: str | None, district_code: str | None) -> str | None:
    if district_code and state_code:
        return f"{district_code}, {state_code}"
    return district_code or state_code


async def rebuild_entity_summary(
    database: Database,
    *,
    tenant_id: UUID,
    entity_id: UUID,
) -> dict[str, object]:
    entity_row = await database.fetchrow(
        """
        SELECT
            e.id,
            e.canonical_name,
            e.entity_type,
            e.aliases,
            e.description,
            e.external_ids,
            e.risk_score,
            e.risk_inputs,
            e.health_score,
            e.is_resolved,
            e.state_code,
            e.district_code,
            ST_Y(e.geometry) AS lat,
            ST_X(e.geometry) AS lon
        FROM core.entities AS e
        WHERE e.tenant_id = $1 AND e.id = $2
        """,
        tenant_id,
        entity_id,
        tenant_id=tenant_id,
    )
    if entity_row is None:
        raise RuntimeError(f"Entity {entity_id} not found for projection rebuild")

    recent_event_rows = await database.fetch(
        """
        SELECT
            ev.id,
            ev.title,
            ev.event_type,
            ev.severity,
            COALESCE(ev.occurred_at, ev.reported_at, ev.created_at) AS occurred_at
        FROM core.event_entity_links AS eel
        JOIN core.events AS ev ON ev.id = eel.event_id
        WHERE eel.tenant_id = $1 AND eel.entity_id = $2
        ORDER BY COALESCE(ev.occurred_at, ev.reported_at, ev.created_at) DESC
        LIMIT 5
        """,
        tenant_id,
        entity_id,
        tenant_id=tenant_id,
    )
    event_count_row = await database.fetchrow(
        """
        SELECT COUNT(DISTINCT event_id)::INT AS event_count
        FROM core.event_entity_links
        WHERE tenant_id = $1 AND entity_id = $2
        """,
        tenant_id,
        entity_id,
        tenant_id=tenant_id,
    )

    relationship_rows = await database.fetch(
        """
        SELECT
            rel.id,
            rel.relationship_type,
            rel.confidence,
            rel.created_at,
            CASE
                WHEN rel.source_entity_id = $2 THEN target_ent.id
                ELSE source_ent.id
            END AS counterparty_id,
            CASE
                WHEN rel.source_entity_id = $2 THEN target_ent.canonical_name
                ELSE source_ent.canonical_name
            END AS counterparty_name,
            CASE
                WHEN rel.source_entity_id = $2 THEN target_ent.entity_type
                ELSE source_ent.entity_type
            END AS counterparty_type,
            CASE
                WHEN rel.source_entity_id = $2 THEN 'outbound'
                ELSE 'inbound'
            END AS direction
        FROM core.relationships AS rel
        JOIN core.entities AS source_ent ON source_ent.id = rel.source_entity_id
        JOIN core.entities AS target_ent ON target_ent.id = rel.target_entity_id
        WHERE rel.tenant_id = $1 AND (rel.source_entity_id = $2 OR rel.target_entity_id = $2)
        ORDER BY rel.updated_at DESC
        LIMIT 5
        """,
        tenant_id,
        entity_id,
        tenant_id=tenant_id,
    )
    relationship_count_row = await database.fetchrow(
        """
        SELECT COUNT(*)::INT AS relationship_count
        FROM core.relationships
        WHERE tenant_id = $1 AND (source_entity_id = $2 OR target_entity_id = $2)
        """,
        tenant_id,
        entity_id,
        tenant_id=tenant_id,
    )

    claim_count_row = await database.fetchrow(
        """
        SELECT COUNT(*)::INT AS claim_count
        FROM core.claims
        WHERE tenant_id = $1 AND entity_id = $2
        """,
        tenant_id,
        entity_id,
        tenant_id=tenant_id,
    )

    corp_watch_row = await database.fetchrow(
        """
        SELECT
            incorporation_date,
            registered_office,
            authorized_capital_inr,
            paid_up_capital_inr,
            company_status,
            company_class,
            listing_status,
            sector,
            filing_completeness,
            last_filing_date,
            directors,
            shareholders,
            compliance_breach_count
        FROM corp_watch.entity_profiles
        WHERE entity_id = $1
        """,
        entity_id,
    )

    summary: dict[str, object] = {
        "entity_id": str(entity_row["id"]),
        "canonical_name": entity_row["canonical_name"],
        "entity_type": entity_row["entity_type"],
        "aliases": list(entity_row["aliases"] or []),
        "description": entity_row["description"],
        "location": {
            "lat": entity_row["lat"],
            "lon": entity_row["lon"],
            "state_code": entity_row["state_code"],
            "district_code": entity_row["district_code"],
            "label": _location_label(entity_row["state_code"], entity_row["district_code"]),
        },
        "external_ids": entity_row["external_ids"],
        "risk_score": entity_row["risk_score"],
        "risk_inputs": entity_row["risk_inputs"],
        "health_score": entity_row["health_score"],
        "is_resolved": entity_row["is_resolved"],
        "event_count": int(event_count_row["event_count"]) if event_count_row is not None else len(recent_event_rows),
        "recent_events": [
            {
                "event_id": str(event_row["id"]),
                "title": event_row["title"],
                "event_type": event_row["event_type"],
                "severity": event_row["severity"],
                "occurred_at": event_row["occurred_at"],
            }
            for event_row in recent_event_rows
        ],
        "relationship_count": int(relationship_count_row["relationship_count"])
        if relationship_count_row is not None
        else len(relationship_rows),
        "key_relationships": [
            {
                "relationship_id": str(relationship_row["id"]),
                "target_entity_id": str(relationship_row["counterparty_id"]),
                "target_name": relationship_row["counterparty_name"],
                "target_type": relationship_row["counterparty_type"],
                "relationship_type": relationship_row["relationship_type"],
                "confidence": float(relationship_row["confidence"]),
                "direction": relationship_row["direction"],
                "created_at": relationship_row["created_at"],
            }
            for relationship_row in relationship_rows
        ],
        "claim_count": int(claim_count_row["claim_count"]) if claim_count_row is not None else 0,
        "corp_watch": None
        if corp_watch_row is None
        else {
            "incorporation_date": corp_watch_row["incorporation_date"],
            "registered_office": corp_watch_row["registered_office"],
            "authorized_capital_inr": corp_watch_row["authorized_capital_inr"],
            "paid_up_capital_inr": corp_watch_row["paid_up_capital_inr"],
            "company_status": corp_watch_row["company_status"],
            "company_class": corp_watch_row["company_class"],
            "listing_status": corp_watch_row["listing_status"],
            "sector": corp_watch_row["sector"],
            "filing_completeness": corp_watch_row["filing_completeness"],
            "last_filing_date": corp_watch_row["last_filing_date"],
            "directors": corp_watch_row["directors"],
            "shareholders": corp_watch_row["shareholders"],
            "compliance_breach_count": corp_watch_row["compliance_breach_count"],
        },
        "updated_at": datetime.now(UTC),
    }

    await database.execute(
        """
        INSERT INTO projections.entity_summaries (
            entity_id,
            tenant_id,
            summary,
            projected_at
        )
        VALUES ($1, $2, $3::jsonb, $4)
        ON CONFLICT (entity_id)
        DO UPDATE SET
            tenant_id = EXCLUDED.tenant_id,
            summary = EXCLUDED.summary,
            projected_at = now()
        """,
        entity_id,
        tenant_id,
        json.dumps(_json_safe(summary)),
        summary["updated_at"],
        tenant_id=tenant_id,
    )
    return {
        "status": "rebuilt",
        "tenant_id": str(tenant_id),
        "entity_id": str(entity_id),
        "canonical_name": entity_row["canonical_name"],
        "summary": summary,
        "updated_at": summary["updated_at"].isoformat(),
    }
