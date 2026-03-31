from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID

from json_logic import jsonLogic

from narad.db.session import Database


async def evaluate_watchlist_rules(
    database: Database,
    *,
    tenant_id: UUID,
    trigger_type: str,  # "event" or "entity"
    trigger_id: UUID,
) -> list[dict[str, object]]:
    """Evaluate all active watchlist rules against a trigger and create alerts."""
    # 1. Load the trigger object
    if trigger_type == "event":
        trigger = await _load_event_context(database, tenant_id, trigger_id)
    else:
        trigger = await _load_entity_context(database, tenant_id, trigger_id)

    if trigger is None:
        return []

    # 2. Fetch all active rules
    rules = await database.fetch(
        """
        SELECT wr.id AS rule_id, wr.watchlist_id, wr.rule_name, wr.condition,
               wr.severity_override, wr.is_active
        FROM workflow.watchlist_rules AS wr
        JOIN workflow.watchlists AS wl ON wl.id = wr.watchlist_id
        WHERE wl.tenant_id = $1 AND wl.is_active = TRUE AND wr.is_active = TRUE
        LIMIT 1000
        """,
        tenant_id,
        tenant_id=tenant_id,
    )

    fired_alerts = []
    for rule in rules:
        condition = rule["condition"]
        if not isinstance(condition, dict):
            continue

        try:
            result = jsonLogic(condition, trigger)
        except Exception:
            continue

        if not result:
            continue

        severity = rule["severity_override"] or trigger.get("severity", "medium")
        title = _format_alert_title(rule["rule_name"], trigger, trigger_type)
        summary = _format_alert_summary(rule["rule_name"], trigger, trigger_type)

        episode_id = await _resolve_episode(
            database,
            tenant_id=tenant_id,
            watchlist_id=rule["watchlist_id"],
            trigger_type=trigger_type,
            trigger_id=trigger_id,
            trigger=trigger,
        )

        alert = await _create_alert(
            database,
            tenant_id=tenant_id,
            watchlist_id=rule["watchlist_id"],
            rule_id=rule["rule_id"],
            severity=severity,
            title=title,
            summary=summary,
            trigger_type=trigger_type,
            trigger_id=trigger_id,
            episode_id=episode_id,
        )
        fired_alerts.append(alert)

    return fired_alerts


async def _load_event_context(database: Database, tenant_id: UUID, event_id: UUID) -> dict[str, object] | None:
    row = await database.fetchrow(
        """
        SELECT e.id, e.event_type, e.severity, e.confidence, e.source_count,
               e.state_code, e.district_code, e.title, e.cluster_id
        FROM core.events AS e
        WHERE e.tenant_id = $1 AND e.id = $2 AND e.status != 'invalidated'
        """,
        tenant_id,
        event_id,
        tenant_id=tenant_id,
    )
    if row is None:
        return None
    return {
        "id": row["id"],
        "event_type": row["event_type"],
        "severity": row["severity"],
        "confidence": float(row["confidence"]) if row["confidence"] is not None else 0.0,
        "source_count": row["source_count"] or 1,
        "state_code": row["state_code"] or "",
        "district_code": row["district_code"] or "",
        "title": row["title"],
        "cluster_id": row.get("cluster_id"),
    }


async def _load_entity_context(database: Database, tenant_id: UUID, entity_id: UUID) -> dict[str, object] | None:
    row = await database.fetchrow(
        """
        SELECT e.id, e.entity_type, e.canonical_name, e.description,
               (e.metadata->>'risk_score')::numeric AS risk_score,
               (e.metadata->>'health_score')::numeric AS health_score,
               (e.metadata->>'sector') AS sector
        FROM core.entities AS e
        WHERE e.tenant_id = $1 AND e.id = $2
        """,
        tenant_id,
        entity_id,
        tenant_id=tenant_id,
    )
    if row is None:
        return None
    return {
        "id": row["id"],
        "entity_type": row["entity_type"] or "unknown",
        "entity_name": row["canonical_name"] or "",
        "risk_score": float(row["risk_score"]) if row["risk_score"] is not None else 0.0,
        "health_score": float(row["health_score"]) if row["health_score"] is not None else 100.0,
        "sector": row["sector"] or "",
    }


def _format_alert_title(rule_name: str, trigger: dict[str, object], trigger_type: str) -> str:
    if trigger_type == "event":
        return f"{rule_name}: {trigger.get('title', 'Event detected')}"
    return f"{rule_name}: {trigger.get('entity_name', 'Entity update')}"


def _format_alert_summary(rule_name: str, trigger: dict[str, object], trigger_type: str) -> str:
    if trigger_type == "event":
        parts = [f"Rule '{rule_name}' triggered by {trigger.get('event_type', 'event')}"]
        if trigger.get("state_code"):
            parts.append(f"in {trigger['state_code']}")
        parts.append(f"[severity={trigger.get('severity', 'medium')}, confidence={trigger.get('confidence', 0):.0%}]")
        return " ".join(parts)
    parts = [f"Rule '{rule_name}' triggered by entity '{trigger.get('entity_name', 'unknown')}'"]
    if trigger.get("sector"):
        parts.append(f"(sector: {trigger['sector']})")
    return " ".join(parts)


async def _resolve_episode(
    database: Database,
    *,
    tenant_id: UUID,
    watchlist_id: UUID,
    trigger_type: str,
    trigger_id: UUID,
    trigger: dict[str, object],
) -> UUID | None:
    """Find or create an episode for related alerts."""
    one_hour_ago = datetime.now(UTC) - timedelta(hours=1)

    # Check for recent alerts on the same watchlist with overlapping triggers
    if trigger_type == "event":
        cluster_id = trigger.get("cluster_id")
        row = await database.fetchrow(
            """
            SELECT episode_id FROM workflow.watchlist_alerts
            WHERE tenant_id = $1
              AND watchlist_id = $2
              AND episode_id IS NOT NULL
              AND created_at > $3
              AND (triggered_by_event_id = $4 OR (
                $5::uuid IS NOT NULL AND triggered_by_event_id IN (
                  SELECT id FROM core.events WHERE cluster_id = $5 AND tenant_id = $1
                )
              ))
            ORDER BY created_at DESC
            LIMIT 1
            """,
            tenant_id,
            watchlist_id,
            one_hour_ago,
            trigger_id,
            cluster_id,
            tenant_id=tenant_id,
        )
    else:
        row = await database.fetchrow(
            """
            SELECT episode_id FROM workflow.watchlist_alerts
            WHERE tenant_id = $1
              AND watchlist_id = $2
              AND episode_id IS NOT NULL
              AND created_at > $3
              AND triggered_by_entity_id = $4
            ORDER BY created_at DESC
            LIMIT 1
            """,
            tenant_id,
            watchlist_id,
            one_hour_ago,
            trigger_id,
            tenant_id=tenant_id,
        )

    if row and row["episode_id"]:
        return row["episode_id"]
    return None  # Will be set to alert's own ID after creation


async def _create_alert(
    database: Database,
    *,
    tenant_id: UUID,
    watchlist_id: UUID,
    rule_id: UUID,
    severity: str,
    title: str,
    summary: str,
    trigger_type: str,
    trigger_id: UUID,
    episode_id: UUID | None,
) -> dict[str, object]:
    """Create a watchlist alert and assign episode."""
    triggered_by_event_id = trigger_id if trigger_type == "event" else None
    triggered_by_entity_id = trigger_id if trigger_type == "entity" else None

    row = await database.fetchrow(
        """
        INSERT INTO workflow.watchlist_alerts (
            tenant_id, watchlist_id, rule_id, severity, status,
            title, summary, triggered_by_event_id, triggered_by_entity_id, episode_id
        ) VALUES ($1, $2, $3, $4, 'new', $5, $6, $7, $8, $9)
        RETURNING id, created_at
        """,
        tenant_id,
        watchlist_id,
        rule_id,
        severity,
        title,
        summary,
        triggered_by_event_id,
        triggered_by_entity_id,
        episode_id,
        tenant_id=tenant_id,
    )

    alert_id = row["id"]

    # If no episode was found, this alert starts a new episode (episode_id = its own id)
    if episode_id is None:
        await database.execute(
            """
            UPDATE workflow.watchlist_alerts SET episode_id = $1
            WHERE tenant_id = $2 AND id = $1
            """,
            alert_id,
            tenant_id,
            tenant_id=tenant_id,
        )

    return {
        "alert_id": alert_id,
        "tenant_id": tenant_id,
        "watchlist_id": watchlist_id,
        "rule_id": rule_id,
        "severity": severity,
        "title": title,
        "episode_id": episode_id or alert_id,
        "created_at": row["created_at"],
    }
