import { queryRows, queryRow } from "@/lib/db";

export type SourceSummary = {
  id: string;
  name: string;
  slug: string;
  sourceType: string;
  trustTier: number;
  authorityLevel: string;
  isActive: boolean;
  governanceApproved: boolean;
  status: string;
  consecutiveFailures: number;
  lastPolledAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  documentsFetchedTotal: number;
  eventsProducedTotal: number;
  updateCadenceSeconds: number | null;
};

export type SourceDetail = SourceSummary & {
  baseUrl: string | null;
  config: Record<string, unknown>;
  recentDocumentCount: number;
  recentEventCount: number;
};

type SourceRow = {
  id: string;
  name: string;
  slug: string;
  source_type: string;
  trust_tier: number;
  authority_level: string;
  is_active: boolean;
  governance_approved: boolean;
  status: string;
  consecutive_failures: number;
  last_polled_at: Date | null;
  last_success_at: Date | null;
  last_error: string | null;
  documents_fetched_total: string;
  events_produced_total: string;
  update_cadence_seconds: number | null;
};

type SourceDetailRow = SourceRow & {
  base_url: string | null;
  config: Record<string, unknown>;
  recent_document_count: string;
  recent_event_count: string;
};

function normalizeSource(row: SourceRow): SourceSummary {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    sourceType: row.source_type,
    trustTier: row.trust_tier,
    authorityLevel: row.authority_level,
    isActive: row.is_active,
    governanceApproved: row.governance_approved,
    status: row.status,
    consecutiveFailures: row.consecutive_failures,
    lastPolledAt: row.last_polled_at?.toISOString() ?? null,
    lastSuccessAt: row.last_success_at?.toISOString() ?? null,
    lastError: row.last_error,
    documentsFetchedTotal: Number(row.documents_fetched_total),
    eventsProducedTotal: Number(row.events_produced_total),
    updateCadenceSeconds: row.update_cadence_seconds,
  };
}

export async function listSources(tenantId: string): Promise<SourceSummary[]> {
  const rows = await queryRows<SourceRow>(
    tenantId,
    `
      SELECT
        id::text, name, slug, source_type, trust_tier, authority_level,
        is_active, governance_approved, status, consecutive_failures,
        last_polled_at, last_success_at, last_error,
        documents_fetched_total, events_produced_total,
        update_cadence_seconds
      FROM core.sources
      WHERE tenant_id = $1
      ORDER BY trust_tier ASC, name ASC
    `,
    [tenantId],
  );
  return rows.map(normalizeSource);
}

export async function getSourceBySlug(
  tenantId: string,
  slug: string,
): Promise<SourceDetail | null> {
  const row = await queryRow<SourceDetailRow>(
    tenantId,
    `
      SELECT
        s.id::text, s.name, s.slug, s.source_type, s.trust_tier,
        s.authority_level, s.is_active, s.governance_approved,
        s.status, s.consecutive_failures,
        s.last_polled_at, s.last_success_at, s.last_error,
        s.documents_fetched_total, s.events_produced_total,
        s.update_cadence_seconds, s.base_url, s.config,
        (SELECT COUNT(*) FROM core.documents d
         WHERE d.source_id = s.id AND d.created_at > now() - interval '24 hours'
        ) AS recent_document_count,
        (SELECT COUNT(*) FROM core.events e
         WHERE e.primary_source_id = s.id AND e.created_at > now() - interval '24 hours'
        ) AS recent_event_count
      FROM core.sources AS s
      WHERE s.tenant_id = $1 AND s.slug = $2
    `,
    [tenantId, slug],
  );
  if (!row) return null;
  return {
    ...normalizeSource(row),
    baseUrl: row.base_url,
    config: row.config ?? {},
    recentDocumentCount: Number(row.recent_document_count),
    recentEventCount: Number(row.recent_event_count),
  };
}
