import { NextResponse } from "next/server";
import { queryRows } from "@/lib/db";
import { asArray, asNumber, asOptionalString, asRecord, asString, normalizeSeverity } from "@/lib/workspaces/shared";
import type { LexPulseDigestsResponse } from "@/lib/workspaces/lexpulse-types";
import { requireApiSession } from "../_helpers";

type DigestRow = {
  digest_id: string;
  event_id: string;
  digest: unknown;
  effective_date: Date | string | null;
  projected_at: Date | string | null;
};

type DocumentRow = {
  document_id: string;
  title: string;
  doc_type: string;
  fetch_url: string | null;
  published_at: Date | string | null;
  source_name: string;
  trust_tier: string | number | null;
  excerpt: string | null;
};

function regulatorLabel(value: unknown) {
  if (typeof value === "string" && value.trim()) {
    return value;
  }
  const record = asRecord(value);
  return asString(record.name, "Regulatory desk");
}

function splitChangeBullets(value: unknown, claimTexts: string[]) {
  const directValue = asOptionalString(value);
  const candidate = directValue
    ? directValue
        .split(/(?:\n+|(?<=[.;])\s+)/)
        .map((part) => part.trim())
        .filter(Boolean)
    : [];

  if (candidate.length > 0) {
    return candidate.slice(0, 4);
  }

  return claimTexts.slice(0, 4);
}

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

async function loadEvidenceMap(sessionTenantId: string, rows: DigestRow[]) {
  const documentIds = [
    ...new Set(
      rows.flatMap((row) => {
        const digest = asRecord(row.digest);
        return asArray<Record<string, unknown>>(digest.documents)
          .map((document) => asOptionalString(document.document_id))
          .filter((item): item is string => Boolean(item));
      }),
    ),
  ];

  if (documentIds.length === 0) {
    return new Map<string, DocumentRow>();
  }

  const documents = await queryRows<DocumentRow>(
    sessionTenantId,
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
    [sessionTenantId, documentIds],
  );

  return new Map(documents.map((row) => [row.document_id, row]));
}

function toEvidence(row: DocumentRow, regulator: string, affectedSectors: string[]) {
  return {
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
    regulator,
    affectedSectors,
  };
}

export async function GET(request: Request) {
  const session = await requireApiSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 20), 1), 50);
  const offset = Math.max(Number(url.searchParams.get("offset") ?? 0), 0);

  const [rows, totalRow] = await Promise.all([
    queryRows<DigestRow>(
      session.tenantId,
      `
        SELECT
          event_id::text AS digest_id,
          event_id::text,
          digest,
          effective_date,
          projected_at
        FROM projections.regulatory_digest
        WHERE tenant_id = $1
        ORDER BY COALESCE(effective_date::timestamp, projected_at) DESC, projected_at DESC
        LIMIT $2 OFFSET $3
      `,
      [session.tenantId, limit, offset],
    ),
    queryRows<{ total: string | number }>(
      session.tenantId,
      `
        SELECT COUNT(*)::int AS total
        FROM projections.regulatory_digest
        WHERE tenant_id = $1
      `,
      [session.tenantId],
    ),
  ]);

  const evidenceMap = await loadEvidenceMap(session.tenantId, rows);

  const items = rows.map((row) => {
    const digest = asRecord(row.digest);
    const lexPulse = asRecord(digest.lex_pulse);
    const claimTexts = asArray<Record<string, unknown>>(digest.key_claims)
      .map((claim) => asString(claim.claim_text, ""))
      .filter(Boolean)
      .map((claim) => claim.trim());
    const affectedSectors = asArray<string>(lexPulse.affected_sectors).filter(
      (item) => typeof item === "string" && item.trim().length > 0,
    );
    const regulator = regulatorLabel(digest.regulator);
    const evidenceDocuments = asArray<Record<string, unknown>>(digest.documents)
      .map((document, index) => {
        const documentId = asOptionalString(document.document_id);
        const source = documentId ? evidenceMap.get(documentId) : null;
        if (!source) {
          return null;
        }
        return toEvidence(source, regulator, affectedSectors);
      })
      .filter((item): item is ReturnType<typeof toEvidence> => Boolean(item))
      .slice(0, 4);

    return {
      digestId: row.digest_id,
      eventId: row.event_id,
      title: asString(digest.title, "Regulatory digest"),
      severity: normalizeSeverity(digest.severity),
      regulatorLabel: regulator,
      effectiveDate: asOptionalString(digest.effective_date) ?? (row.effective_date instanceof Date ? row.effective_date.toISOString() : row.effective_date ? String(row.effective_date) : null),
      summary: asString(digest.summary, ""),
      whatChanged: splitChangeBullets(lexPulse.what_changed, claimTexts),
      whyItMatters: asString(lexPulse.why_it_matters, asString(digest.summary, "")),
      affectedSectors,
      evidence: evidenceDocuments,
      affectedEntities: asArray<Record<string, unknown>>(digest.affected_entities).map((entity) => ({
        name: asString(entity.name, "Entity"),
        role: asString(entity.role, "mentioned"),
      })),
      updatedAt:
        row.projected_at instanceof Date
          ? row.projected_at.toISOString()
          : row.projected_at
            ? String(row.projected_at)
            : null,
    };
  });

  return NextResponse.json({
    items,
    total: asNumber(totalRow[0]?.total),
    limit,
    offset,
  } satisfies LexPulseDigestsResponse);
}
