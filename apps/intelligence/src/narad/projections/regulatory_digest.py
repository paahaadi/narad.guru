from __future__ import annotations

import json
from datetime import UTC, datetime
from uuid import UUID

from narad.db.session import Database

REGULATORY_EVENT_TYPES = {"regulatory", "legislative", "judicial"}


def _role_name(role: str | None) -> str:
    if role == "target":
        return "regulated"
    return role or "mentioned"


async def rebuild_regulatory_digest(
    database: Database,
    *,
    tenant_id: UUID,
    event_id: UUID,
) -> dict[str, object]:
    event_row = await database.fetchrow(
        """
        SELECT
            e.id,
            e.title,
            e.event_type,
            e.severity,
            COALESCE(sc.explanation, e.summary, e.title) AS summary,
            e.occurred_at,
            e.created_at,
            lp.ministry,
            lp.regulator,
            lp.gazette_ref,
            lp.act_ref,
            lp.amendment_type,
            lp.effective_date,
            lp.what_changed,
            lp.why_it_matters,
            lp.affected_sectors
        FROM core.events AS e
        LEFT JOIN core.story_capsules AS sc ON sc.event_id = e.id AND sc.tenant_id = e.tenant_id
        LEFT JOIN lex_pulse.regulatory_events AS lp ON lp.event_id = e.id
        WHERE e.tenant_id = $1 AND e.id = $2
        """,
        tenant_id,
        event_id,
        tenant_id=tenant_id,
    )
    if event_row is None:
        raise RuntimeError(f"Event {event_id} not found for regulatory digest rebuild")
    if str(event_row["event_type"]) not in REGULATORY_EVENT_TYPES:
        return {
            "status": "skipped",
            "tenant_id": str(tenant_id),
            "event_id": str(event_id),
            "event_type": event_row["event_type"],
        }

    entity_rows = await database.fetch(
        """
        SELECT
            eel.role,
            ent.id,
            ent.canonical_name,
            ent.entity_type
        FROM core.event_entity_links AS eel
        JOIN core.entities AS ent ON ent.id = eel.entity_id
        WHERE eel.tenant_id = $1 AND eel.event_id = $2
        ORDER BY eel.role, ent.canonical_name
        """,
        tenant_id,
        event_id,
        tenant_id=tenant_id,
    )
    document_rows = await database.fetch(
        """
        SELECT
            edl.document_id,
            edl.link_type,
            d.doc_type,
            COALESCE(d.title, d.external_id, d.doc_type) AS title,
            d.published_at
        FROM core.event_document_links AS edl
        JOIN core.documents AS d ON d.id = edl.document_id
        WHERE edl.tenant_id = $1 AND edl.event_id = $2
        ORDER BY edl.created_at
        """,
        tenant_id,
        event_id,
        tenant_id=tenant_id,
    )
    claim_rows = await database.fetch(
        """
        SELECT
            c.id,
            c.claim_text,
            c.claim_type,
            c.confidence
        FROM core.claims AS c
        WHERE c.tenant_id = $1 AND c.event_id = $2
        ORDER BY c.created_at
        """,
        tenant_id,
        event_id,
        tenant_id=tenant_id,
    )

    regulator_name = event_row["regulator"]
    regulator: dict[str, object] | None = None
    for entity_row in entity_rows:
        if entity_row["role"] == "regulator":
            regulator_name = entity_row["canonical_name"]
            regulator = {
                "entity_id": str(entity_row["id"]),
                "name": entity_row["canonical_name"],
                "entity_type": entity_row["entity_type"],
            }
            break
    if regulator is None and regulator_name:
        regulator = {
            "entity_id": "",
            "name": regulator_name,
            "entity_type": "regulator",
        }

    digest: dict[str, object] = {
        "event_id": str(event_row["id"]),
        "title": event_row["title"],
        "event_type": event_row["event_type"],
        "severity": event_row["severity"],
        "regulator": regulator,
        "affected_entities": [
            {
                "entity_id": str(entity_row["id"]),
                "name": entity_row["canonical_name"],
                "entity_type": entity_row["entity_type"],
                "role": _role_name(entity_row["role"]),
            }
            for entity_row in entity_rows
            if entity_row["role"] != "regulator"
        ],
        "summary": event_row["summary"],
        "key_claims": [
            {
                "claim_id": str(claim_row["id"]),
                "claim_text": claim_row["claim_text"],
                "claim_type": claim_row["claim_type"],
                "confidence": float(claim_row["confidence"]),
            }
            for claim_row in claim_rows
        ],
        "documents": [
            {
                "document_id": str(document_row["document_id"]),
                "link_type": document_row["link_type"],
                "doc_type": document_row["doc_type"],
                "title": document_row["title"],
                "published_at": document_row["published_at"],
            }
            for document_row in document_rows
        ],
        "effective_date": event_row["effective_date"],
        "lex_pulse": {
            "ministry": event_row["ministry"],
            "regulator": event_row["regulator"],
            "gazette_ref": event_row["gazette_ref"],
            "act_ref": event_row["act_ref"],
            "regulatory_event_type": event_row["amendment_type"],
            "effective_date": event_row["effective_date"],
            "what_changed": event_row["what_changed"],
            "why_it_matters": event_row["why_it_matters"],
            "affected_sectors": event_row["affected_sectors"],
        },
        "updated_at": datetime.now(UTC),
    }

    await database.execute(
        """
        INSERT INTO projections.regulatory_digest (
            event_id,
            tenant_id,
            digest,
            effective_date,
            projected_at
        )
        VALUES ($1, $2, $3::jsonb, $4, $5)
        ON CONFLICT (event_id)
        DO UPDATE SET
            tenant_id = EXCLUDED.tenant_id,
            digest = EXCLUDED.digest,
            effective_date = EXCLUDED.effective_date,
            projected_at = now()
        """,
        event_id,
        tenant_id,
        json.dumps(digest, default=str),
        event_row["effective_date"],
        digest["updated_at"],
        tenant_id=tenant_id,
    )
    return {
        "status": "rebuilt",
        "tenant_id": str(tenant_id),
        "event_id": str(event_id),
        "event_type": event_row["event_type"],
        "effective_date": event_row["effective_date"],
        "digest": digest,
        "updated_at": digest["updated_at"].isoformat(),
    }
