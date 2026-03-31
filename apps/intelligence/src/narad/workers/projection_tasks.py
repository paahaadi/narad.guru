from __future__ import annotations

import json
from datetime import UTC, datetime
from uuid import UUID

import redis.asyncio as redis

from narad.config import get_settings
from narad.db.session import Database
from narad.events.publisher import EventPublisher
from narad.events.types import DeltaEnvelope
from narad.projections.entity_summaries import rebuild_entity_summary
from narad.projections.geostrat import upsert_geostrat_projection
from narad.projections.pulseboard import upsert_event_projection
from narad.projections.regulatory_digest import rebuild_regulatory_digest
from narad.projections.sector_forecasts import rebuild_sector_forecasts
from narad.projections.watchlist_deltas import rebuild_watchlist_deltas
from narad.workers.celery_app import celery, run_async


@celery.task(name="narad.projection.rebuild_pulseboard_projection")
def rebuild_pulseboard_projection(event_id: str) -> dict[str, str]:
    return run_async(_rebuild_pulseboard_projection(UUID(event_id)))


@celery.task(name="narad.projection.rebuild_watchlist_delta_projection")
def rebuild_watchlist_delta_projection(alert_id: str, tenant_id: str | None = None) -> dict[str, object]:
    resolved_tenant_id = UUID(tenant_id) if tenant_id else None
    return run_async(_rebuild_watchlist_delta_projection(UUID(alert_id), resolved_tenant_id))


@celery.task(name="narad.projection.rebuild_entity_summary_projection")
def rebuild_entity_summary_projection(entity_id: str, tenant_id: str | None = None) -> dict[str, object]:
    resolved_tenant_id = UUID(tenant_id) if tenant_id else None
    return run_async(_rebuild_entity_summary_projection(UUID(entity_id), resolved_tenant_id))


@celery.task(name="narad.projection.rebuild_regulatory_digest_projection")
def rebuild_regulatory_digest_projection(event_id: str, tenant_id: str | None = None) -> dict[str, object]:
    resolved_tenant_id = UUID(tenant_id) if tenant_id else None
    return run_async(_rebuild_regulatory_digest_projection(UUID(event_id), resolved_tenant_id))


@celery.task(name="narad.projection.rebuild_sector_forecasts")
def rebuild_sector_forecasts_projection(tenant_id: str | None = None) -> dict[str, object]:
    resolved_tenant_id = UUID(tenant_id) if tenant_id else None
    return run_async(_rebuild_sector_forecasts_projection(resolved_tenant_id))


@celery.task(name="narad.projection.rebuild_geostrat_projection")
def rebuild_geostrat_projection(event_id: str, tenant_id: str | None = None) -> dict[str, object]:
    resolved_tenant_id = UUID(tenant_id) if tenant_id else None
    return run_async(_rebuild_geostrat_projection(UUID(event_id), resolved_tenant_id))


def _json_safe(value: object) -> object:
    return json.loads(json.dumps(value, default=str))


async def _resolve_tenant_id(database: Database, tenant_id: UUID | None) -> UUID:
    return tenant_id if tenant_id is not None else await database.resolve_default_tenant_id()


async def _rebuild_pulseboard_projection(event_id: UUID) -> dict[str, str]:
    settings = get_settings()
    database = Database(settings)
    redis_client = redis.from_url(settings.redis_url, decode_responses=False)
    publisher = EventPublisher(redis_client)
    await database.connect()
    try:
        tenant_id = await database.resolve_default_tenant_id()
        card = await upsert_event_projection(database, tenant_id=tenant_id, event_id=event_id)
        await publisher.publish(
            "narad:pulseboard:event",
            DeltaEnvelope(
                channel="narad:pulseboard:event",
                tenant_id=str(tenant_id),
                entity_type="event",
                entity_id=str(event_id),
                changes={"card": card.model_dump(mode="json")},
                timestamp=card.event_timestamp.isoformat(),
            ),
        )
        return {"status": "rebuilt", "event_id": str(event_id)}
    finally:
        await redis_client.aclose()
        await database.disconnect()


async def _rebuild_watchlist_delta_projection(
    alert_id: UUID,
    tenant_id: UUID | None,
) -> dict[str, object]:
    settings = get_settings()
    database = Database(settings)
    redis_client = redis.from_url(settings.redis_url, decode_responses=False)
    publisher = EventPublisher(redis_client)
    await database.connect()
    try:
        resolved_tenant_id = await _resolve_tenant_id(database, tenant_id)
        result = await rebuild_watchlist_deltas(database, tenant_id=resolved_tenant_id, alert_id=alert_id)
        await publisher.publish(
            "narad:watchlist:delta",
            DeltaEnvelope(
                channel="narad:watchlist:delta",
                tenant_id=str(resolved_tenant_id),
                entity_type="watchlist",
                entity_id=str(result["watchlist_id"]),
                changes={
                    "alert_id": str(result["alert_id"]),
                    "watchlist_name": str(result["watchlist_name"]),
                    "delta_type": str(result["delta_type"]),
                    "summary": str(result["summary"]),
                    "reference_id": str(result["reference_id"]),
                    "reference_type": str(result["reference_type"]),
                },
                timestamp=str(result["computed_at"]),
            ),
        )
        return result
    finally:
        await redis_client.aclose()
        await database.disconnect()


async def _rebuild_entity_summary_projection(
    entity_id: UUID,
    tenant_id: UUID | None,
) -> dict[str, object]:
    settings = get_settings()
    database = Database(settings)
    redis_client = redis.from_url(settings.redis_url, decode_responses=False)
    publisher = EventPublisher(redis_client)
    await database.connect()
    try:
        resolved_tenant_id = await _resolve_tenant_id(database, tenant_id)
        result = await rebuild_entity_summary(database, tenant_id=resolved_tenant_id, entity_id=entity_id)
        await publisher.publish(
            "narad:entity:updated",
            DeltaEnvelope(
                channel="narad:entity:updated",
                tenant_id=str(resolved_tenant_id),
                entity_type="entity",
                entity_id=str(result["entity_id"]),
                changes={
                    "canonical_name": str(result["canonical_name"]),
                    "summary": _json_safe(result["summary"]),
                },
                timestamp=str(result["updated_at"]),
            ),
        )
        return result
    finally:
        await redis_client.aclose()
        await database.disconnect()


async def _rebuild_regulatory_digest_projection(
    event_id: UUID,
    tenant_id: UUID | None,
) -> dict[str, object]:
    settings = get_settings()
    database = Database(settings)
    redis_client = redis.from_url(settings.redis_url, decode_responses=False)
    publisher = EventPublisher(redis_client)
    await database.connect()
    try:
        resolved_tenant_id = await _resolve_tenant_id(database, tenant_id)
        result = await rebuild_regulatory_digest(database, tenant_id=resolved_tenant_id, event_id=event_id)
        if result.get("status") == "rebuilt":
            await publisher.publish(
                "narad:regulatory:digest_updated",
                DeltaEnvelope(
                    channel="narad:regulatory:digest_updated",
                    tenant_id=str(resolved_tenant_id),
                    entity_type="regulatory_digest",
                    entity_id=str(result["event_id"]),
                    changes={
                        "event_type": str(result["event_type"]),
                        "effective_date": _json_safe(result.get("effective_date")),
                        "digest": _json_safe(result["digest"]),
                    },
                    timestamp=str(result["updated_at"]),
                ),
            )
        return result
    finally:
        await redis_client.aclose()
        await database.disconnect()


@celery.task(name="narad.projection.evaluate_rules_for_event")
def evaluate_rules_for_event(event_id: str, tenant_id: str | None = None) -> dict[str, object]:
    resolved_tenant_id = UUID(tenant_id) if tenant_id else None
    return run_async(_evaluate_rules_for_event(UUID(event_id), resolved_tenant_id))


@celery.task(name="narad.projection.evaluate_rules_for_entity")
def evaluate_rules_for_entity(entity_id: str, tenant_id: str | None = None) -> dict[str, object]:
    resolved_tenant_id = UUID(tenant_id) if tenant_id else None
    return run_async(_evaluate_rules_for_entity(UUID(entity_id), resolved_tenant_id))


async def _evaluate_rules_for_event(event_id: UUID, tenant_id: UUID | None) -> dict[str, object]:
    settings = get_settings()
    database = Database(settings)
    redis_client = redis.from_url(settings.redis_url, decode_responses=False)
    await database.connect()
    try:
        resolved_tenant_id = await _resolve_tenant_id(database, tenant_id)
        from narad.services.rule_evaluation import evaluate_watchlist_rules

        fired_alerts = await evaluate_watchlist_rules(
            database,
            tenant_id=resolved_tenant_id,
            trigger_type="event",
            trigger_id=event_id,
        )
        for alert in fired_alerts:
            rebuild_watchlist_delta_projection.delay(str(alert["alert_id"]), str(resolved_tenant_id))
        return {"status": "evaluated", "event_id": str(event_id), "alerts_fired": len(fired_alerts)}
    finally:
        await redis_client.aclose()
        await database.disconnect()


async def _evaluate_rules_for_entity(entity_id: UUID, tenant_id: UUID | None) -> dict[str, object]:
    settings = get_settings()
    database = Database(settings)
    redis_client = redis.from_url(settings.redis_url, decode_responses=False)
    await database.connect()
    try:
        resolved_tenant_id = await _resolve_tenant_id(database, tenant_id)
        from narad.services.rule_evaluation import evaluate_watchlist_rules

        fired_alerts = await evaluate_watchlist_rules(
            database,
            tenant_id=resolved_tenant_id,
            trigger_type="entity",
            trigger_id=entity_id,
        )
        for alert in fired_alerts:
            rebuild_watchlist_delta_projection.delay(str(alert["alert_id"]), str(resolved_tenant_id))
        return {"status": "evaluated", "entity_id": str(entity_id), "alerts_fired": len(fired_alerts)}
    finally:
        await redis_client.aclose()
        await database.disconnect()


async def _rebuild_geostrat_projection(event_id: UUID, tenant_id: UUID | None) -> dict[str, object]:
    settings = get_settings()
    database = Database(settings)
    redis_client = redis.from_url(settings.redis_url, decode_responses=False)
    publisher = EventPublisher(redis_client)
    await database.connect()
    try:
        resolved_tenant_id = await _resolve_tenant_id(database, tenant_id)
        result = await upsert_geostrat_projection(database, tenant_id=resolved_tenant_id, event_id=event_id)
        if result:
            # Include longitude/latitude in delta for viewport-aware filtering
            geo_row = await database.fetchrow(
                "SELECT ST_X(geometry) AS lon, ST_Y(geometry) AS lat "
                "FROM projections.geostrat_events WHERE event_id = $1",
                event_id,
                tenant_id=resolved_tenant_id,
            )
            changes = dict(result)
            if geo_row:
                changes["longitude"] = float(geo_row["lon"])
                changes["latitude"] = float(geo_row["lat"])
            await publisher.publish(
                "narad:geostrat:event",
                DeltaEnvelope(
                    channel="narad:geostrat:event",
                    tenant_id=str(resolved_tenant_id),
                    entity_type="event",
                    entity_id=str(event_id),
                    changes=changes,
                    timestamp=datetime.now(UTC).isoformat(),
                ),
            )
        return result or {"status": "removed", "event_id": str(event_id)}
    finally:
        await redis_client.aclose()
        await database.disconnect()


async def _rebuild_sector_forecasts_projection(tenant_id: UUID | None) -> dict[str, object]:
    settings = get_settings()
    database = Database(settings)
    await database.connect()
    try:
        resolved_tenant_id = await _resolve_tenant_id(database, tenant_id)
        return await rebuild_sector_forecasts(
            database,
            tenant_id=resolved_tenant_id,
            settings=settings,
        )
    finally:
        await database.disconnect()
