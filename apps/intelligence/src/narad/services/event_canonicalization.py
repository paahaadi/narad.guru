from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID

from narad.config import Settings
from narad.db.models import SourceRecord
from narad.db.session import Database
from narad.services.entity_resolution import ResolvedEntity
from narad.services.ingestion import StoredDocumentRecord

REGULATORY_EVENT_TYPES = {"regulatory", "legislative", "judicial"}


@dataclass(slots=True)
class EventContext:
    event_id: UUID
    title: str
    summary: str
    event_type: str
    severity: str
    confidence: float
    occurred_at: datetime
    source_count: int
    is_new: bool


def _event_type_for_source(settings: Settings, source: SourceRecord, document: StoredDocumentRecord) -> str:
    mapping = {
        "bse_rss": "corporate",
        "cwc": "disaster",
        "egazette": "legislative",
        "imd": "weather",
        "india_code": "legislative",
        "nse_rss": "corporate",
        "pib_rss": "political",
        "sebi_rss": "regulatory",
    }
    if document.doc_type in {"circular", "order"}:
        return "regulatory"
    if document.doc_type in {"gazette", "bill"}:
        return "legislative"
    if document.doc_type in {"warning", "forecast"}:
        return "weather"
    return mapping.get(source.slug, settings.default_event_type)


def _geometry_from_document(document: StoredDocumentRecord) -> tuple[float, float] | None:
    geometry = document.metadata.get("geometry")
    if isinstance(geometry, str):
        try:
            parsed = json.loads(geometry)
        except json.JSONDecodeError:
            return None
        if not isinstance(parsed, dict):
            return None
        geometry = parsed
    if isinstance(geometry, dict):
        lat = geometry.get("lat")
        lon = geometry.get("lon")
        if lat is not None and lon is not None:
            try:
                return float(lat), float(lon)
            except (TypeError, ValueError):
                return None
    return None


class EventCanonicalizationService:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    async def _find_candidate(
        self,
        database: Database,
        *,
        tenant_id: UUID,
        document: StoredDocumentRecord,
        event_type: str,
        title: str,
        entity_ids: list[UUID],
    ) -> dict[str, object] | None:
        occurred_at = document.published_at or datetime.now(UTC)
        temporal_window = timedelta(hours=self._settings.event_temporal_window_hours)
        window_start = occurred_at - temporal_window
        window_end = occurred_at + temporal_window
        geometry = _geometry_from_document(document)
        radius_meters = None if geometry is None else self._settings.event_spatial_proximity_km * 1000
        lat = None if geometry is None else geometry[0]
        lon = None if geometry is None else geometry[1]
        row = await database.fetchrow(
            """
            SELECT
                e.id,
                e.title,
                COALESCE(e.summary, '') AS summary,
                e.severity,
                e.confidence,
                COALESCE(e.occurred_at, e.created_at) AS occurred_at,
                e.source_count,
                similarity(e.title, $5) AS title_similarity,
                CASE
                    WHEN cardinality($6::uuid[]) = 0 THEN TRUE
                    ELSE EXISTS (
                        SELECT 1
                        FROM core.event_entity_links AS eel
                        WHERE eel.tenant_id = $1
                          AND eel.event_id = e.id
                          AND eel.entity_id = ANY($6::uuid[])
                    )
                END AS entity_overlap
            FROM core.events AS e
            WHERE e.tenant_id = $1
              AND e.event_type = $2
              AND COALESCE(e.occurred_at, e.created_at)
                    BETWEEN $3 AND $4
              AND e.status != 'invalidated'
              AND (
                    $7::double precision IS NULL
                    OR e.geometry IS NULL
                    OR ST_DWithin(
                        e.geometry::geography,
                        ST_SetSRID(ST_MakePoint($8, $9), 4326)::geography,
                        $7
                    )
              )
            ORDER BY entity_overlap DESC, title_similarity DESC, COALESCE(e.occurred_at, e.created_at) DESC
            LIMIT 1
            """,
            tenant_id,
            event_type,
            window_start,
            window_end,
            title,
            entity_ids,
            radius_meters,
            lon,
            lat,
            tenant_id=tenant_id,
        )
        if row is None:
            return None
        if float(row["title_similarity"]) < self._settings.event_title_similarity_threshold:
            return None
        if not bool(row["entity_overlap"]) and entity_ids:
            return None
        return dict(row)

    async def _insert_event(
        self,
        database: Database,
        *,
        tenant_id: UUID,
        source: SourceRecord,
        document: StoredDocumentRecord,
        event_type: str,
        summary: str,
    ) -> EventContext:
        geometry = _geometry_from_document(document)
        row = await database.fetchrow(
            """
            INSERT INTO core.events (
                tenant_id,
                event_type,
                title,
                summary,
                severity,
                confidence,
                status,
                geometry,
                occurred_at,
                reported_at,
                source_count,
                primary_source_id,
                metadata
            )
            VALUES (
                $1,
                $2,
                $3,
                $4,
                $5,
                $6,
                'canonicalized',
                CASE
                    WHEN $7::double precision IS NULL OR $8::double precision IS NULL THEN NULL
                    ELSE ST_SetSRID(ST_MakePoint($8, $7), 4326)
                END,
                $9,
                now(),
                1,
                $10,
                $11::jsonb
            )
            RETURNING
                id,
                title,
                summary,
                event_type,
                severity,
                confidence,
                COALESCE(occurred_at, created_at) AS occurred_at,
                source_count
            """,
            tenant_id,
            event_type,
            document.title,
            summary,
            self._settings.default_event_severity,
            self._settings.default_event_confidence,
            None if geometry is None else geometry[0],
            None if geometry is None else geometry[1],
            document.published_at,
            source.id,
            json.dumps({"document_id": str(document.document_id), "source_slug": source.slug}),
            tenant_id=tenant_id,
        )
        if row is None:
            raise RuntimeError("Failed to create event")
        await database.execute(
            """
            UPDATE core.events
            SET cluster_id = id
            WHERE tenant_id = $1 AND id = $2
            """,
            tenant_id,
            row["id"],
            tenant_id=tenant_id,
        )
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
            row["id"],
            document.document_id,
            tenant_id=tenant_id,
        )
        return EventContext(
            event_id=row["id"],
            title=row["title"],
            summary=row["summary"],
            event_type=row["event_type"],
            severity=row["severity"],
            confidence=float(row["confidence"]),
            occurred_at=row["occurred_at"],
            source_count=int(row["source_count"]),
            is_new=True,
        )

    async def _update_existing_event(
        self,
        database: Database,
        *,
        tenant_id: UUID,
        event: dict[str, object],
        document: StoredDocumentRecord,
    ) -> EventContext:
        geometry = _geometry_from_document(document)
        await database.execute(
            """
            UPDATE core.events
            SET
                source_count = source_count + 1,
                updated_at = now(),
                geometry = CASE
                    WHEN geometry IS NOT NULL
                      OR $3::double precision IS NULL
                      OR $4::double precision IS NULL THEN geometry
                    ELSE ST_SetSRID(ST_MakePoint($4, $3), 4326)
                END
            WHERE tenant_id = $1 AND id = $2
            """,
            tenant_id,
            event["id"],
            None if geometry is None else geometry[0],
            None if geometry is None else geometry[1],
            tenant_id=tenant_id,
        )
        await database.execute(
            """
            INSERT INTO core.event_document_links (
                tenant_id,
                event_id,
                document_id,
                link_type
            )
            VALUES ($1, $2, $3, 'corroboration')
            ON CONFLICT (tenant_id, event_id, document_id, link_type) DO NOTHING
            """,
            tenant_id,
            event["id"],
            document.document_id,
            tenant_id=tenant_id,
        )
        return EventContext(
            event_id=event["id"],
            title=str(event["title"]),
            summary=str(event["summary"]),
            event_type="",
            severity=str(event["severity"]),
            confidence=float(event["confidence"]),
            occurred_at=event["occurred_at"],
            source_count=int(event["source_count"]) + 1,
            is_new=False,
        )

    async def link_claims_to_event(
        self,
        database: Database,
        *,
        tenant_id: UUID,
        event_id: UUID,
        claim_ids: list[UUID],
    ) -> None:
        if not claim_ids:
            return
        await database.execute(
            """
            UPDATE core.claims
            SET event_id = $3
            WHERE tenant_id = $1
              AND id = ANY($2::uuid[])
            """,
            tenant_id,
            claim_ids,
            event_id,
            tenant_id=tenant_id,
        )

    async def canonicalize_document(
        self,
        database: Database,
        *,
        tenant_id: UUID,
        source: SourceRecord,
        document: StoredDocumentRecord,
        entities: list[ResolvedEntity],
    ) -> EventContext:
        summary = document.translated_text[: self._settings.pulseboard_max_summary_chars].strip() or document.title
        event_type = _event_type_for_source(self._settings, source, document)
        entity_ids = [entity.entity_id for entity in entities]
        candidate = await self._find_candidate(
            database,
            tenant_id=tenant_id,
            document=document,
            event_type=event_type,
            title=document.title,
            entity_ids=entity_ids,
        )
        if candidate is not None:
            context = await self._update_existing_event(
                database,
                tenant_id=tenant_id,
                event=candidate,
                document=document,
            )
            return EventContext(
                event_id=context.event_id,
                title=context.title,
                summary=context.summary,
                event_type=event_type,
                severity=context.severity,
                confidence=context.confidence,
                occurred_at=context.occurred_at,
                source_count=context.source_count,
                is_new=False,
            )
        return await self._insert_event(
            database,
            tenant_id=tenant_id,
            source=source,
            document=document,
            event_type=event_type,
            summary=summary,
        )
