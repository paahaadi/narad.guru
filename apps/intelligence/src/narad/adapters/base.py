from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import UTC, datetime

from pydantic import BaseModel, Field


class SourceDefinition(BaseModel):
    name: str
    slug: str
    source_type: str
    trust_tier: int = Field(ge=1, le=3)
    authority_level: str
    base_url: str | None = None
    update_cadence_seconds: int | None = None
    governance_approved: bool = True
    is_active: bool = True
    config: dict[str, object] = Field(default_factory=dict)


class RawDocument(BaseModel):
    external_id: str | None = None
    title: str
    body_text: str
    doc_type: str = "article"
    fetch_url: str | None = None
    published_at: datetime | None = None
    original_language: str | None = "en"
    geometry: tuple[float, float] | None = None
    metadata: dict[str, object] = Field(default_factory=dict)


class BaseSourceAdapter(ABC):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"

    definition: SourceDefinition

    @property
    def source_slug(self) -> str:
        return self.definition.slug

    @property
    def source_name(self) -> str:
        return self.definition.name

    @abstractmethod
    async def fetch_documents(self, limit: int, since: datetime | None = None) -> list[RawDocument]:
        raise NotImplementedError

    def circuit_state(
        self,
        *,
        consecutive_failures: int,
        last_failure_at: datetime | None,
        threshold: int,
        timeout_seconds: int,
        max_backoff_seconds: int,
        now: datetime | None = None,
    ) -> tuple[str, int]:
        current_time = now or datetime.now(UTC)
        if consecutive_failures < threshold:
            return self.CLOSED, 0
        if last_failure_at is None:
            return self.OPEN, min(timeout_seconds, max_backoff_seconds)
        failure_age = max((current_time - last_failure_at).total_seconds(), 0.0)
        backoff_seconds = min(
            timeout_seconds * (2 ** max(consecutive_failures - threshold, 0)),
            max_backoff_seconds,
        )
        if failure_age >= backoff_seconds:
            return self.HALF_OPEN, backoff_seconds
        return self.OPEN, backoff_seconds

    def allow_request(
        self,
        *,
        consecutive_failures: int,
        last_failure_at: datetime | None,
        threshold: int,
        timeout_seconds: int,
        max_backoff_seconds: int,
        now: datetime | None = None,
    ) -> bool:
        state, _ = self.circuit_state(
            consecutive_failures=consecutive_failures,
            last_failure_at=last_failure_at,
            threshold=threshold,
            timeout_seconds=timeout_seconds,
            max_backoff_seconds=max_backoff_seconds,
            now=now,
        )
        return state != self.OPEN

    async def health_check(self) -> bool:
        try:
            await self.fetch_documents(1)
            return True
        except Exception:
            return False
