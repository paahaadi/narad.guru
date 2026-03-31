from __future__ import annotations

import json
from collections.abc import Callable
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

import pytest

from narad.adapters.base import RawDocument
from narad.config import Settings, get_settings
from narad.db.models import SourceRecord
from narad.services.ingestion import StoredDocumentRecord

FIXTURES_DIR = Path(__file__).parent / "fixtures"


class FakeDatabase:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str, tuple[Any, ...], Any]] = []
        self._fetchrow_routes: list[tuple[str, list[Any]]] = []
        self._fetch_routes: list[tuple[str, list[Any]]] = []
        self._execute_routes: list[tuple[str, list[Any]]] = []

    def queue_fetchrow(self, needle: str, *responses: Any) -> None:
        self._fetchrow_routes.append((needle, list(responses)))

    def queue_fetch(self, needle: str, *responses: Any) -> None:
        self._fetch_routes.append((needle, list(responses)))

    def queue_execute(self, needle: str, *responses: Any) -> None:
        self._execute_routes.append((needle, list(responses)))

    async def fetchrow(self, query: str, *args: Any, tenant_id: Any = None) -> Any:
        self.calls.append(("fetchrow", query, args, tenant_id))
        return self._resolve(self._fetchrow_routes, query, args, tenant_id, default=None)

    async def fetch(self, query: str, *args: Any, tenant_id: Any = None) -> Any:
        self.calls.append(("fetch", query, args, tenant_id))
        return self._resolve(self._fetch_routes, query, args, tenant_id, default=[])

    async def execute(self, query: str, *args: Any, tenant_id: Any = None) -> str:
        self.calls.append(("execute", query, args, tenant_id))
        result = self._resolve(self._execute_routes, query, args, tenant_id, default="OK")
        return str(result)

    def _resolve(
        self,
        routes: list[tuple[str, list[Any]]],
        query: str,
        args: tuple[Any, ...],
        tenant_id: Any,
        *,
        default: Any,
    ) -> Any:
        for needle, responses in routes:
            if needle not in query:
                continue
            if not responses:
                return default
            response = responses.pop(0)
            if callable(response):
                return response(query, *args, tenant_id=tenant_id)
            return response
        return default


@pytest.fixture
def settings() -> Settings:
    return get_settings()


@pytest.fixture
def tenant_id() -> UUID:
    return uuid4()


@pytest.fixture
def source_record_factory(tenant_id: UUID) -> Callable[..., SourceRecord]:
    def factory(**overrides: Any) -> SourceRecord:
        payload = {
            "id": uuid4(),
            "tenant_id": tenant_id,
            "name": "PIB RSS",
            "slug": "pib_rss",
            "source_type": "rss",
            "trust_tier": 1,
            "authority_level": "official",
            "governance_approved": True,
            "is_active": True,
            "base_url": "https://pib.gov.in",
            "update_cadence_seconds": 300,
            "config": {},
            "documents_ingested_24h": 0,
            "circuit_breaker_state": "closed",
        }
        payload.update(overrides)
        return SourceRecord.model_validate(payload)

    return factory


@pytest.fixture
def raw_document_factory() -> Callable[..., RawDocument]:
    def factory(**overrides: Any) -> RawDocument:
        payload = {
            "external_id": "fixture-doc-001",
            "title": "Government issues advisory",
            "body_text": "A factual update was published for testing.",
            "doc_type": "article",
            "fetch_url": "https://example.test/document",
            "original_language": "en",
            "metadata": {"fixture": True},
        }
        payload.update(overrides)
        return RawDocument.model_validate(payload)

    return factory


@pytest.fixture
def stored_document_factory(tenant_id: UUID) -> Callable[..., StoredDocumentRecord]:
    def factory(**overrides: Any) -> StoredDocumentRecord:
        payload = {
            "document_id": uuid4(),
            "tenant_id": tenant_id,
            "source_id": uuid4(),
            "external_id": "stored-doc-001",
            "title": "Stored document",
            "body_text": "Stored body text.",
            "translated_text": "Stored body text.",
            "translated_language": "en",
            "original_language": "en",
            "doc_type": "article",
            "content_hash": "hash-001",
            "fetch_url": "https://example.test/stored",
            "published_at": None,
            "metadata": {},
            "is_new": True,
        }
        payload.update(overrides)
        return StoredDocumentRecord(**payload)

    return factory


@pytest.fixture
def fixture_loader() -> Callable[[str], str]:
    def load_fixture(name: str) -> str:
        return (FIXTURES_DIR / name).read_text(encoding="utf-8")

    return load_fixture


def json_arg(args: tuple[Any, ...], index: int) -> dict[str, Any]:
    return json.loads(str(args[index]))
