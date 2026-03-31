from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from narad.db.session import Database


async def upsert_geostrat_projection(
    database: Database,
    *,
    tenant_id: UUID,
    event_id: UUID,
) -> dict[str, object] | None:
    """Rebuild the GeoStrat presentation row for one event."""
    row = await database.fetchrow(
        """
        SELECT
            e.id,
            e.title,
            e.event_type,
            e.severity,
            e.confidence,
            e.source_count,
            COALESCE(e.occurred_at, e.created_at) AS occurred_at,
            e.geometry,
            e.state_code,
            e.district_code,
            sc.cluster_label
        FROM core.events AS e
        LEFT JOIN core.story_capsules AS sc ON sc.id = e.story_capsule_id
        WHERE e.tenant_id = $1
          AND e.id = $2
          AND e.status != 'invalidated'
          AND e.geometry IS NOT NULL
        """,
        tenant_id,
        event_id,
        tenant_id=tenant_id,
    )

    if row is None:
        # Event is invalidated or has no geometry — remove from projection
        await database.execute(
            "DELETE FROM projections.geostrat_events WHERE event_id = $1",
            event_id,
            tenant_id=tenant_id,
        )
        return None

    await database.execute(
        """
        INSERT INTO projections.geostrat_events (
            event_id, tenant_id, title, event_type, severity, confidence,
            source_count, occurred_at, geometry, state_code, district_code,
            cluster_label, projected_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (event_id) DO UPDATE SET
            title = EXCLUDED.title,
            event_type = EXCLUDED.event_type,
            severity = EXCLUDED.severity,
            confidence = EXCLUDED.confidence,
            source_count = EXCLUDED.source_count,
            occurred_at = EXCLUDED.occurred_at,
            geometry = EXCLUDED.geometry,
            state_code = EXCLUDED.state_code,
            district_code = EXCLUDED.district_code,
            cluster_label = EXCLUDED.cluster_label,
            projected_at = EXCLUDED.projected_at
        """,
        event_id,
        tenant_id,
        row["title"],
        row["event_type"],
        row["severity"],
        row["confidence"],
        row["source_count"] or 1,
        row["occurred_at"],
        row["geometry"],
        row["state_code"],
        row["district_code"],
        row["cluster_label"],
        datetime.now(UTC),
        tenant_id=tenant_id,
    )

    return {
        "status": "projected",
        "event_id": str(event_id),
        "tenant_id": str(tenant_id),
        "event_type": row["event_type"],
        "severity": row["severity"],
    }
