from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from narad.db.session import Database

_STATUS_TO_DELTA_TYPE: dict[str, str] = {
    "new": "alert_fired",
    "triaged": "status_changed",
    "assigned": "status_changed",
    "acknowledged": "status_changed",
    "in_progress": "alert_escalated",
    "resolved": "alert_resolved",
    "suppressed": "status_changed",
}


async def rebuild_watchlist_deltas(
    database: Database,
    *,
    tenant_id: UUID,
    alert_id: UUID,
) -> dict[str, object]:
    row = await database.fetchrow(
        """
        SELECT
            wa.id AS alert_id,
            wa.watchlist_id,
            wa.severity,
            wa.status,
            wa.title,
            wa.summary AS alert_summary,
            wa.triggered_by_event_id,
            wa.triggered_by_entity_id,
            wl.name AS watchlist_name,
            wl.is_active,
            wr.rule_name,
            COALESCE(ev.title, NULL) AS event_title,
            COALESCE(ent.canonical_name, NULL) AS entity_name
        FROM workflow.watchlist_alerts AS wa
        JOIN workflow.watchlists AS wl ON wl.id = wa.watchlist_id
        LEFT JOIN workflow.watchlist_rules AS wr ON wr.id = wa.rule_id
        LEFT JOIN core.events AS ev ON ev.id = wa.triggered_by_event_id
        LEFT JOIN core.entities AS ent ON ent.id = wa.triggered_by_entity_id
        WHERE wa.tenant_id = $1 AND wa.id = $2
        """,
        tenant_id,
        alert_id,
        tenant_id=tenant_id,
    )
    if row is None:
        raise RuntimeError(f"Watchlist alert {alert_id} not found for projection rebuild")

    delta_type = _STATUS_TO_DELTA_TYPE.get(str(row["status"]), "status_changed")
    reference_id = row["triggered_by_event_id"] or row["triggered_by_entity_id"] or row["watchlist_id"]
    reference_type = (
        "event"
        if row["triggered_by_event_id"]
        else "entity"
        if row["triggered_by_entity_id"]
        else "watchlist"
    )
    if delta_type == "alert_fired" and row["rule_name"] and row["event_title"]:
        summary = f"Alert: {row['rule_name']} triggered by event '{row['event_title']}'"
    elif delta_type == "alert_fired" and row["rule_name"] and row["entity_name"]:
        summary = f"Alert: {row['rule_name']} triggered by entity '{row['entity_name']}'"
    elif row["alert_summary"]:
        summary = f'{row["watchlist_name"]}: {row["alert_summary"]}'
    else:
        summary = f'{row["watchlist_name"]}: {row["title"]}'
    summary = f"{summary} [{row['severity']}/{row['status']}]"
    computed_at = datetime.now(UTC)

    await database.execute(
        """
        INSERT INTO projections.watchlist_deltas (
            tenant_id,
            watchlist_id,
            delta_type,
            summary,
            reference_id,
            reference_type,
            computed_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        """,
        tenant_id,
        row["watchlist_id"],
        delta_type,
        summary,
        reference_id,
        reference_type,
        computed_at,
        tenant_id=tenant_id,
    )
    return {
        "status": "rebuilt",
        "tenant_id": str(tenant_id),
        "alert_id": str(alert_id),
        "watchlist_id": str(row["watchlist_id"]),
        "watchlist_name": str(row["watchlist_name"]),
        "delta_type": delta_type,
        "summary": summary,
        "reference_id": str(reference_id),
        "reference_type": reference_type,
        "computed_at": computed_at.isoformat(),
    }
