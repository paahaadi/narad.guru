from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any
from uuid import UUID

from narad.config import Settings
from narad.db.session import Database
from narad.services.llm import LLMService


@dataclass(slots=True)
class EntityNarrativeResult:
    entity_id: UUID
    tenant_id: UUID
    narrative: str
    confidence: float
    generated_by: str
    expires_at: datetime
    cached: bool


class EntityNarrativeService:
    def __init__(self, settings: Settings, llm_service: LLMService | None = None) -> None:
        self._settings = settings
        self._llm_service = llm_service or LLMService(settings)

    async def generate_entity_narrative(
        self,
        database: Database,
        *,
        tenant_id: UUID,
        entity_id: UUID,
        force_refresh: bool = False,
    ) -> EntityNarrativeResult:
        if not force_refresh:
            cached_row = await database.fetchrow(
                """
                SELECT narrative, confidence, generated_by, expires_at
                FROM corp_watch.entity_narratives
                WHERE tenant_id = $1 AND entity_id = $2 AND expires_at > now()
                """,
                tenant_id,
                entity_id,
                tenant_id=tenant_id,
            )
            if cached_row is not None:
                return EntityNarrativeResult(
                    entity_id=entity_id,
                    tenant_id=tenant_id,
                    narrative=str(cached_row["narrative"]),
                    confidence=_as_confidence(cached_row["confidence"]),
                    generated_by=str(cached_row["generated_by"]),
                    expires_at=_as_datetime(cached_row["expires_at"]),
                    cached=True,
                )

        context = await self._load_context(database, tenant_id=tenant_id, entity_id=entity_id)
        if context is None:
            raise RuntimeError(f"Entity {entity_id} not found")

        llm_result = await self._llm_narrative(context)
        if llm_result is None:
            narrative = self._deterministic_narrative(context)
            confidence = 0.58
            generated_by = "deterministic-fallback"
        else:
            narrative = llm_result["narrative"]
            confidence = llm_result["confidence"]
            generated_by = llm_result["generated_by"]

        expires_at = datetime.now(UTC) + timedelta(hours=self._settings.entity_narrative_ttl_hours)
        await database.execute(
            """
            INSERT INTO corp_watch.entity_narratives (
                entity_id,
                tenant_id,
                narrative,
                confidence,
                generated_by,
                expires_at
            )
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (entity_id)
            DO UPDATE SET
                tenant_id = EXCLUDED.tenant_id,
                narrative = EXCLUDED.narrative,
                confidence = EXCLUDED.confidence,
                generated_by = EXCLUDED.generated_by,
                expires_at = EXCLUDED.expires_at,
                updated_at = now()
            """,
            entity_id,
            tenant_id,
            narrative,
            confidence,
            generated_by,
            expires_at,
            tenant_id=tenant_id,
        )
        return EntityNarrativeResult(
            entity_id=entity_id,
            tenant_id=tenant_id,
            narrative=narrative,
            confidence=confidence,
            generated_by=generated_by,
            expires_at=expires_at,
            cached=False,
        )

    async def _load_context(
        self,
        database: Database,
        *,
        tenant_id: UUID,
        entity_id: UUID,
    ) -> dict[str, Any] | None:
        entity_row = await database.fetchrow(
            """
            SELECT
                e.id,
                e.canonical_name,
                e.entity_type,
                e.description,
                e.risk_score,
                e.external_ids,
                cwp.sector,
                cwp.company_status,
                cwp.listing_status,
                cwp.authorized_capital_inr,
                cwp.paid_up_capital_inr,
                cwp.last_filing_date
            FROM core.entities AS e
            LEFT JOIN corp_watch.entity_profiles AS cwp ON cwp.entity_id = e.id
            WHERE e.tenant_id = $1 AND e.id = $2
            """,
            tenant_id,
            entity_id,
            tenant_id=tenant_id,
        )
        if entity_row is None:
            return None

        relationship_rows = await database.fetch(
            """
            SELECT
                rel.relationship_type,
                rel.confidence,
                CASE
                    WHEN rel.source_entity_id = $2 THEN target_ent.canonical_name
                    ELSE source_ent.canonical_name
                END AS counterparty_name,
                CASE
                    WHEN rel.source_entity_id = $2 THEN target_ent.entity_type
                    ELSE source_ent.entity_type
                END AS counterparty_type
            FROM core.relationships AS rel
            JOIN core.entities AS source_ent ON source_ent.id = rel.source_entity_id
            JOIN core.entities AS target_ent ON target_ent.id = rel.target_entity_id
            WHERE rel.tenant_id = $1 AND (rel.source_entity_id = $2 OR rel.target_entity_id = $2)
            ORDER BY rel.confidence DESC, rel.updated_at DESC
            LIMIT 10
            """,
            tenant_id,
            entity_id,
            tenant_id=tenant_id,
        )
        event_rows = await database.fetch(
            """
            SELECT
                ev.title,
                ev.event_type,
                ev.severity,
                COALESCE(ev.occurred_at, ev.created_at) AS occurred_at
            FROM core.event_entity_links AS eel
            JOIN core.events AS ev ON ev.id = eel.event_id
            WHERE eel.tenant_id = $1
              AND eel.entity_id = $2
              AND COALESCE(ev.occurred_at, ev.created_at) >= now() - interval '30 days'
            ORDER BY COALESCE(ev.occurred_at, ev.created_at) DESC
            LIMIT 10
            """,
            tenant_id,
            entity_id,
            tenant_id=tenant_id,
        )
        return {
            "entity": dict(entity_row),
            "relationships": [dict(row) for row in relationship_rows],
            "events": [dict(row) for row in event_rows],
        }

    async def _llm_narrative(self, context: dict[str, Any]) -> dict[str, Any] | None:
        payload = await self._llm_service.generate_json(
            "\n".join(
                [
                    "Generate a 2-3 sentence contextual CorpWatch narrative for an analyst.",
                    "Return JSON with keys: narrative, confidence.",
                    (
                        "Focus on what the entity is, the current risk picture, and why the latest "
                        "linked activity matters."
                    ),
                    f"Entity context: {json.dumps(context, default=str)}",
                ]
            )
        )
        if not isinstance(payload, dict):
            return None

        narrative = str(payload.get("narrative", "")).strip()
        if not narrative:
            return None

        return {
            "narrative": narrative,
            "confidence": _clamp_confidence(payload.get("confidence", 0.78)),
            "generated_by": self._settings.gemini_model if self._llm_service.configured else "deterministic-fallback",
        }

    def _deterministic_narrative(self, context: dict[str, Any]) -> str:
        entity = context["entity"]
        events = context["events"]
        relationships = context["relationships"]

        name = str(entity["canonical_name"])
        entity_type = str(entity["entity_type"])
        sector = _optional_text(entity.get("sector")) or "cross-sector activity"
        status = _optional_text(entity.get("company_status")) or "current corporate status is unclassified"
        risk_score = _optional_decimal(entity.get("risk_score"))

        first_sentence = f"{name} is tracked as a {entity_type} operating in {sector}; {status.lower()}."
        if risk_score is not None:
            first_sentence = (
                f"{name} is tracked as a {entity_type} operating in {sector}, with a current risk score of "
                f"{risk_score:.1f} and {status.lower()}."
            )

        if events:
            latest_event = events[0]
            second_sentence = (
                f"Recent activity includes {latest_event['title']}, showing live exposure through "
                f"{len(events)} entity-linked events in the last 30 days."
            )
        else:
            second_sentence = (
                "No recent event cluster has been linked in the last 30 days, so the entity "
                "view is relying on structural profile data."
            )

        if relationships:
            top_relationships = ", ".join(
                str(relationship["counterparty_name"]) for relationship in relationships[:3]
            )
            third_sentence = (
                f"The relationship graph is anchored by ties to {top_relationships}, which gives "
                "analysts immediate context on exposure pathways."
            )
        else:
            third_sentence = (
                "Relationship coverage is still sparse, so exposure pathways should be treated "
                "as provisional."
            )

        return " ".join((first_sentence, second_sentence, third_sentence))


def _optional_text(value: object) -> str | None:
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def _optional_decimal(value: object) -> float | None:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (float, int)):
        return float(value)
    if isinstance(value, str) and value.strip():
        try:
            return float(value)
        except ValueError:
            return None
    return None


def _clamp_confidence(value: object) -> float:
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return 0.65
    return max(0.0, min(numeric, 1.0))


def _as_confidence(value: object) -> float:
    return _clamp_confidence(value)


def _as_datetime(value: object) -> datetime:
    if isinstance(value, datetime):
        return value
    raise TypeError("expires_at must be a datetime")
