from __future__ import annotations

import json
from datetime import UTC, datetime
from uuid import uuid4

import pytest

from narad.services.ingestion import DocumentIngestionService
from narad.services.translation import TranslationService

from .conftest import FakeDatabase, json_arg


@pytest.mark.asyncio
async def test_store_raw_document_normalizes_doc_type_and_geometry(
    fixture_loader,
    raw_document_factory,
    source_record_factory,
) -> None:
    database = FakeDatabase()
    service = DocumentIngestionService()
    source = source_record_factory(slug="imd", name="IMD Alerts", source_type="portal")
    published_at = datetime(2026, 3, 29, 8, 30, tzinfo=UTC)
    raw_document = raw_document_factory(
        title="Orange Alert for Delhi",
        body_text=fixture_loader("imd_alerts.html"),
        doc_type="advisory",
        geometry=(28.6139, 77.2090),
        published_at=published_at,
        metadata={"severity": "orange"},
    )

    def insert_response(_query: str, *args, tenant_id=None):
        metadata = json_arg(args, 13)
        assert tenant_id == source.tenant_id
        assert args[3] == "article"
        assert metadata["geometry"] == {"lat": 28.6139, "lon": 77.209}
        return {
            "id": uuid4(),
            "tenant_id": args[0],
            "source_id": args[1],
            "external_id": args[2],
            "title": args[4],
            "body_text": args[5],
            "translated_text": args[7],
            "translated_language": args[8],
            "original_language": args[6],
            "doc_type": args[3],
            "content_hash": args[9],
            "fetch_url": args[10],
            "published_at": args[11],
            "metadata": metadata,
        }

    database.queue_fetchrow("INSERT INTO core.documents", insert_response)

    result = await service.store_raw_document(
        database,
        source=source,
        raw_document=raw_document,
        translation_service=TranslationService(),
    )

    assert result.is_new is True
    assert result.doc_type == "article"
    assert result.metadata["geometry"] == {"lat": 28.6139, "lon": 77.209}
    assert result.published_at == published_at


@pytest.mark.asyncio
async def test_store_raw_document_returns_existing_row_for_duplicate(
    fixture_loader,
    raw_document_factory,
    source_record_factory,
    tenant_id,
) -> None:
    database = FakeDatabase()
    service = DocumentIngestionService()
    source = source_record_factory(slug="pib_rss")
    raw_document = raw_document_factory(
        title="PIB releases advisory",
        body_text=fixture_loader("pib_feed.xml"),
    )

    existing_id = uuid4()
    database.queue_fetchrow("INSERT INTO core.documents", None)
    database.queue_fetchrow(
        "WHERE tenant_id = $1 AND source_id = $2 AND content_hash = $3",
        {
            "id": existing_id,
            "tenant_id": tenant_id,
            "source_id": source.id,
            "external_id": raw_document.external_id,
            "title": raw_document.title,
            "body_text": raw_document.body_text,
            "translated_text": raw_document.body_text,
            "translated_language": "en",
            "original_language": "en",
            "doc_type": "article",
            "content_hash": "existing-hash",
            "fetch_url": raw_document.fetch_url,
            "published_at": None,
            "metadata": {"fixture": True},
        },
    )

    result = await service.store_raw_document(
        database,
        source=source,
        raw_document=raw_document,
        translation_service=TranslationService(),
    )

    assert result.is_new is False
    assert result.document_id == existing_id


@pytest.mark.asyncio
async def test_store_raw_document_backfills_geometry_for_duplicate_rows(
    raw_document_factory,
    source_record_factory,
) -> None:
    database = FakeDatabase()
    service = DocumentIngestionService()
    source = source_record_factory(slug="cwc")
    raw_document = raw_document_factory(
        title="Daily Flood Situation Report cum Advisories",
        body_text="National flood advisory",
        geometry=(20.5937, 78.9629),
    )
    existing_id = uuid4()

    database.queue_fetchrow("INSERT INTO core.documents", None)

    def update_response(_query: str, *args, tenant_id=None):
        assert tenant_id == source.tenant_id
        assert args[3] == 20.5937
        assert args[4] == 78.9629
        return {
            "id": existing_id,
            "tenant_id": source.tenant_id,
            "source_id": source.id,
            "external_id": raw_document.external_id,
            "title": raw_document.title,
            "body_text": raw_document.body_text,
            "translated_text": raw_document.body_text,
            "translated_language": "en",
            "original_language": "en",
            "doc_type": "article",
            "content_hash": "existing-hash",
            "fetch_url": raw_document.fetch_url,
            "published_at": None,
            "metadata": {"fixture": True, "geometry": {"lat": 20.5937, "lon": 78.9629}},
        }

    database.queue_fetchrow("UPDATE core.documents", update_response)

    result = await service.store_raw_document(
        database,
        source=source,
        raw_document=raw_document,
        translation_service=TranslationService(),
    )

    assert result.is_new is False
    assert result.document_id == existing_id
    assert result.metadata["geometry"] == {"lat": 20.5937, "lon": 78.9629}


@pytest.mark.asyncio
async def test_store_raw_document_parses_json_metadata_string_from_database_row(
    raw_document_factory,
    source_record_factory,
) -> None:
    database = FakeDatabase()
    service = DocumentIngestionService()
    source = source_record_factory(slug="pib_rss")
    raw_document = raw_document_factory(metadata={"fixture": True, "kind": "rss"})

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
            "translated_language": "en",
            "original_language": "en",
            "doc_type": "article",
            "content_hash": "inserted-hash",
            "fetch_url": raw_document.fetch_url,
            "published_at": None,
            "metadata": '{"fixture": true, "kind": "rss"}',
        },
    )

    result = await service.store_raw_document(
        database,
        source=source,
        raw_document=raw_document,
        translation_service=TranslationService(),
    )

    assert result.is_new is True
    assert result.metadata == {"fixture": True, "kind": "rss"}


@pytest.mark.asyncio
async def test_store_raw_document_parses_string_metadata_from_database(
    raw_document_factory,
    source_record_factory,
) -> None:
    database = FakeDatabase()
    service = DocumentIngestionService()
    source = source_record_factory(slug="pib_rss")
    raw_document = raw_document_factory(
        title="PIB releases advisory",
        body_text="Government update",
        metadata={"severity": "high"},
    )

    def insert_response(_query: str, *args, tenant_id=None):
        metadata = json_arg(args, 13)
        return {
            "id": uuid4(),
            "tenant_id": args[0],
            "source_id": args[1],
            "external_id": args[2],
            "title": args[4],
            "body_text": args[5],
            "translated_text": args[7],
            "translated_language": args[8],
            "original_language": args[6],
            "doc_type": args[3],
            "content_hash": args[9],
            "fetch_url": args[10],
            "published_at": args[11],
            "metadata": json.dumps(metadata),
        }

    database.queue_fetchrow("INSERT INTO core.documents", insert_response)

    result = await service.store_raw_document(
        database,
        source=source,
        raw_document=raw_document,
        translation_service=TranslationService(),
    )

    assert result.metadata == {"severity": "high"}


@pytest.mark.asyncio
async def test_load_document_parses_string_metadata_from_database(
    source_record_factory,
    tenant_id,
) -> None:
    database = FakeDatabase()
    service = DocumentIngestionService()
    source = source_record_factory()
    document_id = uuid4()
    database.queue_fetchrow(
        "WHERE tenant_id = $1 AND id = $2",
        {
            "id": document_id,
            "tenant_id": tenant_id,
            "source_id": source.id,
            "external_id": "doc-1",
            "title": "Stored document",
            "body_text": "Stored text",
            "translated_text": "Stored text",
            "translated_language": "en",
            "original_language": "en",
            "doc_type": "article",
            "content_hash": "hash-1",
            "fetch_url": "https://example.com/doc-1",
            "published_at": None,
            "metadata": "{\"severity\": \"medium\"}",
        },
    )

    result = await service.load_document(
        database,
        tenant_id=tenant_id,
        document_id=document_id,
    )

    assert result is not None
    assert result.metadata == {"severity": "medium"}
