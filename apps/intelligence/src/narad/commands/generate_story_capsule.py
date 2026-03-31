from __future__ import annotations

from uuid import UUID

from narad.db.session import Database
from narad.services.story_capsules import StoryCapsuleService


async def upsert_story_capsule(
    database: Database,
    story_capsule_service: StoryCapsuleService,
    *,
    tenant_id: UUID,
    event_id: UUID,
    title: str,
    summary: str,
    evidence_urls: list[str],
    force_refresh: bool = False,
) -> UUID:
    result = await story_capsule_service.upsert(
        database,
        tenant_id=tenant_id,
        event_id=event_id,
        title=title,
        summary=summary,
        evidence_urls=evidence_urls,
        force_refresh=force_refresh,
    )
    return result.capsule_id
