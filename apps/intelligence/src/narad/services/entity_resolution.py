from __future__ import annotations

import json
import re
from collections.abc import Mapping
from dataclasses import dataclass, field
from json import JSONDecodeError
from typing import Any
from uuid import UUID

from narad.config import Settings
from narad.db.models import SourceRecord
from narad.db.session import Database
from narad.services.claim_extraction import PersistedClaim
from narad.services.llm import LLMService

CIN_RE = re.compile(r"\b[A-Z]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}\b")
ISIN_RE = re.compile(r"\b[A-Z]{2}[A-Z0-9]{9}\d\b")
TITLE_CASE_RE = re.compile(r"\b(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b")


@dataclass(slots=True)
class EntityMention:
    name: str
    entity_type: str
    role: str
    confidence: float
    external_ids: dict[str, str] = field(default_factory=dict)


@dataclass(slots=True)
class ResolvedEntity:
    entity_id: UUID
    canonical_name: str
    entity_type: str
    role: str
    confidence: float
    external_ids: dict[str, str] = field(default_factory=dict)


def _jsonb_merge(base: dict[str, str], incoming: dict[str, str]) -> dict[str, str]:
    merged = dict(base)
    merged.update({key: value for key, value in incoming.items() if value})
    return merged


def _normalize_external_ids(value: object) -> dict[str, str]:
    if value is None:
        return {}
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except JSONDecodeError:
            return {}
        return _normalize_external_ids(parsed)
    if isinstance(value, Mapping):
        normalized: dict[str, str] = {}
        for key, item in value.items():
            key_str = str(key).strip()
            value_str = str(item).strip()
            if key_str and value_str:
                normalized[key_str] = value_str
        return normalized
    return {}


def _normalize_entity_row(row: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(row)
    normalized["external_ids"] = _normalize_external_ids(normalized.get("external_ids"))
    return normalized


def _normalized_name(value: str) -> str:
    return " ".join(value.split()).strip()


def _title_case_mentions(text: str) -> list[str]:
    mentions: list[str] = []
    for match in TITLE_CASE_RE.findall(text):
        normalized = _normalized_name(match)
        if normalized and normalized not in mentions:
            mentions.append(normalized)
    return mentions


class EntityResolutionService:
    def __init__(self, settings: Settings, llm_service: LLMService | None = None) -> None:
        self._settings = settings
        self._llm_service = llm_service

    def _source_regulator(self, source: SourceRecord) -> str | None:
        names = {
            "bse_rss": "Bombay Stock Exchange",
            "nse_rss": "National Stock Exchange",
            "pib_rss": "Press Information Bureau",
            "sebi_rss": "Securities and Exchange Board of India",
        }
        return names.get(source.slug)

    def _classify_entity_type(self, source: SourceRecord, candidate: str) -> str:
        lowered = candidate.lower()
        if CIN_RE.fullmatch(candidate) or ISIN_RE.fullmatch(candidate):
            return "company"
        if "ministry" in lowered or "department" in lowered:
            return "ministry"
        if any(term in lowered for term in ("board", "exchange", "authority", "commission", "tribunal")):
            return "regulator"
        if any(term in lowered for term in ("limited", "ltd", "bank", "industries", "company", "corp", "corporation")):
            return "company"
        if source.slug in {"bse_rss", "nse_rss"}:
            return "company"
        return "organization"

    def _classify_role(self, entity_type: str, source: SourceRecord, candidate: str) -> str:
        if entity_type in {"ministry", "regulator"} and candidate == self._source_regulator(source):
            return "regulator"
        if entity_type == "company":
            return "target"
        return "mentioned"

    async def _extract_mentions(self, source: SourceRecord, claims: list[PersistedClaim]) -> list[EntityMention]:
        mentions: list[EntityMention] = []
        if regulator := self._source_regulator(source):
            mentions.append(
                EntityMention(
                    name=regulator,
                    entity_type="regulator" if "Exchange" in regulator or "Board" in regulator else "ministry",
                    role="regulator",
                    confidence=0.95,
                )
            )

        use_llm = self._llm_service and self._llm_service.configured and source.trust_tier in {1, 2}
        if use_llm and self._llm_service is not None:
            for claim in claims:
                llm_entities = await self._llm_service.extract_entities(claim.claim_text)
                for le in llm_entities:
                    name = str(le.get("name", ""))
                    if not name:
                        continue
                    external_ids = le.get("external_ids", {})
                    if not isinstance(external_ids, dict):
                        external_ids = {}
                    
                    llm_type = str(le.get("entity_type", ""))
                    if llm_type in {"company", "regulator", "person", "ministry", "location"}:
                        entity_type = llm_type
                    else:
                        entity_type = self._classify_entity_type(source, name)
                    
                    mentions.append(
                        EntityMention(
                            name=name,
                            entity_type=entity_type,
                            role=self._classify_role(entity_type, source, name),
                            confidence=claim.confidence,
                            external_ids={str(k): str(v) for k, v in external_ids.items() if str(k) and str(v)},
                        )
                    )

        for claim in claims:
            candidates = list(claim.entities_mentioned)
            candidates.extend(_title_case_mentions(claim.claim_text))
            for candidate in candidates:
                normalized = _normalized_name(candidate)
                if not normalized:
                    continue
                external_ids: dict[str, str] = {}
                if CIN_RE.fullmatch(normalized):
                    external_ids["cin"] = normalized
                if ISIN_RE.fullmatch(normalized):
                    external_ids["isin"] = normalized
                entity_type = self._classify_entity_type(source, normalized)
                mentions.append(
                    EntityMention(
                        name=normalized,
                        entity_type=entity_type,
                        role=self._classify_role(entity_type, source, normalized),
                        confidence=claim.confidence,
                        external_ids=external_ids,
                    )
                )

        deduped: list[EntityMention] = []
        seen: set[tuple[str, str]] = set()
        for mention in mentions:
            key = (mention.name.casefold(), mention.entity_type)
            if key in seen:
                continue
            seen.add(key)
            deduped.append(mention)
        return deduped

    async def _find_by_external_ids(
        self,
        database: Database,
        *,
        tenant_id: UUID,
        mention: EntityMention,
    ) -> dict[str, Any] | None:
        if not mention.external_ids:
            return None
        row = await database.fetchrow(
            """
            SELECT id, canonical_name, entity_type, aliases, external_ids
            FROM core.entities
            WHERE tenant_id = $1
              AND entity_type = $2
              AND external_ids @> $3::jsonb
            LIMIT 1
            """,
            tenant_id,
            mention.entity_type,
            json.dumps(mention.external_ids),
            tenant_id=tenant_id,
        )
        return None if row is None else _normalize_entity_row(dict(row))

    async def _find_exact_name(
        self,
        database: Database,
        *,
        tenant_id: UUID,
        mention: EntityMention,
    ) -> dict[str, Any] | None:
        row = await database.fetchrow(
            """
            SELECT id, canonical_name, entity_type, aliases, external_ids
            FROM core.entities
            WHERE tenant_id = $1
              AND entity_type = $2
              AND (
                lower(canonical_name) = lower($3)
                OR EXISTS (
                  SELECT 1
                  FROM unnest(aliases) AS alias
                  WHERE lower(alias) = lower($3)
                )
              )
            LIMIT 1
            """,
            tenant_id,
            mention.entity_type,
            mention.name,
            tenant_id=tenant_id,
        )
        return None if row is None else _normalize_entity_row(dict(row))

    async def _find_fuzzy_match(
        self,
        database: Database,
        *,
        tenant_id: UUID,
        mention: EntityMention,
    ) -> tuple[dict[str, Any], float] | None:
        row = await database.fetchrow(
            """
            SELECT
                id,
                canonical_name,
                entity_type,
                aliases,
                external_ids,
                GREATEST(
                    similarity(canonical_name, $3),
                    COALESCE((
                        SELECT MAX(similarity(alias, $3))
                        FROM unnest(aliases) AS alias
                    ), 0)
                ) AS score
            FROM core.entities
            WHERE tenant_id = $1
              AND entity_type = $2
              AND (
                similarity(canonical_name, $3) >= $4
                OR EXISTS (
                  SELECT 1
                  FROM unnest(aliases) AS alias
                  WHERE similarity(alias, $3) >= $4
                )
              )
            ORDER BY score DESC, updated_at DESC
            LIMIT 1
            """,
            tenant_id,
            mention.entity_type,
            mention.name,
            self._settings.entity_trgm_threshold,
            tenant_id=tenant_id,
        )
        if row is None:
            return None
        return _normalize_entity_row(dict(row)), float(row["score"])

    async def _update_existing_entity(
        self,
        database: Database,
        *,
        tenant_id: UUID,
        entity: dict[str, Any],
        mention: EntityMention,
        confidence: float,
    ) -> ResolvedEntity:
        aliases = {str(alias) for alias in entity.get("aliases") or [] if str(alias).strip()}
        if mention.name.casefold() != str(entity["canonical_name"]).casefold():
            aliases.add(mention.name)
        external_ids = _jsonb_merge(_normalize_external_ids(entity.get("external_ids")), mention.external_ids)
        await database.execute(
            """
            UPDATE core.entities
            SET
                aliases = $3,
                external_ids = $4::jsonb,
                is_resolved = TRUE,
                resolved_at = now(),
                last_resolved_at = now(),
                resolution_confidence = $5
            WHERE tenant_id = $1 AND id = $2
            """,
            tenant_id,
            entity["id"],
            sorted(aliases),
            json.dumps(external_ids),
            confidence,
            tenant_id=tenant_id,
        )
        return ResolvedEntity(
            entity_id=entity["id"],
            canonical_name=str(entity["canonical_name"]),
            entity_type=str(entity["entity_type"]),
            role=mention.role,
            confidence=confidence,
            external_ids=external_ids,
        )

    async def _create_entity(
        self,
        database: Database,
        *,
        tenant_id: UUID,
        mention: EntityMention,
    ) -> ResolvedEntity:
        row = await database.fetchrow(
            """
            INSERT INTO core.entities (
                tenant_id,
                entity_type,
                canonical_name,
                external_ids,
                is_resolved,
                resolved_at,
                last_resolved_at,
                resolution_confidence,
                metadata
            )
            VALUES ($1, $2, $3, $4::jsonb, TRUE, now(), now(), $5, $6::jsonb)
            RETURNING id, canonical_name, entity_type
            """,
            tenant_id,
            mention.entity_type,
            mention.name,
            json.dumps(mention.external_ids),
            mention.confidence,
            json.dumps({"created_by": "phase-3a"}),
            tenant_id=tenant_id,
        )
        if row is None:
            raise RuntimeError("Failed to create entity")
        return ResolvedEntity(
            entity_id=row["id"],
            canonical_name=row["canonical_name"],
            entity_type=row["entity_type"],
            role=mention.role,
            confidence=mention.confidence,
            external_ids=dict(mention.external_ids),
        )

    async def resolve_entities(
        self,
        database: Database,
        *,
        tenant_id: UUID,
        source: SourceRecord,
        claims: list[PersistedClaim],
    ) -> list[ResolvedEntity]:
        mentions = await self._extract_mentions(source, claims)
        resolved: list[ResolvedEntity] = []
        for mention in mentions:
            entity_row = await self._find_by_external_ids(database, tenant_id=tenant_id, mention=mention)
            if entity_row is not None:
                resolved.append(
                    await self._update_existing_entity(
                        database,
                        tenant_id=tenant_id,
                        entity=entity_row,
                        mention=mention,
                        confidence=1.0,
                    )
                )
                continue

            entity_row = await self._find_exact_name(database, tenant_id=tenant_id, mention=mention)
            if entity_row is not None:
                resolved.append(
                    await self._update_existing_entity(
                        database,
                        tenant_id=tenant_id,
                        entity=entity_row,
                        mention=mention,
                        confidence=max(mention.confidence, 0.95),
                    )
                )
                continue

            fuzzy_match = await self._find_fuzzy_match(database, tenant_id=tenant_id, mention=mention)
            if fuzzy_match is not None:
                entity_row, score = fuzzy_match
                if score >= self._settings.entity_auto_merge_threshold:
                    resolved.append(
                        await self._update_existing_entity(
                            database,
                            tenant_id=tenant_id,
                            entity=entity_row,
                            mention=mention,
                            confidence=score,
                        )
                    )
                    continue

            resolved.append(await self._create_entity(database, tenant_id=tenant_id, mention=mention))
        return resolved

    async def attach_claim_entities(
        self,
        database: Database,
        *,
        tenant_id: UUID,
        claims: list[PersistedClaim],
        entities: list[ResolvedEntity],
    ) -> None:
        entity_map = {entity.canonical_name.casefold(): entity for entity in entities}
        fallback_entity = entities[0] if entities else None
        for claim in claims:
            matched_entity: ResolvedEntity | None = None
            for mention in claim.entities_mentioned:
                matched_entity = entity_map.get(mention.casefold())
                if matched_entity is not None:
                    break
            if matched_entity is None:
                matched_entity = fallback_entity
            if matched_entity is None:
                continue
            await database.execute(
                """
                UPDATE core.claims
                SET entity_id = $3
                WHERE tenant_id = $1 AND id = $2
                """,
                tenant_id,
                claim.claim_id,
                matched_entity.entity_id,
                tenant_id=tenant_id,
            )

    async def link_entities_to_event(
        self,
        database: Database,
        *,
        tenant_id: UUID,
        event_id: UUID,
        entities: list[ResolvedEntity],
    ) -> None:
        for entity in entities:
            await database.execute(
                """
                INSERT INTO core.event_entity_links (
                    tenant_id,
                    event_id,
                    entity_id,
                    role,
                    confidence
                )
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (tenant_id, event_id, entity_id, role)
                DO UPDATE SET confidence = GREATEST(core.event_entity_links.confidence, EXCLUDED.confidence)
                """,
                tenant_id,
                event_id,
                entity.entity_id,
                entity.role,
                entity.confidence,
                tenant_id=tenant_id,
            )
