from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from uuid import UUID

from narad.db.session import Database
from narad.services.llm import LLMService

CIN_RE = re.compile(r"\b[A-Z]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}\b")
ISIN_RE = re.compile(r"\b[A-Z]{2}[A-Z0-9]{9}\d\b")
SEBI_REF_RE = re.compile(r"\bSEBI/[A-Z]+/\d+/\d+\b", re.IGNORECASE)
TITLE_CASE_RE = re.compile(r"\b(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b")
COMMON_TITLE_CASE_TERMS = {
    "Press Information Bureau",
    "Government Of India",
    "The Company",
    "Company Limited",
    "Private Limited",
    "Ministry Of",
    "Department Of",
    "Board Of Directors",
    "Annual General Meeting",
    "Financial Year",
    "Stock Exchange",
    "In The",
    "For The",
    "As Per",
    "According To",
}


@dataclass(slots=True)
class ClaimCandidate:
    claim_text: str
    claim_type: str = "factual"
    confidence: float = 0.55
    lineage_hash: str = ""
    entities_mentioned: list[str] = field(default_factory=list)
    event_type_hint: str | None = None


@dataclass(slots=True)
class PersistedClaim:
    claim_id: UUID
    claim_text: str
    confidence: float
    entities_mentioned: list[str] = field(default_factory=list)
    event_type_hint: str | None = None


def _lineage_hash(document_hash: str, claim_text: str) -> str:
    return hashlib.sha256(f"{document_hash}\n{claim_text}".encode()).hexdigest()


def _title_case_mentions(text: str) -> list[str]:
    mentions: list[str] = []
    for match in TITLE_CASE_RE.findall(text):
        normalized = " ".join(match.split())
        if normalized in COMMON_TITLE_CASE_TERMS:
            continue
        if len(normalized) < 5:
            continue
        if normalized.lower().startswith(("the ", "a ", "an ", "in ", "for ", "on ", "as ", "to ", "of ")):
            continue
        if normalized not in mentions:
            mentions.append(normalized)
    return mentions


def _structured_identifiers(text: str) -> list[str]:
    identifiers: list[str] = []
    for pattern in (CIN_RE, ISIN_RE, SEBI_REF_RE):
        for match in pattern.findall(text):
            normalized = match.strip()
            if normalized not in identifiers:
                identifiers.append(normalized)
    return identifiers


def _event_hint_for_source(source_slug: str) -> str | None:
    hints = {
        "bse_rss": "corporate",
        "cwc": "disaster",
        "egazette": "legislative",
        "imd": "weather",
        "india_code": "legislative",
        "nse_rss": "corporate",
        "pib_rss": "political",
        "sebi_rss": "regulatory",
    }
    return hints.get(source_slug)


class ClaimExtractionService:
    def __init__(self, llm_service: LLMService) -> None:
        self._llm_service = llm_service

    async def extract_claims(
        self,
        *,
        document_hash: str,
        title: str,
        body_text: str,
        source_slug: str,
        source_name: str,
    ) -> list[ClaimCandidate]:
        normalized_title = " ".join(title.split())
        normalized_body = " ".join(body_text.split())
        first_sentence = normalized_body.split(". ")[0].strip()
        event_hint = _event_hint_for_source(source_slug)

        claims: list[ClaimCandidate] = []
        if normalized_title:
            claims.append(
                ClaimCandidate(
                    claim_text=normalized_title,
                    confidence=1.0,
                    entities_mentioned=_title_case_mentions(normalized_title),
                    event_type_hint=event_hint,
                )
            )
        if first_sentence and first_sentence != normalized_title:
            claims.append(
                ClaimCandidate(
                    claim_text=first_sentence,
                    confidence=0.9,
                    entities_mentioned=_title_case_mentions(first_sentence),
                    event_type_hint=event_hint,
                )
            )

        identifiers = _structured_identifiers(f"{normalized_title} {normalized_body}")
        for identifier in identifiers:
            claims.append(
                ClaimCandidate(
                    claim_text=f"Structured identifier detected: {identifier}",
                    claim_type="regulatory" if source_slug in {"sebi_rss", "egazette", "india_code"} else "financial",
                    confidence=0.95,
                    entities_mentioned=[identifier],
                    event_type_hint=event_hint,
                )
            )

        llm_claims = await self._llm_service.extract_claims(
            title=normalized_title,
            body_text=normalized_body,
            source_name=source_name,
        )
        for llm_claim in llm_claims:
            claims.append(
                ClaimCandidate(
                    claim_text=str(llm_claim["text"]),
                    confidence=float(llm_claim["confidence"]),
                    entities_mentioned=[str(entity) for entity in llm_claim["entities_mentioned"]],
                    event_type_hint=(
                        str(llm_claim["event_type_hint"])
                        if llm_claim["event_type_hint"] is not None
                        else event_hint
                    ),
                )
            )

        deduped: list[ClaimCandidate] = []
        seen: set[str] = set()
        for claim in claims:
            normalized_text = claim.claim_text.strip()
            if not normalized_text:
                continue
            if normalized_text.casefold() in seen:
                continue
            seen.add(normalized_text.casefold())
            claim.lineage_hash = _lineage_hash(document_hash, normalized_text)
            deduped.append(claim)
        return deduped

    async def persist_claims(
        self,
        database: Database,
        *,
        tenant_id: UUID,
        document_id: UUID,
        event_id: UUID | None,
        claims: list[ClaimCandidate],
    ) -> list[PersistedClaim]:
        persisted: list[PersistedClaim] = []
        for claim in claims:
            row = await database.fetchrow(
                """
                INSERT INTO core.claims (
                    tenant_id,
                    document_id,
                    event_id,
                    claim_text,
                    claim_type,
                    confidence,
                    lineage_hash,
                    extraction_model,
                    extraction_model_version
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'phase-3a')
                ON CONFLICT (tenant_id, lineage_hash)
                DO UPDATE SET
                    event_id = COALESCE(core.claims.event_id, EXCLUDED.event_id),
                    confidence = GREATEST(core.claims.confidence, EXCLUDED.confidence)
                RETURNING id, claim_text, confidence
                """,
                tenant_id,
                document_id,
                event_id,
                claim.claim_text,
                claim.claim_type,
                claim.confidence,
                claim.lineage_hash,
                "gemini" if self._llm_service.configured else "deterministic-fallback",
                tenant_id=tenant_id,
            )
            if row is None:
                continue
            persisted.append(
                PersistedClaim(
                    claim_id=row["id"],
                    claim_text=row["claim_text"],
                    confidence=float(row["confidence"]),
                    entities_mentioned=claim.entities_mentioned,
                    event_type_hint=claim.event_type_hint,
                )
            )
        return persisted
