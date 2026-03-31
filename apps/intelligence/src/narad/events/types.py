from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class PulseboardCard(BaseModel):
    event_id: UUID
    title: str
    summary: str
    severity: Literal["critical", "high", "medium", "low", "informational"]
    confidence: float
    source_trust_tier: int = Field(ge=1, le=3)
    source_count: int = Field(ge=1)
    place_label: str | None = None
    event_timestamp: datetime
    linked_entities: list[str] = Field(default_factory=list)


class DeltaEnvelope(BaseModel):
    channel: str
    tenant_id: str
    entity_type: Literal["event", "watchlist", "entity", "regulatory_digest"]
    entity_id: str
    changes: dict[str, object]
    timestamp: str
