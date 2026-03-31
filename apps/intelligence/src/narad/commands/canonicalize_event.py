from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

from narad.db.session import Database


@dataclass(slots=True)
class EventContext:
    event_id: UUID
    title: str
    summary: str
    severity: str
    confidence: float
    occurred_at: datetime


async def ensure_event_for_document(
    database: Database,
    *,
    tenant_id: UUID,
    source_id: UUID,
    document_id: UUID,
    title: str,
    summary: str,
    event_type: str,
    severity: str,
    confidence: float,
    occurred_at: datetime | None,
) -> EventContext:
    existing = await database.fetchrow(
        """
        SELECT
            e.id,
            e.title,
            COALESCE(e.summary, '') AS summary,
            e.severity,
            e.confidence,
            COALESCE(e.occurred_at, e.created_at) AS occurred_at
        FROM core.event_document_links AS edl
        JOIN core.events AS e ON e.id = edl.event_id
        WHERE edl.tenant_id = $1
          AND edl.document_id = $2
          AND edl.link_type = 'primary_source'
        LIMIT 1
        """,
        tenant_id,
        document_id,
        tenant_id=tenant_id,
    )
    if existing is not None:
        return EventContext(
            event_id=existing["id"],
            title=existing["title"],
            summary=existing["summary"],
            severity=existing["severity"],
            confidence=float(existing["confidence"]),
            occurred_at=existing["occurred_at"],
        )

    event_row = await database.fetchrow(
        """
        INSERT INTO core.events (
            tenant_id,
            event_type,
            title,
            summary,
            severity,
            confidence,
            status,
            occurred_at,
            reported_at,
            source_count,
            primary_source_id,
            metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'canonicalized', $7, $8, 1, $9, $10::jsonb)
        RETURNING id, title, summary, severity, confidence, COALESCE(occurred_at, created_at) AS occurred_at
        """,
        tenant_id,
        event_type,
        title,
        summary,
        severity,
        confidence,
        occurred_at,
        datetime.now(UTC),
        source_id,
        "{}",
        tenant_id=tenant_id,
    )
    if event_row is None:
        raise RuntimeError("Failed to create canonical event")

    await database.execute(
        """
        INSERT INTO core.event_document_links (
            tenant_id,
            event_id,
            document_id,
            link_type
        )
        VALUES ($1, $2, $3, 'primary_source')
        ON CONFLICT (tenant_id, event_id, document_id, link_type) DO NOTHING
        """,
        tenant_id,
        event_row["id"],
        document_id,
        tenant_id=tenant_id,
    )

    return EventContext(
        event_id=event_row["id"],
        title=event_row["title"],
        summary=event_row["summary"],
        severity=event_row["severity"],
        confidence=float(event_row["confidence"]),
        occurred_at=event_row["occurred_at"],
    )
