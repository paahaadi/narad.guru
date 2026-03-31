from __future__ import annotations

from uuid import UUID

from narad.db.session import Database
from narad.services.claim_extraction import (
    ClaimCandidate,
    ClaimExtractionService,
    PersistedClaim,
)


async def extract_claim_candidates(
    claim_service: ClaimExtractionService,
    *,
    document_hash: str,
    title: str,
    body_text: str,
    source_slug: str,
    source_name: str,
) -> list[ClaimCandidate]:
    return await claim_service.extract_claims(
        document_hash=document_hash,
        title=title,
        body_text=body_text,
        source_slug=source_slug,
        source_name=source_name,
    )


async def persist_claims(
    database: Database,
    claim_service: ClaimExtractionService,
    *,
    tenant_id: UUID,
    document_id: UUID,
    event_id: UUID | None,
    claims: list[ClaimCandidate],
) -> list[PersistedClaim]:
    return await claim_service.persist_claims(
        database,
        tenant_id=tenant_id,
        document_id=document_id,
        event_id=event_id,
        claims=claims,
    )
