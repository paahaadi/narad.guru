from __future__ import annotations

import asyncio
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from narad.config import Settings
from narad.db.session import Database
from narad.dependencies import database_dependency, require_tenant_id, settings_dependency
from narad.services.entity_narratives import EntityNarrativeService

router = APIRouter(tags=["corpwatch"])


@dataclass(slots=True)
class _RateLimiter:
    limit: int
    window_seconds: int
    _timestamps: dict[str, deque[float]] = field(default_factory=lambda: defaultdict(deque))
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    async def check(self, key: str) -> None:
        async with self._lock:
            now = asyncio.get_running_loop().time()
            bucket = self._timestamps[key]
            while bucket and now - bucket[0] >= self.window_seconds:
                bucket.popleft()
            if len(bucket) >= self.limit:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="CorpWatch narrative rate limit exceeded",
                )
            bucket.append(now)


_narrative_rate_limiter = _RateLimiter(limit=30, window_seconds=60)


class NarrativeRequest(BaseModel):
    entity_id: UUID = Field(alias="entityId")
    force_refresh: bool = Field(default=False, alias="forceRefresh")

    model_config = {"populate_by_name": True}


@router.post("/api/corpwatch/narrative")
async def generate_narrative(
    payload: NarrativeRequest,
    tenant_id: Annotated[str, Depends(require_tenant_id)],
    database: Annotated[Database, Depends(database_dependency)],
    settings: Annotated[Settings, Depends(settings_dependency)],
) -> dict[str, object]:
    await _narrative_rate_limiter.check(tenant_id)
    service = EntityNarrativeService(settings)
    try:
        result = await service.generate_entity_narrative(
            database,
            tenant_id=UUID(tenant_id),
            entity_id=payload.entity_id,
            force_refresh=payload.force_refresh,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return {
        "entityId": str(result.entity_id),
        "tenantId": str(result.tenant_id),
        "narrative": result.narrative,
        "confidence": result.confidence,
        "generatedBy": result.generated_by,
        "expiresAt": result.expires_at.isoformat(),
        "cached": result.cached,
    }
