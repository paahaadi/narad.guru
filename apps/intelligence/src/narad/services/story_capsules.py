from __future__ import annotations

import json
from dataclasses import dataclass
from uuid import UUID

from narad.db.session import Database
from narad.services.llm import LLMService, StoryCapsuleDraft


@dataclass(slots=True)
class StoryCapsuleResult:
    capsule_id: UUID
    event_id: UUID
    headline: str
    explanation: str
    ai_model: str
    confidence: float


class StoryCapsuleService:
    def __init__(self, llm_service: LLMService) -> None:
        self._llm_service = llm_service

    async def _draft(
        self,
        *,
        title: str,
        summary: str,
        evidence_urls: list[str],
        key_facts: list[str] | None = None,
    ) -> StoryCapsuleDraft:
        return await self._llm_service.build_story_capsule(
            title=title[:120],
            summary=summary,
            evidence_urls=evidence_urls,
            key_facts=key_facts,
        )

    async def upsert(
        self,
        database: Database,
        *,
        tenant_id: UUID,
        event_id: UUID,
        title: str,
        summary: str,
        evidence_urls: list[str],
        force_refresh: bool = False,
    ) -> StoryCapsuleResult:
        existing = await database.fetchrow(
            """
            SELECT id, headline, explanation, ai_model, confidence
            FROM core.story_capsules
            WHERE tenant_id = $1 AND event_id = $2
            ORDER BY created_at DESC
            LIMIT 1
            """,
            tenant_id,
            event_id,
            tenant_id=tenant_id,
        )
        if existing is not None and not force_refresh:
            await database.execute(
                """
                UPDATE core.events
                SET story_capsule_id = $3
                WHERE tenant_id = $1 AND id = $2
                """,
                tenant_id,
                event_id,
                existing["id"],
                tenant_id=tenant_id,
            )
            return StoryCapsuleResult(
                capsule_id=existing["id"],
                event_id=event_id,
                headline=existing["headline"],
                explanation=existing["explanation"],
                ai_model=existing["ai_model"],
                confidence=float(existing["confidence"]),
            )

        draft = await self._draft(
            title=title,
            summary=summary,
            evidence_urls=evidence_urls,
            key_facts=[summary[:160] if summary else title],
        )

        if existing is None:
            row = await database.fetchrow(
                """
                INSERT INTO core.story_capsules (
                    tenant_id,
                    event_id,
                    headline,
                    explanation,
                    key_facts,
                    evidence_bundle,
                    ai_model,
                    ai_model_version,
                    prompt_hash,
                    confidence,
                    generated_at
                )
                VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9, $10, now())
                RETURNING id
                """,
                tenant_id,
                event_id,
                draft.headline,
                draft.explanation,
                json.dumps(draft.key_facts),
                json.dumps(draft.evidence_bundle),
                draft.ai_model,
                draft.ai_model_version,
                f"story-capsule:{event_id}",
                draft.confidence,
                tenant_id=tenant_id,
            )
            if row is None:
                raise RuntimeError("Failed to create story capsule")
            capsule_id = row["id"]
        else:
            capsule_id = existing["id"]
            await database.execute(
                """
                UPDATE core.story_capsules
                SET
                    headline = $3,
                    explanation = $4,
                    key_facts = $5::jsonb,
                    evidence_bundle = $6::jsonb,
                    ai_model = $7,
                    ai_model_version = $8,
                    confidence = $9,
                    generated_at = now()
                WHERE tenant_id = $1 AND id = $2
                """,
                tenant_id,
                capsule_id,
                draft.headline,
                draft.explanation,
                json.dumps(draft.key_facts),
                json.dumps(draft.evidence_bundle),
                draft.ai_model,
                draft.ai_model_version,
                draft.confidence,
                tenant_id=tenant_id,
            )

        await database.execute(
            """
            UPDATE core.events
            SET story_capsule_id = $3
            WHERE tenant_id = $1 AND id = $2
            """,
            tenant_id,
            event_id,
            capsule_id,
            tenant_id=tenant_id,
        )
        return StoryCapsuleResult(
            capsule_id=capsule_id,
            event_id=event_id,
            headline=draft.headline,
            explanation=draft.explanation,
            ai_model=draft.ai_model,
            confidence=draft.confidence,
        )
