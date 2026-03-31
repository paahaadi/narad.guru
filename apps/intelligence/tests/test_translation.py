from __future__ import annotations

from uuid import uuid4

import httpx
import pytest

from narad.services.ingestion import DocumentIngestionService
from narad.services.translation import TranslationService

from .conftest import FakeDatabase


@pytest.mark.asyncio
async def test_store_raw_document_preserves_non_english_language_until_async_translation(
    raw_document_factory,
    source_record_factory,
) -> None:
    database = FakeDatabase()
    service = DocumentIngestionService()
    source = source_record_factory(slug="india_code")
    raw_document = raw_document_factory(
        title="हिंदी विधिक सूचना",
        body_text="यह एक परीक्षण दस्तावेज है",
        original_language="hi",
    )

    database.queue_fetchrow(
        "INSERT INTO core.documents",
        {
            "id": uuid4(),
            "tenant_id": source.tenant_id,
            "source_id": source.id,
            "external_id": raw_document.external_id,
            "title": raw_document.title,
            "body_text": raw_document.body_text,
            "translated_text": raw_document.body_text,
            "translated_language": "hi",
            "original_language": "hi",
            "doc_type": "article",
            "content_hash": "hash-hi",
            "fetch_url": raw_document.fetch_url,
            "published_at": None,
            "metadata": {},
        },
    )

    stored = await service.store_raw_document(
        database,
        source=source,
        raw_document=raw_document,
        translation_service=TranslationService(),
    )

    assert stored.translated_language == "hi"
    assert stored.needs_translation is True


@pytest.mark.asyncio
async def test_update_translation_marks_document_as_english_after_success(
    source_record_factory,
) -> None:
    database = FakeDatabase()
    service = DocumentIngestionService()
    source = source_record_factory(slug="india_code")
    document_id = uuid4()

    database.queue_fetchrow(
        "UPDATE core.documents",
        {
            "id": document_id,
            "tenant_id": source.tenant_id,
            "source_id": source.id,
            "external_id": "doc-hi",
            "title": "Translated notice",
            "body_text": "मूल पाठ",
            "translated_text": "Translated notice",
            "translated_language": "en",
            "original_language": "hi",
            "doc_type": "article",
            "content_hash": "hash-hi",
            "fetch_url": "https://example.test/translated",
            "published_at": None,
            "metadata": {},
        },
    )

    updated = await service.update_translation(
        database,
        tenant_id=source.tenant_id,
        document_id=document_id,
        translated_text="Translated notice",
        translated_language="en",
    )

    assert updated is not None
    assert updated.translated_language == "en"
    assert updated.needs_translation is False


@pytest.mark.asyncio
async def test_translation_service_returns_original_text_when_bhashini_fails(settings) -> None:
    async def fail_translation(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(status_code=503, json={"error": "unavailable"})

    transport = httpx.MockTransport(fail_translation)
    async with httpx.AsyncClient(transport=transport, base_url="https://example.test") as client:
        service = TranslationService(settings, client=client)
        result = await service.translate("मूल पाठ", source_language="hi", target_language="en")

    assert result.text == "मूल पाठ"
    assert result.translated is False
    assert result.target_language == "en"
