"""
Alert trigger evaluation — Phase 5B
=====================================
Celery periodic task that evaluates active watchlist rules against
recently ingested events and generates alerts when conditions match.

Run frequency: every 5 minutes (configured in celery_app.py beat_schedule).
"""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timedelta, timezone

from narad.config import get_settings
from narad.db.pool import get_db_pool
from narad.workers.celery_app import celery, run_async

logger = logging.getLogger(__name__)


@celery.task(name="narad.alerts.evaluate_alert_triggers")
def evaluate_alert_triggers() -> dict[str, int]:
    """Celery task entry point — wraps the async evaluator."""
    return run_async(_evaluate_triggers())


async def _evaluate_triggers() -> dict[str, int]:
    """Evaluate active watchlist rules against events from the last 10 minutes."""
    settings = get_settings()
    pool = await get_db_pool(settings.database_direct_url)

    stats = {"rules_evaluated": 0, "alerts_created": 0, "errors": 0}

    try:
        async with pool.acquire() as conn:
            # Fetch active rules with their watchlist context
            rules = await conn.fetch("""
                SELECT
                    r.id AS rule_id,
                    r.watchlist_id,
                    r.rule_name,
                    r.condition,
                    r.severity_override,
                    w.tenant_id
                FROM workflow.watchlist_rules AS r
                JOIN workflow.watchlists AS w ON w.id = r.watchlist_id
                WHERE r.is_active = TRUE AND w.is_active = TRUE
            """)

            if not rules:
                logger.debug("No active watchlist rules to evaluate")
                return stats

            # Fetch recent events (last N minutes based on config)
            cutoff = datetime.now(timezone.utc) - timedelta(minutes=settings.alert_trigger_lookback_minutes)
            recent_events = await conn.fetch("""
                SELECT
                    id, tenant_id, event_type, title, summary,
                    severity, confidence, state_code, district_code,
                    created_at
                FROM core.events
                WHERE created_at >= $1
                ORDER BY created_at DESC
                LIMIT 500
            """, cutoff)

            if not recent_events:
                logger.debug("No recent events to evaluate against rules")
                return stats

            for rule in rules:
                stats["rules_evaluated"] += 1
                try:
                    condition = rule["condition"] if isinstance(rule["condition"], dict) else json.loads(rule["condition"])
                    tenant_id = str(rule["tenant_id"])

                    for event in recent_events:
                        if str(event["tenant_id"]) != tenant_id:
                            continue

                        if _matches_condition(event, condition):
                            # Check if alert already exists for this rule+event combo
                            existing = await conn.fetchval("""
                                SELECT 1 FROM workflow.watchlist_alerts
                                WHERE watchlist_id = $1 AND rule_id = $2
                                  AND triggered_by_event_id = $3
                                LIMIT 1
                            """, rule["watchlist_id"], rule["rule_id"], event["id"])

                            if existing:
                                continue

                            severity = rule["severity_override"] or event["severity"] or "medium"
                            await conn.execute("""
                                INSERT INTO workflow.watchlist_alerts
                                  (tenant_id, watchlist_id, rule_id, triggered_by_event_id,
                                   severity, status, title, summary, metadata)
                                VALUES ($1, $2, $3, $4, $5, 'new', $6, $7, $8)
                            """,
                                rule["tenant_id"],
                                rule["watchlist_id"],
                                rule["rule_id"],
                                event["id"],
                                severity,
                                f"[Alert] {rule['rule_name']}: {event['title'][:120]}",
                                event["summary"][:500] if event["summary"] else event["title"],
                                json.dumps({
                                    "rule_name": rule["rule_name"],
                                    "event_type": event["event_type"],
                                    "matched_condition": condition,
                                }),
                            )
                            stats["alerts_created"] += 1

                except Exception:
                    logger.exception("Error evaluating rule %s", rule["rule_id"])
                    stats["errors"] += 1

    except Exception:
        logger.exception("Alert trigger evaluation failed")
        stats["errors"] += 1
    finally:
        await pool.close()

    logger.info(
        "Alert trigger evaluation complete: %d rules, %d alerts created, %d errors",
        stats["rules_evaluated"], stats["alerts_created"], stats["errors"],
    )
    return stats


def _matches_condition(event: dict, condition: dict) -> bool:
    """
    Evaluate a rule condition against an event.

    Supported condition keys:
      - event_types: list of event type strings (OR match)
      - severity_min: minimum severity level
      - keywords: list of keyword strings (OR match against title+summary)
      - state_codes: list of state codes (OR match)
      - district_codes: list of district codes (OR match)
      - confidence_min: minimum confidence threshold
    """
    # Event type filter
    event_types = condition.get("event_types")
    if event_types and isinstance(event_types, list):
        if event.get("event_type") not in event_types:
            return False

    # Severity filter
    severity_order = {"critical": 4, "high": 3, "medium": 2, "low": 1, "informational": 0}
    severity_min = condition.get("severity_min")
    if severity_min:
        event_sev = severity_order.get(event.get("severity", "medium"), 2)
        min_sev = severity_order.get(severity_min, 0)
        if event_sev < min_sev:
            return False

    # Keyword filter (OR match in title + summary)
    keywords = condition.get("keywords")
    if keywords and isinstance(keywords, list):
        text = f"{event.get('title', '')} {event.get('summary', '')}".lower()
        if not any(kw.lower() in text for kw in keywords if isinstance(kw, str)):
            return False

    # Geographic filters
    state_codes = condition.get("state_codes")
    if state_codes and isinstance(state_codes, list):
        if event.get("state_code") not in state_codes:
            return False

    district_codes = condition.get("district_codes")
    if district_codes and isinstance(district_codes, list):
        if event.get("district_code") not in district_codes:
            return False

    # Confidence threshold
    confidence_min = condition.get("confidence_min")
    if confidence_min is not None:
        if float(event.get("confidence", 0)) < float(confidence_min):
            return False

    return True
