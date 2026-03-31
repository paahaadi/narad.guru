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
from narad.services.rag_query import RagQueryService

router = APIRouter(tags=["lexpulse"])


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
                    detail="LexPulse query rate limit exceeded",
                )
            bucket.append(now)


_query_rate_limiter = _RateLimiter(limit=50, window_seconds=60)


class QueryRequest(BaseModel):
    query_text: str = Field(alias="queryText")
    force_refresh: bool = Field(default=False, alias="forceRefresh")

    model_config = {"populate_by_name": True}


@router.post("/api/lexpulse/query")
async def answer_query(
    payload: QueryRequest,
    tenant_id: Annotated[str, Depends(require_tenant_id)],
    database: Annotated[Database, Depends(database_dependency)],
    settings: Annotated[Settings, Depends(settings_dependency)],
) -> dict[str, object]:
    await _query_rate_limiter.check(tenant_id)
    service = RagQueryService(settings)
    try:
        result = await service.answer_regulatory_query(
            database,
            tenant_id=UUID(tenant_id),
            query_text=payload.query_text,
            force_refresh=payload.force_refresh,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return {
        "queryText": payload.query_text,
        "cached": result.cached,
        "answer": {
            "cacheId": str(result.cache_id) if result.cache_id else None,
            "title": result.title,
            "directAnswer": result.direct_answer,
            "whatChanged": result.what_changed,
            "whyItMatters": result.why_it_matters,
            "affectedSectors": result.affected_sectors,
            "confidence": result.confidence,
            "generatedBy": result.generated_by,
        },
        "evidence": [
            {
                "documentId": str(document.document_id),
                "title": document.title,
                "docType": document.doc_type,
                "fetchUrl": document.fetch_url,
                "publishedAt": document.published_at.isoformat() if document.published_at else None,
                "excerpt": document.excerpt,
                "sourceName": document.source_name,
                "trustScore": document.trust_score,
                "regulator": document.regulator,
                "affectedSectors": document.affected_sectors,
            }
            for document in result.evidence
        ],
    }
