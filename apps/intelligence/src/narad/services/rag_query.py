from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID

from narad.config import Settings
from narad.db.session import Database
from narad.services.embedding import EmbeddingService, vector_literal
from narad.services.llm import LLMService

SUPPORTED_DOC_TYPES = ("gazette", "circular", "order", "bill", "debate", "filing", "report")


@dataclass(slots=True)
class EvidenceDocument:
    document_id: UUID
    title: str
    doc_type: str
    fetch_url: str | None
    published_at: datetime | None
    source_name: str
    trust_score: float
    excerpt: str
    regulator: str | None
    affected_sectors: list[str]


@dataclass(slots=True)
class RagAnswer:
    cache_id: UUID | None
    title: str
    direct_answer: str
    what_changed: list[str]
    why_it_matters: str
    affected_sectors: list[str]
    confidence: float
    cached: bool
    generated_by: str
    evidence: list[EvidenceDocument]


class RagQueryService:
    def __init__(
        self,
        settings: Settings,
        *,
        embedding_service: EmbeddingService | None = None,
        llm_service: LLMService | None = None,
    ) -> None:
        self._settings = settings
        self._embedding_service = embedding_service or EmbeddingService(settings)
        self._llm = llm_service or LLMService(settings)

    async def answer_regulatory_query(
        self,
        database: Database,
        *,
        tenant_id: UUID,
        query_text: str,
        force_refresh: bool = False,
    ) -> RagAnswer:
        normalized_query = query_text.strip()
        if not normalized_query:
            raise ValueError("query_text must not be empty")

        embedding_result = await self._embedding_service.embed_texts([normalized_query])
        query_vector = embedding_result.vectors[0] if embedding_result.vectors else []
        vector_arg = vector_literal(query_vector) if query_vector else None

        if vector_arg is not None and not force_refresh:
            cached_row = await database.fetchrow(
                """
                SELECT id, answer, citations, confidence
                FROM lex_pulse.query_cache
                WHERE tenant_id = $1
                  AND expires_at > now()
                  AND embedding <=> $2::vector < $3
                ORDER BY embedding <=> $2::vector ASC, updated_at DESC
                LIMIT 1
                """,
                tenant_id,
                vector_arg,
                self._settings.rag_query_semantic_threshold,
                tenant_id=tenant_id,
            )
            if cached_row is not None:
                await database.execute(
                    """
                    UPDATE lex_pulse.query_cache
                    SET hit_count = hit_count + 1, updated_at = now()
                    WHERE tenant_id = $1 AND id = $2
                    """,
                    tenant_id,
                    cached_row["id"],
                    tenant_id=tenant_id,
                )
                citation_ids = [
                    UUID(document_id)
                    for document_id in cached_row["citations"]
                    if isinstance(document_id, str)
                ]
                evidence = await self._fetch_documents_by_ids(database, tenant_id=tenant_id, document_ids=citation_ids)
                raw_answer = cached_row["answer"]
                answer = raw_answer if isinstance(raw_answer, dict) else json.loads(str(raw_answer))
                return RagAnswer(
                    cache_id=cached_row["id"],
                    title=str(answer.get("title", "LexPulse response")),
                    direct_answer=str(answer.get("directAnswer", "")),
                    what_changed=self._string_list(answer.get("whatChanged")),
                    why_it_matters=str(answer.get("whyItMatters", "")),
                    affected_sectors=self._string_list(answer.get("affectedSectors")),
                    confidence=float(cached_row["confidence"]),
                    cached=True,
                    generated_by=str(answer.get("generatedBy", "semantic-cache")),
                    evidence=evidence,
                )

        vector_rows = (
            await self._vector_search(database, tenant_id=tenant_id, vector_arg=vector_arg)
            if vector_arg is not None
            else []
        )
        bm25_rows = await self._bm25_search(database, tenant_id=tenant_id, query_text=normalized_query)
        ranked_documents = self._reciprocal_rank_fusion(vector_rows, bm25_rows)
        evidence = ranked_documents[:5]
        selected_evidence = evidence

        response_payload = self._fallback_answer(normalized_query, evidence)
        generated_by = "deterministic-fallback"
        confidence = response_payload["confidence"]

        llm_payload = await self._llm.generate_json(
            self._build_prompt(normalized_query, evidence),
            model="large",
        )
        if isinstance(llm_payload, dict):
            response_payload = self._coerce_llm_payload(
                llm_payload,
                query_text=normalized_query,
                fallback=response_payload,
            )
            selected_evidence = self._select_cited_evidence(llm_payload.get("citations"), evidence) or evidence
            confidence = response_payload["confidence"]
            generated_by = self._settings.gemini_model_large

        citations = [str(document.document_id) for document in selected_evidence]
        cache_id = None
        if vector_arg is not None:
            cache_row = await database.fetchrow(
                """
                INSERT INTO lex_pulse.query_cache (
                    tenant_id,
                    query_text,
                    embedding,
                    answer,
                    citations,
                    confidence,
                    expires_at
                )
                VALUES ($1, $2, $3::vector, $4::jsonb, $5::jsonb, $6, $7)
                RETURNING id
                """,
                tenant_id,
                normalized_query,
                vector_arg,
                {
                    "title": response_payload["title"],
                    "directAnswer": response_payload["directAnswer"],
                    "whatChanged": response_payload["whatChanged"],
                    "whyItMatters": response_payload["whyItMatters"],
                    "affectedSectors": response_payload["affectedSectors"],
                    "generatedBy": generated_by,
                },
                citations,
                confidence,
                datetime.now(UTC) + timedelta(hours=self._settings.rag_query_cache_ttl_hours),
                tenant_id=tenant_id,
            )
            cache_id = cache_row["id"] if cache_row is not None else None

        return RagAnswer(
            cache_id=cache_id,
            title=response_payload["title"],
            direct_answer=response_payload["directAnswer"],
            what_changed=response_payload["whatChanged"],
            why_it_matters=response_payload["whyItMatters"],
            affected_sectors=response_payload["affectedSectors"],
            confidence=confidence,
            cached=False,
            generated_by=generated_by,
            evidence=selected_evidence,
        )

    async def _vector_search(
        self,
        database: Database,
        *,
        tenant_id: UUID,
        vector_arg: str,
    ) -> list[EvidenceDocument]:
        rows = await database.fetch(
            """
            SELECT
                d.id,
                COALESCE(d.title, d.external_id, d.doc_type) AS title,
                d.doc_type,
                d.fetch_url,
                d.published_at,
                s.name AS source_name,
                s.trust_tier,
                LEFT(COALESCE(d.translated_text, d.body_text, d.title, ''), 400) AS excerpt,
                reg.regulator,
                reg.affected_sectors
            FROM core.documents AS d
            JOIN core.sources AS s ON s.id = d.source_id
            LEFT JOIN LATERAL (
                SELECT
                    MAX(lp.regulator) AS regulator,
                    COALESCE(array_remove(array_agg(DISTINCT sector_name), NULL), '{{}}'::text[]) AS affected_sectors
                FROM core.event_document_links AS edl
                JOIN core.events AS e ON e.id = edl.event_id
                LEFT JOIN lex_pulse.regulatory_events AS lp ON lp.event_id = e.id
                LEFT JOIN LATERAL unnest(lp.affected_sectors) AS sector_name ON TRUE
                WHERE edl.tenant_id = d.tenant_id
                  AND edl.document_id = d.id
            ) AS reg ON TRUE
            WHERE d.tenant_id = $1
              AND d.doc_type = ANY($2::text[])
              AND d.embedding IS NOT NULL
            ORDER BY d.embedding <=> $3::vector ASC, d.published_at DESC NULLS LAST
            LIMIT 20
            """,
            tenant_id,
            list(SUPPORTED_DOC_TYPES),
            vector_arg,
            tenant_id=tenant_id,
        )
        return [self._row_to_evidence(row) for row in rows]

    async def _bm25_search(
        self,
        database: Database,
        *,
        tenant_id: UUID,
        query_text: str,
    ) -> list[EvidenceDocument]:
        rows = await database.fetch(
            """
            SELECT
                d.id,
                COALESCE(d.title, d.external_id, d.doc_type) AS title,
                d.doc_type,
                d.fetch_url,
                d.published_at,
                s.name AS source_name,
                s.trust_tier,
                LEFT(COALESCE(d.translated_text, d.body_text, d.title, ''), 400) AS excerpt,
                reg.regulator,
                reg.affected_sectors
            FROM core.documents AS d
            JOIN core.sources AS s ON s.id = d.source_id
            LEFT JOIN LATERAL (
                SELECT
                    MAX(lp.regulator) AS regulator,
                    COALESCE(array_remove(array_agg(DISTINCT sector_name), NULL), '{}'::text[]) AS affected_sectors
                FROM core.event_document_links AS edl
                JOIN core.events AS e ON e.id = edl.event_id
                LEFT JOIN lex_pulse.regulatory_events AS lp ON lp.event_id = e.id
                LEFT JOIN LATERAL unnest(lp.affected_sectors) AS sector_name ON TRUE
                WHERE edl.tenant_id = d.tenant_id
                  AND edl.document_id = d.id
            ) AS reg ON TRUE
            WHERE d.tenant_id = $1
              AND d.doc_type = ANY($2::text[])
              AND d.tsv @@ plainto_tsquery('english', $3)
            ORDER BY ts_rank(d.tsv, plainto_tsquery('english', $3)) DESC, d.published_at DESC NULLS LAST
            LIMIT 20
            """,
            tenant_id,
            list(SUPPORTED_DOC_TYPES),
            query_text,
            tenant_id=tenant_id,
        )
        return [self._row_to_evidence(row) for row in rows]

    def _reciprocal_rank_fusion(
        self,
        vector_rows: list[EvidenceDocument],
        bm25_rows: list[EvidenceDocument],
    ) -> list[EvidenceDocument]:
        score_by_document: dict[UUID, float] = {}
        document_by_id: dict[UUID, EvidenceDocument] = {}
        for rows in (vector_rows, bm25_rows):
            for index, document in enumerate(rows, start=1):
                document_by_id[document.document_id] = document
                score_by_document[document.document_id] = score_by_document.get(document.document_id, 0.0) + (
                    1.0 / (60 + index)
                )
        return [
            document_by_id[document_id]
            for document_id, _score in sorted(score_by_document.items(), key=lambda item: item[1], reverse=True)
        ]

    def _build_prompt(self, query_text: str, evidence: list[EvidenceDocument]) -> str:
        source_lines = []
        for index, document in enumerate(evidence, start=1):
            source_lines.append(
                "\n".join(
                    [
                        f"[Source {index}] {document.title}",
                        f"Type: {document.doc_type}",
                        f"Source: {document.source_name}",
                        f"Regulator: {document.regulator or 'unknown'}",
                        f"Affected sectors: {', '.join(document.affected_sectors) or 'unknown'}",
                        f"Excerpt: {document.excerpt}",
                    ]
                )
            )
        return "\n".join(
            [
                "Answer the regulatory question as JSON.",
                (
                    'Return an object with keys: "title", "directAnswer", "whatChanged", '
                    '"whyItMatters", "affectedSectors", "confidence", "citations".'
                ),
                '"whatChanged" must be an array of concise bullets.',
                '"affectedSectors" must be an array of sector labels.',
                '"citations" must be an array of source numbers like [1, 3].',
                f"Question: {query_text}",
                "Use only the supplied sources.",
                *source_lines,
            ]
        )

    def _fallback_answer(self, query_text: str, evidence: list[EvidenceDocument]) -> dict[str, object]:
        if not evidence:
            return {
                "title": "LexPulse evidence pack",
                "directAnswer": "No regulatory documents matched the current query yet.",
                "whatChanged": ["Try a narrower regulator, sector, or instrument type."],
                "whyItMatters": (
                    "The retrieval layer could not produce enough evidence to synthesize a "
                    "reliable answer."
                ),
                "affectedSectors": [],
                "confidence": 0.25,
            }

        lead = evidence[0]
        sector_set = {sector for document in evidence for sector in document.affected_sectors if sector}
        return {
            "title": lead.title,
            "directAnswer": (
                f'{lead.title} is the strongest current match for "{query_text}". '
                f'LexPulse retrieved {len(evidence)} evidence documents from {lead.source_name} and related sources.'
            ),
            "whatChanged": [
                f"{document.doc_type.title()}: {document.title}" for document in evidence[:3]
            ],
            "whyItMatters": (
                "The evidence bundle clusters recent regulatory source documents and should be reviewed before"
                " making operational decisions."
            ),
            "affectedSectors": sorted(sector_set)[:6],
            "confidence": min(0.45 + (0.05 * len(evidence)), 0.8),
        }

    def _coerce_llm_payload(
        self,
        payload: dict[str, object],
        *,
        query_text: str,
        fallback: dict[str, object],
    ) -> dict[str, object]:
        return {
            "title": str(payload.get("title", fallback["title"]))[:160],
            "directAnswer": str(payload.get("directAnswer", fallback["directAnswer"])) or str(fallback["directAnswer"]),
            "whatChanged": self._string_list(payload.get("whatChanged")) or list(fallback["whatChanged"]),
            "whyItMatters": str(payload.get("whyItMatters", fallback["whyItMatters"])) or str(fallback["whyItMatters"]),
            "affectedSectors": self._string_list(payload.get("affectedSectors")) or list(fallback["affectedSectors"]),
            "confidence": self._coerce_confidence(payload.get("confidence"), fallback["confidence"]),
        }

    def _coerce_confidence(self, value: object, fallback: object) -> float:
        try:
            parsed = float(value)
        except (TypeError, ValueError):
            parsed = float(fallback)
        return max(min(parsed, 1.0), 0.0)

    def _string_list(self, value: object) -> list[str]:
        if not isinstance(value, list):
            return []
        return [str(item).strip() for item in value if str(item).strip()]

    def _select_cited_evidence(
        self,
        citations: object,
        evidence: list[EvidenceDocument],
    ) -> list[EvidenceDocument]:
        if not isinstance(citations, list):
            return []

        selected: list[EvidenceDocument] = []
        for item in citations:
            try:
                index = int(item) - 1
            except (TypeError, ValueError):
                continue
            if 0 <= index < len(evidence):
                selected.append(evidence[index])

        deduped: list[EvidenceDocument] = []
        seen_ids: set[UUID] = set()
        for document in selected:
            if document.document_id in seen_ids:
                continue
            deduped.append(document)
            seen_ids.add(document.document_id)
        return deduped

    async def _fetch_documents_by_ids(
        self,
        database: Database,
        *,
        tenant_id: UUID,
        document_ids: list[UUID],
    ) -> list[EvidenceDocument]:
        if not document_ids:
            return []
        rows = await database.fetch(
            """
            SELECT
                d.id,
                COALESCE(d.title, d.external_id, d.doc_type) AS title,
                d.doc_type,
                d.fetch_url,
                d.published_at,
                s.name AS source_name,
                s.trust_tier,
                LEFT(COALESCE(d.translated_text, d.body_text, d.title, ''), 400) AS excerpt,
                reg.regulator,
                reg.affected_sectors
            FROM core.documents AS d
            JOIN core.sources AS s ON s.id = d.source_id
            LEFT JOIN LATERAL (
                SELECT
                    MAX(lp.regulator) AS regulator,
                    COALESCE(array_remove(array_agg(DISTINCT sector_name), NULL), '{}'::text[]) AS affected_sectors
                FROM core.event_document_links AS edl
                JOIN core.events AS e ON e.id = edl.event_id
                LEFT JOIN lex_pulse.regulatory_events AS lp ON lp.event_id = e.id
                LEFT JOIN LATERAL unnest(lp.affected_sectors) AS sector_name ON TRUE
                WHERE edl.tenant_id = d.tenant_id
                  AND edl.document_id = d.id
            ) AS reg ON TRUE
            WHERE d.tenant_id = $1
              AND d.id = ANY($2::uuid[])
            """,
            tenant_id,
            document_ids,
            tenant_id=tenant_id,
        )
        by_id = {document.document_id: document for document in [self._row_to_evidence(row) for row in rows]}
        return [by_id[document_id] for document_id in document_ids if document_id in by_id]

    def _row_to_evidence(self, row: object) -> EvidenceDocument:
        trust_tier = int(row["trust_tier"]) if row["trust_tier"] is not None else 3
        trust_score = {1: 0.98, 2: 0.82, 3: 0.68}.get(trust_tier, 0.65)
        return EvidenceDocument(
            document_id=row["id"],
            title=str(row["title"]),
            doc_type=str(row["doc_type"]),
            fetch_url=row["fetch_url"],
            published_at=row["published_at"],
            source_name=str(row["source_name"]),
            trust_score=trust_score,
            excerpt=str(row["excerpt"] or ""),
            regulator=str(row["regulator"]) if row["regulator"] else None,
            affected_sectors=[str(item) for item in (row["affected_sectors"] or []) if str(item)],
        )
