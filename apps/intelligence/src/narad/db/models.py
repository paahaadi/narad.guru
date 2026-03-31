"""Typed request and row models used by the intelligence plane."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class SourceRecord(BaseModel):
    """Read-model view of a row from `core.sources`."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    name: str
    slug: str
    source_type: str
    trust_tier: int = Field(ge=1, le=3)
    authority_level: str
    governance_approved: bool
    is_active: bool
    base_url: str | None = None
    update_cadence_seconds: int | None = None
    last_polled_at: datetime | None = None
    last_success_at: datetime | None = None
    last_successful_fetch: datetime | None = None
    last_error: str | None = None
    consecutive_failures: int = 0
    status: str = "active"
    documents_fetched_total: int = 0
    events_produced_total: int = 0
    config: dict[str, Any] = Field(default_factory=dict)
    documents_ingested_24h: int = 0
    circuit_breaker_state: str = "closed"

    @field_validator("config", mode="before")
    @classmethod
    def parse_config(cls, value: Any) -> dict[str, Any]:
        if value in (None, ""):
            return {}
        if isinstance(value, dict):
            return value
        if isinstance(value, str):
            parsed = json.loads(value)
            if not isinstance(parsed, dict):
                raise TypeError("config must deserialize to a dictionary")
            return parsed
        raise TypeError("config must be a dictionary or JSON object string")


class IngestedDocumentRecord(BaseModel):
    """Return payload for a successfully ingested raw document."""

    document_id: UUID
    event_id: UUID
    source_id: UUID
    title: str
    content_hash: str
    published_at: datetime | None = None


class PartitionRequest(BaseModel):
    """Explicit audit partition creation request."""

    year: int = Field(ge=2000, le=2100)
    month: int = Field(ge=1, le=12)
