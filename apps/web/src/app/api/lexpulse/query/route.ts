import { NextResponse } from "next/server";
import { queryRow, queryRows } from "@/lib/db";
import { asArray, asNumber, asOptionalString, asRecord, asString } from "@/lib/workspaces/shared";
import type { LexPulseAnswer } from "@/lib/workspaces/lexpulse-types";
import { getIntelligenceServiceUrl, requireApiSession, tenantHeaders } from "../_helpers";

type QueryBody = {
  queryText?: unknown;
  forceRefresh?: unknown;
};

type QueryCacheRow = {
  id: string;
  answer: unknown;
  citations: unknown;
  confidence: string | number | null;
};

type EvidenceRow = {
  document_id: string;
  title: string;
  doc_type: string;
  fetch_url: string | null;
  published_at: Date | string | null;
  source_name: string;
  trust_tier: string | number | null;
  excerpt: string | null;
};

function trustScoreFromTier(tier: string | number | null) {
  const value = typeof tier === "number" ? tier : Number(tier);
  switch (value) {
    case 1:
      return 0.98;
    case 2:
      return 0.82;
    case 3:
      return 0.68;
    default:
      return 0.65;
  }
}

function makeLikePattern(queryText: string) {
  const tokens = queryText
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3)
    .slice(0, 4);

  if (tokens.length === 0) {
    return "%";
  }

  return `%${tokens.join("%")}%`;
}

function normalizeAnswerPayload(
  queryText: string,
  answer: Record<string, unknown> | null | undefined,
  evidence: LexPulseAnswer["evidence"],
  cached: boolean,
  cacheId: string | null,
): LexPulseAnswer {
  const title = asString(answer?.title, evidence[0]?.title ?? "LexPulse response");
  const directAnswer = asString(
    answer?.directAnswer,
    evidence.length > 0
      ? `The most relevant current document is ${evidence[0].title} from ${evidence[0].sourceName}.`
      : "No regulatory documents were found for this tenant yet.",
  );

  return {
    cacheId,
    queryText,
    title,
    directAnswer,
    whatChanged: asArray<string>(answer?.whatChanged).filter((item) => typeof item === "string" && item.trim().length > 0),
    whyItMatters: asString(
      answer?.whyItMatters,
      evidence.length > 0
        ? `Review the evidence trail for ${evidence[0].sourceName} to understand the regulatory impact.`
        : "No supporting evidence is available yet.",
    ),
    affectedSectors: asArray<string>(answer?.affectedSectors).filter(
      (item) => typeof item === "string" && item.trim().length > 0,
    ),
    confidence: asNumber(answer?.confidence, evidence.length > 0 ? 0.45 : 0.2),
    cached,
    generatedBy: asString(answer?.generatedBy, cached ? "semantic-cache" : "deterministic-fallback"),
    evidence,
  };
}

async function fetchEvidenceByIds(tenantId: string, documentIds: string[]) {
  const uniqueIds = [...new Set(documentIds)].filter(Boolean);
  if (uniqueIds.length === 0) {
    return [];
  }

  const rows = await queryRows<EvidenceRow>(
    tenantId,
    `
      SELECT
        d.id::text AS document_id,
        COALESCE(d.title, d.external_id, d.doc_type) AS title,
        d.doc_type,
        d.fetch_url,
        d.published_at,
        s.name AS source_name,
        s.trust_tier,
        LEFT(COALESCE(d.translated_text, d.body_text, d.title, ''), 400) AS excerpt
      FROM core.documents AS d
      JOIN core.sources AS s ON s.id = d.source_id
      WHERE d.tenant_id = $1
        AND d.id = ANY($2::uuid[])
    `,
    [tenantId, uniqueIds],
  );

  const byId = new Map(rows.map((row) => [row.document_id, row]));
  return uniqueIds.flatMap((documentId) => {
    const row = byId.get(documentId);
    if (!row) {
      return [];
    }

    return [
      {
        documentId: row.document_id,
        title: asString(row.title, "Document"),
        docType: asString(row.doc_type, "document"),
        fetchUrl: asOptionalString(row.fetch_url),
        publishedAt:
          row.published_at instanceof Date
            ? row.published_at.toISOString()
            : row.published_at
              ? String(row.published_at)
              : null,
        excerpt: asString(row.excerpt, ""),
        sourceName: asString(row.source_name, "Source"),
        trustScore: trustScoreFromTier(row.trust_tier),
        regulator: null,
        affectedSectors: [],
      },
    ];
  });
}

async function buildFallbackEvidence(tenantId: string, queryText: string) {
  const pattern = makeLikePattern(queryText);
  const rows = await queryRows<EvidenceRow>(
    tenantId,
    `
      SELECT
        d.id::text AS document_id,
        COALESCE(d.title, d.external_id, d.doc_type) AS title,
        d.doc_type,
        d.fetch_url,
        d.published_at,
        s.name AS source_name,
        s.trust_tier,
        LEFT(COALESCE(d.translated_text, d.body_text, d.title, ''), 400) AS excerpt
      FROM core.documents AS d
      JOIN core.sources AS s ON s.id = d.source_id
      WHERE d.tenant_id = $1
        AND d.doc_type = ANY($2::text[])
        AND (
          COALESCE(d.title, '') ILIKE $3
          OR COALESCE(d.body_text, '') ILIKE $3
          OR COALESCE(d.translated_text, '') ILIKE $3
        )
      ORDER BY d.published_at DESC NULLS LAST, d.created_at DESC
      LIMIT 5
    `,
    [tenantId, ["gazette", "circular", "order", "bill", "debate", "filing", "report"], pattern],
  );

  if (rows.length > 0) {
    return rows.map((row) => ({
      documentId: row.document_id,
      title: asString(row.title, "Document"),
      docType: asString(row.doc_type, "document"),
      fetchUrl: asOptionalString(row.fetch_url),
      publishedAt:
        row.published_at instanceof Date
          ? row.published_at.toISOString()
          : row.published_at
            ? String(row.published_at)
            : null,
      excerpt: asString(row.excerpt, ""),
      sourceName: asString(row.source_name, "Source"),
      trustScore: trustScoreFromTier(row.trust_tier),
      regulator: null,
      affectedSectors: [],
    }));
  }

  const recentRows = await queryRows<EvidenceRow>(
    tenantId,
    `
      SELECT
        d.id::text AS document_id,
        COALESCE(d.title, d.external_id, d.doc_type) AS title,
        d.doc_type,
        d.fetch_url,
        d.published_at,
        s.name AS source_name,
        s.trust_tier,
        LEFT(COALESCE(d.translated_text, d.body_text, d.title, ''), 400) AS excerpt
      FROM core.documents AS d
      JOIN core.sources AS s ON s.id = d.source_id
      WHERE d.tenant_id = $1
        AND d.doc_type = ANY($2::text[])
      ORDER BY d.published_at DESC NULLS LAST, d.created_at DESC
      LIMIT 5
    `,
    [tenantId, ["gazette", "circular", "order", "bill", "debate", "filing", "report"]],
  );

  return recentRows.map((row) => ({
    documentId: row.document_id,
    title: asString(row.title, "Document"),
    docType: asString(row.doc_type, "document"),
    fetchUrl: asOptionalString(row.fetch_url),
    publishedAt:
      row.published_at instanceof Date
        ? row.published_at.toISOString()
        : row.published_at
          ? String(row.published_at)
          : null,
    excerpt: asString(row.excerpt, ""),
    sourceName: asString(row.source_name, "Source"),
    trustScore: trustScoreFromTier(row.trust_tier),
    regulator: null,
    affectedSectors: [],
  }));
}

export async function POST(request: Request) {
  const session = await requireApiSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: QueryBody;
  try {
    body = (await request.json()) as QueryBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const queryText = asString(body.queryText, "").trim();
  if (!queryText) {
    return NextResponse.json({ error: "queryText is required" }, { status: 400 });
  }

  const forceRefresh = Boolean(body.forceRefresh);

  if (!forceRefresh) {
    const cachedRow = await queryRow<QueryCacheRow>(
      session.tenantId,
      `
        SELECT id, answer, citations, confidence
        FROM lex_pulse.query_cache
        WHERE tenant_id = $1
          AND expires_at > now()
          AND lower(query_text) = lower($2)
        ORDER BY updated_at DESC
        LIMIT 1
      `,
      [session.tenantId, queryText],
    );

    if (cachedRow) {
      const rawAnswer = cachedRow.answer && typeof cachedRow.answer === "object" ? (cachedRow.answer as Record<string, unknown>) : null;
      const citations = asArray<string>(cachedRow.citations).filter((citation) => typeof citation === "string");
      const evidence = await fetchEvidenceByIds(session.tenantId, citations);

      return NextResponse.json(
        normalizeAnswerPayload(
          queryText,
          rawAnswer,
          evidence,
          true,
          cachedRow.id,
        ),
      );
    }
  }

  try {
    const response = await fetch(new URL("/api/lexpulse/query", getIntelligenceServiceUrl()), {
      method: "POST",
      headers: tenantHeaders(session.tenantId),
      body: JSON.stringify({
        queryText,
        forceRefresh,
      }),
    });

    if (response.ok) {
      const payload = (await response.json()) as Record<string, unknown>;
      const answer = asRecord(payload.answer);
      const evidence = asArray<Record<string, unknown>>(payload.evidence).map((document, index) => ({
        documentId: asString(document.documentId, `document-${index}`),
        title: asString(document.title, "Document"),
        docType: asString(document.docType, "document"),
        fetchUrl: asOptionalString(document.fetchUrl),
        publishedAt: asOptionalString(document.publishedAt),
        excerpt: asString(document.excerpt, ""),
        sourceName: asString(document.sourceName, "Source"),
        trustScore: asNumber(document.trustScore, 0.65),
        regulator: asOptionalString(document.regulator),
        affectedSectors: asArray<string>(document.affectedSectors).filter((item) => typeof item === "string"),
      }));

      return NextResponse.json(
        normalizeAnswerPayload(
          asString(payload.queryText, queryText),
          answer,
          evidence,
          Boolean(payload.cached),
          asOptionalString(answer.cacheId),
        ),
      );
    }
  } catch {
    // Fall back to local evidence when the intelligence service is unavailable.
  }

  const evidence = await buildFallbackEvidence(session.tenantId, queryText);
  const answer = normalizeAnswerPayload(queryText, null, evidence, false, null);

  return NextResponse.json({
    ...answer,
    title: answer.title || evidence[0]?.title || "LexPulse response",
    directAnswer:
      evidence.length > 0
        ? `The most relevant current document is ${evidence[0].title} from ${evidence[0].sourceName}.`
        : "No regulatory documents were found for this tenant yet.",
    whatChanged:
      evidence.length > 0 ? evidence.slice(0, 3).map((item) => `${item.docType}: ${item.title}`) : [],
    whyItMatters:
      evidence.length > 0
        ? `Review the linked evidence for ${evidence[0].sourceName} to understand the regulatory impact.`
        : "No supporting evidence is available yet.",
    affectedSectors: [],
    confidence: evidence.length > 0 ? 0.45 : 0.2,
    cached: false,
    generatedBy: "deterministic-fallback",
    evidence,
  } satisfies LexPulseAnswer);
}
