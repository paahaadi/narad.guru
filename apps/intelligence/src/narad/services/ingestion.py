from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

from narad.adapters.base import RawDocument
from narad.db.models import SourceRecord
from narad.db.session import Database
from narad.services.translation import TranslationService

ALLOWED_DOCUMENT_TYPES = {
    "article",
    "bill",
    "bulletin",
    "circular",
    "filing",
    "forecast",
    "gazette",
    "media",
    "order",
    "press_release",
    "report",
    "telemetry",
    "warning",
}


def _content_hash(title: str, body_text: str) -> str:
    return hashlib.sha256(f"{title}\n{body_text}".encode()).hexdigest()


def _normalize_document_type(doc_type: str | None) -> str:
    candidate = (doc_type or "article").strip().lower()
    if candidate in ALLOWED_DOCUMENT_TYPES:
        return candidate
    return "article"


def _normalize_language(language: str | None) -> str:
    candidate = (language or "").strip().lower()
    return candidate or "en"


def _normalize_metadata_value(value: object) -> dict[str, object]:
    if value is None:
        return {}
    if isinstance(value, str):
        parsed = json.loads(value)
        if parsed is None:
            return {}
        if isinstance(parsed, Mapping):
            return dict(parsed)
        raise TypeError("Document metadata JSON must decode to an object")
    if isinstance(value, Mapping):
        return dict(value)
    raise TypeError("Document metadata must be a mapping or JSON object string")


@dataclass(slots=True)
class StoredDocumentRecord:
    document_id: UUID
    tenant_id: UUID
    source_id: UUID
    external_id: str | None
    title: str
    body_text: str
    translated_text: str
    original_language: str
    translated_language: str
    doc_type: str
    content_hash: str
    fetch_url: str | None
    published_at: datetime | None
    metadata: dict[str, object]
    is_new: bool

    @property
    def needs_translation(self) -> bool:
        return self.original_language != "en" and self.translated_language != "en"


class DocumentIngestionService:
    async def store_raw_document(
        self,
        database: Database,
        *,
        source: SourceRecord,
        raw_document: RawDocument,
        translation_service: TranslationService | None = None,
        defer_translation: bool = True,
    ) -> StoredDocumentRecord:
        normalized_title = raw_document.title.strip() or "Untitled intelligence document"
        normalized_body = (raw_document.body_text or "").strip() or normalized_title
        normalized_original_language = _normalize_language(raw_document.original_language)
        translated_text = normalized_body
        translated_language = normalized_original_language

        if not defer_translation and normalized_original_language != "en" and translation_service is not None:
            translation = await translation_service.translate(
                raw_document.body_text,
                source_language=normalized_original_language,
            )
            translated_text = translation.text.strip() or normalized_body
            translated_language = (
                translation.target_language if translation.translated else normalized_original_language
            )
        elif normalized_original_language == "en":
            translated_language = "en"

        content_hash = _content_hash(normalized_title, normalized_body)
        metadata = dict(raw_document.metadata)
        if raw_document.geometry is not None:
            metadata["geometry"] = {
                "lat": raw_document.geometry[0],
                "lon": raw_document.geometry[1],
            }

        row = await database.fetchrow(
            """
            INSERT INTO core.documents (
                tenant_id,
                source_id,
                external_id,
                doc_type,
                title,
                body_text,
                original_language,
                translated_text,
                translated_language,
                content_hash,
                fetch_url,
                published_at,
                fetched_at,
                metadata
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb)
            ON CONFLICT (tenant_id, source_id, content_hash)
            DO NOTHING
            RETURNING
                id,
                tenant_id,
                source_id,
                external_id,
                title,
                body_text,
                translated_text,
                translated_language,
                original_language,
                doc_type,
                content_hash,
                fetch_url,
                published_at,
                metadata
            """,
            source.tenant_id,
            source.id,
            raw_document.external_id,
            _normalize_document_type(raw_document.doc_type),
            normalized_title,
            normalized_body,
            normalized_original_language,
            translated_text,
            translated_language,
            content_hash,
            raw_document.fetch_url,
            raw_document.published_at,
            datetime.now(UTC),
            json.dumps(metadata),
            tenant_id=source.tenant_id,
        )
        is_new = row is not None
        if row is None:
            if raw_document.geometry is not None:
                row = await database.fetchrow(
                    """
                    UPDATE core.documents
                    SET metadata = CASE
                        WHEN metadata ? 'geometry'
                          AND jsonb_typeof(metadata->'geometry') = 'object' THEN metadata
                        ELSE jsonb_set(
                            CASE
                                WHEN jsonb_typeof(metadata) = 'object' THEN metadata
                                ELSE '{}'::jsonb
                            END,
                            '{geometry}',
                            jsonb_build_object(
                                'lat',
                                $4::double precision,
                                'lon',
                                $5::double precision
                            )
                        )
                    END
                    WHERE tenant_id = $1
                      AND source_id = $2
                      AND content_hash = $3
                    RETURNING
                        id,
                        tenant_id,
                        source_id,
                        external_id,
                        title,
                        body_text,
                        translated_text,
                        translated_language,
                        original_language,
                        doc_type,
                        content_hash,
                        fetch_url,
                        published_at,
                        metadata
                    """,
                    source.tenant_id,
                    source.id,
                    content_hash,
                    raw_document.geometry[0],
                    raw_document.geometry[1],
                    tenant_id=source.tenant_id,
                )
            if row is None:
                row = await database.fetchrow(
                    """
                    SELECT
                        id,
                        tenant_id,
                        source_id,
                        external_id,
                        title,
                        body_text,
                        translated_text,
                        translated_language,
                        original_language,
                        doc_type,
                        content_hash,
                        fetch_url,
                        published_at,
                        metadata
                    FROM core.documents
                    WHERE tenant_id = $1 AND source_id = $2 AND content_hash = $3
                    """,
                    source.tenant_id,
                    source.id,
                    content_hash,
                    tenant_id=source.tenant_id,
                )
        if row is None:
            raise RuntimeError("Document ingest failed")

        row_dict = dict(row)
        return StoredDocumentRecord(
            document_id=row_dict["id"],
            tenant_id=row_dict["tenant_id"],
            source_id=row_dict["source_id"],
            external_id=row_dict["external_id"],
            title=row_dict["title"],
            body_text=row_dict["body_text"],
            translated_text=row_dict["translated_text"],
            original_language=row_dict["original_language"] or "en",
            translated_language=row_dict["translated_language"] or row_dict["original_language"] or "en",
            doc_type=row_dict["doc_type"],
            content_hash=row_dict["content_hash"],
            fetch_url=row_dict["fetch_url"],
            published_at=row_dict["published_at"],
            metadata=_normalize_metadata_value(row_dict["metadata"]),
            is_new=is_new,
        )

    async def update_translation(
        self,
        database: Database,
        *,
        tenant_id: UUID,
        document_id: UUID,
        translated_text: str,
        translated_language: str,
    ) -> StoredDocumentRecord | None:
        row = await database.fetchrow(
            """
            UPDATE core.documents
            SET
                translated_text = $3,
                translated_language = $4,
                updated_at = now()
            WHERE tenant_id = $1 AND id = $2
            RETURNING
                id,
                tenant_id,
                source_id,
                external_id,
                title,
                body_text,
                translated_text,
                translated_language,
                original_language,
                doc_type,
                content_hash,
                fetch_url,
                published_at,
                metadata
            """,
            tenant_id,
            document_id,
            translated_text,
            translated_language,
            tenant_id=tenant_id,
        )
        if row is None:
            return None

        row_dict = dict(row)
        return StoredDocumentRecord(
            document_id=row_dict["id"],
            tenant_id=row_dict["tenant_id"],
            source_id=row_dict["source_id"],
            external_id=row_dict["external_id"],
            title=row_dict["title"] or "",
            body_text=row_dict["body_text"] or "",
            translated_text=row_dict["translated_text"] or row_dict["body_text"] or "",
            original_language=row_dict["original_language"] or "en",
            translated_language=row_dict["translated_language"] or row_dict["original_language"] or "en",
            doc_type=row_dict["doc_type"],
            content_hash=row_dict["content_hash"],
            fetch_url=row_dict["fetch_url"],
            published_at=row_dict["published_at"],
            metadata=_normalize_metadata_value(row_dict["metadata"]),
            is_new=False,
        )

    async def load_document(
        self,
        database: Database,
        *,
        tenant_id: UUID,
        document_id: UUID,
    ) -> StoredDocumentRecord | None:
        row = await database.fetchrow(
            """
            SELECT
                id,
                tenant_id,
                source_id,
                external_id,
                title,
                body_text,
                translated_text,
                translated_language,
                original_language,
                doc_type,
                content_hash,
                fetch_url,
                published_at,
                metadata
            FROM core.documents
            WHERE tenant_id = $1 AND id = $2
            """,
            tenant_id,
            document_id,
            tenant_id=tenant_id,
        )
        if row is None:
            return None
        row_dict = dict(row)
        return StoredDocumentRecord(
            document_id=row_dict["id"],
            tenant_id=row_dict["tenant_id"],
            source_id=row_dict["source_id"],
            external_id=row_dict["external_id"],
            title=row_dict["title"] or "",
            body_text=row_dict["body_text"] or "",
            translated_text=row_dict["translated_text"] or row_dict["body_text"] or "",
            original_language=row_dict["original_language"] or "en",
            translated_language=row_dict["translated_language"] or row_dict["original_language"] or "en",
            doc_type=row_dict["doc_type"],
            content_hash=row_dict["content_hash"],
            fetch_url=row_dict["fetch_url"],
            published_at=row_dict["published_at"],
            metadata=_normalize_metadata_value(row_dict["metadata"]),
            is_new=False,
        )
