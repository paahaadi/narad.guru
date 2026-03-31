from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import pytest

from narad.services.embedding import EmbeddingResult
from narad.services.rag_query import RagQueryService

from .conftest import FakeDatabase


class StubEmbeddingService:
    def __init__(self, vector: list[float] | None = None) -> None:
        self.vector = vector or [0.1, 0.2, 0.3]
        self.calls = 0

    async def embed_texts(self, texts: list[str]) -> EmbeddingResult:
        self.calls += 1
        return EmbeddingResult(vectors=[self.vector for _ in texts])


class StubQueryLLM:
    def __init__(self, payload):
        self.payload = payload
        self.calls = 0
        self.configured = True

    async def generate_json(self, prompt: str, *, model: str = "default"):
        self.calls += 1
        return self.payload


def _document_row(document_id, *, title: str, published_at: datetime):
    return {
        "id": document_id,
        "title": title,
        "doc_type": "gazette",
        "fetch_url": "https://example.test/doc",
        "published_at": published_at,
        "source_name": "Official Gazette",
        "trust_tier": 1,
        "excerpt": f"{title} excerpt",
        "regulator": "DGCA",
        "affected_sectors": ["Aviation"],
    }


@pytest.mark.asyncio
async def test_answer_regulatory_query_uses_semantic_cache(settings, tenant_id) -> None:
    database = FakeDatabase()
    cache_id = uuid4()
    document_id = uuid4()
    embedding = StubEmbeddingService()
    llm = StubQueryLLM({"title": "Should not run"})
    database.queue_fetchrow(
        "FROM lex_pulse.query_cache",
        {
            "id": cache_id,
            "answer": {
                "title": "Cached answer",
                "directAnswer": "Cached direct answer",
                "whatChanged": ["Cached bullet"],
                "whyItMatters": "Cached explanation",
                "affectedSectors": ["Aviation"],
                "generatedBy": "semantic-cache",
            },
            "citations": [str(document_id)],
            "confidence": 0.81,
        },
    )
    database.queue_fetch(
        "WHERE d.tenant_id = $1\n              AND d.id = ANY($2::uuid[])",
        [_document_row(document_id, title="Cached doc", published_at=datetime(2026, 3, 29, tzinfo=UTC))],
    )

    service = RagQueryService(settings, embedding_service=embedding, llm_service=llm)
    result = await service.answer_regulatory_query(
        database,
        tenant_id=tenant_id,
        query_text="What changed in aviation rules?",
    )

    assert result.cached is True
    assert result.title == "Cached answer"
    assert len(result.evidence) == 1
    assert llm.calls == 0


@pytest.mark.asyncio
async def test_answer_regulatory_query_fuses_results_and_respects_citations(settings, tenant_id) -> None:
    database = FakeDatabase()
    published_at = datetime(2026, 3, 29, tzinfo=UTC)
    first_document = uuid4()
    second_document = uuid4()
    embedding = StubEmbeddingService()
    llm = StubQueryLLM(
        {
            "title": "Regulatory Shift",
            "directAnswer": "Aviation obligations have changed.",
            "whatChanged": ["SAF blending introduced"],
            "whyItMatters": "Operators need to adjust compliance plans.",
            "affectedSectors": ["Aviation"],
            "confidence": 0.89,
            "citations": [2],
        }
    )
    database.queue_fetchrow("FROM lex_pulse.query_cache", None)
    database.queue_fetch(
        "ORDER BY d.embedding <=> $3::vector ASC, d.published_at DESC NULLS LAST",
        [
            _document_row(first_document, title="Vector hit", published_at=published_at),
            _document_row(second_document, title="Vector corroboration", published_at=published_at),
        ],
    )
    database.queue_fetch(
        "ORDER BY ts_rank(d.tsv, plainto_tsquery('english', $3)) DESC, d.published_at DESC NULLS LAST",
        [
            _document_row(second_document, title="BM25 hit", published_at=published_at),
        ],
    )
    database.queue_fetchrow(
        "INSERT INTO lex_pulse.query_cache",
        {
            "id": uuid4(),
        },
    )

    service = RagQueryService(settings, embedding_service=embedding, llm_service=llm)
    result = await service.answer_regulatory_query(
        database,
        tenant_id=tenant_id,
        query_text="What changed in aviation rules?",
        force_refresh=True,
    )

    assert result.cached is False
    assert result.title == "Regulatory Shift"
    assert len(result.evidence) == 1
    assert result.evidence[0].title == "Vector hit"
    assert llm.calls == 1
