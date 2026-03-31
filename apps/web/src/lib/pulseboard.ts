import { queryRow, queryRows } from "@/lib/db";

export type PulseboardCard = {
  eventId: string;
  title: string;
  summary: string;
  severity: "critical" | "high" | "medium" | "low" | "informational";
  confidence: number;
  sourceTrustTier: number;
  sourceCount: number;
  placeLabel: string | null;
  eventTimestamp: string;
  linkedEntities: string[];
};

export type PulseboardEvidenceItem = {
  documentId: string;
  title: string | null;
  docType: string;
  linkType: string;
  publishedAt: string | null;
  fetchUrl: string | null;
};

export type PulseboardEventDetail = PulseboardCard & {
  eventType: string;
  status: string;
  keyFacts: string[];
  evidenceBundle: Record<string, unknown>;
  primarySourceName: string | null;
  evidenceItems: PulseboardEvidenceItem[];
};

type PulseboardFeedRow = {
  event_id: string;
  card: Record<string, unknown>;
};

type PulseboardEventRow = {
  event_id: string;
  title: string;
  summary: string | null;
  event_type: string;
  severity: PulseboardCard["severity"];
  confidence: number | string;
  status: string;
  source_count: number;
  state_code: string | null;
  district_code: string | null;
  occurred_at: Date | string;
  primary_source_name: string | null;
  primary_source_trust_tier: number | null;
  key_facts: unknown;
  evidence_bundle: unknown;
};

type PulseboardEvidenceRow = {
  document_id: string;
  title: string | null;
  doc_type: string;
  link_type: string;
  published_at: Date | string | null;
  fetch_url: string | null;
};

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function normalizePulseboardCard(raw: Record<string, unknown>, fallbackEventId: string): PulseboardCard {
  return {
    eventId: typeof raw.event_id === "string" ? raw.event_id : fallbackEventId,
    title: typeof raw.title === "string" ? raw.title : "Untitled event",
    summary: typeof raw.summary === "string" ? raw.summary : "Awaiting synthesized summary.",
    severity:
      raw.severity === "critical" ||
      raw.severity === "high" ||
      raw.severity === "medium" ||
      raw.severity === "low" ||
      raw.severity === "informational"
        ? raw.severity
        : "medium",
    confidence: typeof raw.confidence === "number" ? raw.confidence : Number(raw.confidence ?? 0),
    sourceTrustTier:
      typeof raw.source_trust_tier === "number"
        ? raw.source_trust_tier
        : Number(raw.source_trust_tier ?? 1),
    sourceCount:
      typeof raw.source_count === "number" ? raw.source_count : Number(raw.source_count ?? 1),
    placeLabel: typeof raw.place_label === "string" ? raw.place_label : null,
    eventTimestamp:
      typeof raw.event_timestamp === "string"
        ? raw.event_timestamp
        : new Date().toISOString(),
    linkedEntities: asStringArray(raw.linked_entities),
  };
}

export async function listPulseboardCards(tenantId: string, limit = 24) {
  const rows = await queryRows<PulseboardFeedRow>(
    tenantId,
    `
      SELECT event_id::text AS event_id, card
      FROM projections.pulseboard_feed
      WHERE tenant_id = $1
      ORDER BY severity_rank ASC, occurred_at DESC
      LIMIT $2
    `,
    [tenantId, limit],
  );

  return rows.map((row) => normalizePulseboardCard(row.card, row.event_id));
}

export async function getPulseboardEventDetail(tenantId: string, eventId: string) {
  const row = await queryRow<PulseboardEventRow>(
    tenantId,
    `
      SELECT
        e.id::text AS event_id,
        e.title,
        COALESCE(sc.explanation, e.summary, e.title) AS summary,
        e.event_type,
        e.severity,
        e.confidence,
        e.status,
        e.source_count,
        e.state_code,
        e.district_code,
        COALESCE(e.occurred_at, e.created_at) AS occurred_at,
        s.name AS primary_source_name,
        s.trust_tier AS primary_source_trust_tier,
        COALESCE(sc.key_facts, '[]'::jsonb) AS key_facts,
        COALESCE(sc.evidence_bundle, '{}'::jsonb) AS evidence_bundle
      FROM core.events AS e
      LEFT JOIN core.story_capsules AS sc ON sc.id = e.story_capsule_id
      LEFT JOIN core.sources AS s ON s.id = e.primary_source_id
      WHERE e.tenant_id = $1 AND e.id = $2::uuid
    `,
    [tenantId, eventId],
  );

  if (!row) {
    return null;
  }

  const evidenceRows = await queryRows<PulseboardEvidenceRow>(
    tenantId,
    `
      SELECT
        d.id::text AS document_id,
        d.title,
        d.doc_type,
        l.link_type,
        d.published_at,
        d.fetch_url
      FROM core.event_document_links AS l
      JOIN core.documents AS d ON d.id = l.document_id
      WHERE l.tenant_id = $1 AND l.event_id = $2::uuid
      ORDER BY d.published_at DESC NULLS LAST, d.created_at DESC
      LIMIT 8
    `,
    [tenantId, eventId],
  );

  const detail = normalizePulseboardCard(
    {
      event_id: row.event_id,
      title: row.title,
      summary: row.summary,
      severity: row.severity,
      confidence: Number(row.confidence),
      source_trust_tier: row.primary_source_trust_tier ?? 1,
      source_count: row.source_count,
      place_label:
        row.district_code && row.state_code
          ? `${row.district_code}, ${row.state_code}`
          : row.district_code ?? row.state_code,
      event_timestamp:
        typeof row.occurred_at === "string" ? row.occurred_at : row.occurred_at.toISOString(),
      linked_entities: [],
    },
    row.event_id,
  );

  return {
    ...detail,
    eventType: row.event_type,
    status: row.status,
    keyFacts: asStringArray(row.key_facts),
    evidenceBundle:
      typeof row.evidence_bundle === "object" && row.evidence_bundle
        ? (row.evidence_bundle as Record<string, unknown>)
        : {},
    primarySourceName: row.primary_source_name,
    evidenceItems: evidenceRows.map((item) => ({
      documentId: item.document_id,
      title: item.title,
      docType: item.doc_type,
      linkType: item.link_type,
      publishedAt:
        typeof item.published_at === "string"
          ? item.published_at
          : item.published_at?.toISOString() ?? null,
      fetchUrl: item.fetch_url,
    })),
  } satisfies PulseboardEventDetail;
}
