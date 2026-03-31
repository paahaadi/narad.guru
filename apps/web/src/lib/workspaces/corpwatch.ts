import {
  asArray,
  asNumber,
  asOptionalString,
  asRecord,
  asString,
  formatMetric,
  normalizeSeverity,
  safeQueryRow,
  safeQueryRows,
} from "@/lib/workspaces/shared";
import type {
  CorpWatchEntityProfile,
  CorpWatchEventListResponse,
  CorpWatchFilingListResponse,
  CorpWatchGraphData,
  CorpWatchGraphResponse,
  CorpWatchNarrative,
  CorpWatchSearchResponse,
  CorpWatchSearchResult,
} from "@/lib/workspaces/corpwatch-types";

type CorpWatchRelationship = {
  entityId: string;
  name: string;
  relationshipType: string;
};

type CorpWatchEvent = {
  eventId: string;
  title: string;
  severity: "critical" | "high" | "medium" | "low" | "informational";
  occurredAt: string | null;
};

type CorpWatchEntityCard = {
  entityId: string;
  name: string;
  entityType: string;
  description: string;
  locationLabel: string;
  riskScore: number;
  healthScore: number;
  eventCount: number;
  relationshipCount: number;
  aliases: string[];
  externalIds: Array<{ label: string; value: string }>;
  companyStatus: string;
  sector: string;
  filingCompleteness: number;
  lastFilingDate: string | null;
  updatedAt: string | null;
  recentEvents: CorpWatchEvent[];
  keyRelationships: CorpWatchRelationship[];
};

export type CorpWatchWorkspaceData = {
  isFallback: boolean;
  metrics: Array<{ label: string; value: string; accent?: string; meta?: string }>;
  featured: CorpWatchEntityCard;
  trackedEntities: CorpWatchEntityCard[];
};

type EntitySummaryRow = {
  entity_id: string;
  summary: unknown;
  projected_at: Date;
};

function buildFallbackEntity(): CorpWatchEntityCard {
  return {
    entityId: "staged-corpwatch",
    name: "CorpWatch projection queue",
    entityType: "company",
    description:
      "Entity summaries have not been projected for this tenant yet. The route is live and ready to absorb entity risk, filing, and relationship data as soon as the read model warms up.",
    locationLabel: "Awaiting resolved entity geography",
    riskScore: 0,
    healthScore: 0,
    eventCount: 0,
    relationshipCount: 0,
    aliases: [],
    externalIds: [],
    companyStatus: "Projection pending",
    sector: "Pending enrichment",
    filingCompleteness: 0,
    lastFilingDate: null,
    updatedAt: null,
    recentEvents: [
      {
        eventId: "staged-event",
        title: "No entity-linked event stream has been projected yet.",
        severity: "informational",
        occurredAt: null,
      },
    ],
    keyRelationships: [
      {
        entityId: "staged-link",
        name: "Relationship graph activates when entity_summaries arrives",
        relationshipType: "projection",
      },
    ],
  };
}

function fromProjection(row: EntitySummaryRow): CorpWatchEntityCard {
  const summary = asRecord(row.summary);
  const location = asRecord(summary.location);
  const corpWatch = asRecord(summary.corp_watch);
  const recentEvents = asArray<Record<string, unknown>>(summary.recent_events).slice(0, 5);
  const keyRelationships = asArray<Record<string, unknown>>(summary.key_relationships).slice(0, 6);
  const externalIds = asRecord(summary.external_ids);

  return {
    entityId: asString(summary.entity_id, row.entity_id),
    name: asString(summary.canonical_name, "Unnamed entity"),
    entityType: asString(summary.entity_type, "entity"),
    description: asString(
      summary.description,
      "Entity profile is projected but still waiting for descriptive enrichment.",
    ),
    locationLabel: (() => {
      const projectedLabel = asOptionalString(location.label);
      if (projectedLabel) {
        return projectedLabel;
      }

      const fallbackLabel = [
        asOptionalString(location.state_code),
        asOptionalString(summary.entity_type),
      ]
        .filter(Boolean)
        .join(" • ");

      return fallbackLabel || "Location pending";
    })(),
    riskScore: asNumber(summary.risk_score),
    healthScore: asNumber(summary.health_score),
    eventCount: asNumber(summary.event_count),
    relationshipCount: asNumber(summary.relationship_count),
    aliases: asArray<string>(summary.aliases).slice(0, 3).filter((alias) => typeof alias === "string"),
    externalIds: Object.entries(externalIds)
      .filter(([, value]) => typeof value === "string" && value.length > 0)
      .slice(0, 3)
      .map(([label, value]) => ({ label: label.toUpperCase(), value: value as string })),
    companyStatus: asString(corpWatch.company_status, "Observed"),
    sector: asString(corpWatch.sector, "Cross-sector"),
    filingCompleteness: asNumber(corpWatch.filing_completeness),
    lastFilingDate: asOptionalString(corpWatch.last_filing_date),
    updatedAt: asOptionalString(summary.updated_at) ?? row.projected_at.toISOString(),
    recentEvents: recentEvents.map((event, index) => ({
      eventId: asString(event.event_id, `projection-event-${index}`),
      title: asString(event.title, "Linked event"),
      severity: normalizeSeverity(event.severity),
      occurredAt: asOptionalString(event.occurred_at),
    })),
    keyRelationships: keyRelationships.map((relationship, index) => ({
      entityId: asString(relationship.target_entity_id, `relationship-${index}`),
      name: asString(relationship.target_name, "Connected entity"),
      relationshipType: asString(relationship.relationship_type, "related"),
    })),
  };
}

type FallbackEntityRow = {
  entity_id: string;
  canonical_name: string;
  entity_type: string;
  description: string | null;
  state_code: string | null;
  district_code: string | null;
  risk_score: string | number | null;
  health_score: string | number | null;
  external_ids: unknown;
  updated_at: Date;
};

async function buildFallbackEntities(tenantId: string) {
  const entities = await safeQueryRows<FallbackEntityRow>(
    tenantId,
    `
      SELECT
        e.id::text AS entity_id,
        e.canonical_name,
        e.entity_type,
        e.description,
        e.state_code,
        e.district_code,
        e.risk_score,
        e.health_score,
        e.external_ids,
        e.updated_at
      FROM core.entities AS e
      WHERE e.tenant_id = $1
      ORDER BY COALESCE(e.risk_score, 0) DESC, e.updated_at DESC
      LIMIT 6
    `,
    [tenantId],
  );

  if (entities.length === 0) {
    return [buildFallbackEntity()];
  }

  const result: CorpWatchEntityCard[] = [];
  for (const entity of entities) {
    const relationships = await safeQueryRows<{
      target_entity_id: string;
      target_name: string;
      relationship_type: string;
    }>(
      tenantId,
      `
        SELECT
          r.target_entity_id::text,
          te.canonical_name AS target_name,
          r.relationship_type
        FROM core.relationships AS r
        JOIN core.entities AS te ON te.id = r.target_entity_id
        WHERE r.tenant_id = $1
          AND r.source_entity_id = $2::uuid
        ORDER BY r.confidence DESC, r.updated_at DESC
        LIMIT 6
      `,
      [tenantId, entity.entity_id],
    );

    const recentEvents = await safeQueryRows<{
      event_id: string;
      title: string;
      severity: string;
      occurred_at: Date | null;
    }>(
      tenantId,
      `
        SELECT
          e.id::text AS event_id,
          e.title,
          e.severity,
          COALESCE(e.occurred_at, e.created_at) AS occurred_at
        FROM core.event_entity_links AS eel
        JOIN core.events AS e ON e.id = eel.event_id
        WHERE eel.tenant_id = $1
          AND eel.entity_id = $2::uuid
        ORDER BY COALESCE(e.occurred_at, e.created_at) DESC
        LIMIT 5
      `,
      [tenantId, entity.entity_id],
    );

    const externalIds = asRecord(entity.external_ids);
    result.push({
      entityId: entity.entity_id,
      name: entity.canonical_name,
      entityType: entity.entity_type,
      description:
        entity.description ??
        "CorpWatch is sourcing the entity shell directly from core entities while summary projections catch up.",
      locationLabel: [entity.district_code, entity.state_code].filter(Boolean).join(", ") || "Location pending",
      riskScore: asNumber(entity.risk_score),
      healthScore: asNumber(entity.health_score),
      eventCount: recentEvents.length,
      relationshipCount: relationships.length,
      aliases: [],
      externalIds: Object.entries(externalIds)
        .filter(([, value]) => typeof value === "string" && value.length > 0)
        .slice(0, 3)
        .map(([label, value]) => ({ label: label.toUpperCase(), value: value as string })),
      companyStatus: "Direct core read",
      sector: "Awaiting corp_watch enrichment",
      filingCompleteness: 0,
      lastFilingDate: null,
      updatedAt: entity.updated_at.toISOString(),
      recentEvents: recentEvents.map((event) => ({
        eventId: event.event_id,
        title: event.title,
        severity: normalizeSeverity(event.severity),
        occurredAt: event.occurred_at?.toISOString() ?? null,
      })),
      keyRelationships: relationships.map((relationship) => ({
        entityId: relationship.target_entity_id,
        name: relationship.target_name,
        relationshipType: relationship.relationship_type,
      })),
    });
  }

  return result;
}

export async function getCorpWatchWorkspaceData(tenantId: string): Promise<CorpWatchWorkspaceData> {
  const metricRow = await safeQueryRow<{
    total_entities: string | number;
    high_risk_entities: string | number;
    linked_events: string | number;
    relationship_total: string | number;
  }>(
    tenantId,
    `
      SELECT
        COUNT(*) AS total_entities,
        COUNT(*) FILTER (
          WHERE COALESCE(NULLIF(summary->>'risk_score', '')::numeric, 0) >= 70
        ) AS high_risk_entities,
        COALESCE(SUM(COALESCE(NULLIF(summary->>'event_count', '')::integer, 0)), 0) AS linked_events,
        COALESCE(SUM(COALESCE(NULLIF(summary->>'relationship_count', '')::integer, 0)), 0) AS relationship_total
      FROM projections.entity_summaries
      WHERE tenant_id = $1
    `,
    [tenantId],
  );

  const summaryRows = await safeQueryRows<EntitySummaryRow>(
    tenantId,
    `
      SELECT entity_id::text, summary, projected_at
      FROM projections.entity_summaries
      WHERE tenant_id = $1
      ORDER BY
        COALESCE(NULLIF(summary->>'risk_score', '')::numeric, 0) DESC,
        COALESCE(NULLIF(summary->>'event_count', '')::integer, 0) DESC,
        projected_at DESC
      LIMIT 6
    `,
    [tenantId],
  );

  const trackedEntities = summaryRows.length > 0 ? summaryRows.map(fromProjection) : await buildFallbackEntities(tenantId);
  const featured = trackedEntities[0] ?? buildFallbackEntity();
  const isFallback = summaryRows.length === 0;

  const metrics = [
    {
      label: "Monitored entities",
      value: formatMetric(summaryRows.length > 0 ? asNumber(metricRow?.total_entities) : trackedEntities.length),
    },
    {
      label: "High risk cluster",
      value: formatMetric(
        summaryRows.length > 0
          ? asNumber(metricRow?.high_risk_entities)
          : trackedEntities.filter((entity) => entity.riskScore >= 70).length,
      ),
      accent: "accent-red",
      meta: isFallback ? "core entities fallback" : "projection ranked",
    },
    {
      label: "Linked events",
      value: formatMetric(
        summaryRows.length > 0
          ? asNumber(metricRow?.linked_events)
          : trackedEntities.reduce((total, entity) => total + entity.eventCount, 0),
      ),
      accent: "accent-orange",
      meta: "entity-tied signals",
    },
    {
      label: "Relationship load",
      value: formatMetric(
        summaryRows.length > 0
          ? asNumber(metricRow?.relationship_total)
          : trackedEntities.reduce((total, entity) => total + entity.relationshipCount, 0),
      ),
      meta: "key graph edges",
    },
    {
      label: "Featured risk score",
      value: featured.riskScore > 0 ? `${Math.round(featured.riskScore)}` : "warming",
      accent: featured.riskScore >= 70 ? "accent-red" : featured.riskScore > 0 ? "accent-orange" : undefined,
      meta: featured.name,
    },
  ];

  return {
    isFallback,
    metrics,
    featured,
    trackedEntities,
  };
}

function getApiBaseUrl() {
  const configuredBaseUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configuredBaseUrl) {
    return configuredBaseUrl;
  }
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return "http://localhost:3000";
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(new URL(path, getApiBaseUrl()), {
    credentials: "include",
    ...init,
  });
  if (!response.ok) {
    throw new Error(`Request failed for ${path}: ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function searchEntities(
  query: string,
  options: { limit?: number } = {},
): Promise<CorpWatchSearchResult[]> {
  const searchParams = new URLSearchParams({ q: query });
  if (options.limit) {
    searchParams.set("limit", String(options.limit));
  }
  const response = await fetchJson<CorpWatchSearchResponse>(`/api/corpwatch/search?${searchParams.toString()}`);
  return response.items;
}

export async function getEntityProfile(entityId: string): Promise<CorpWatchEntityProfile> {
  return fetchJson<CorpWatchEntityProfile>(`/api/corpwatch/${encodeURIComponent(entityId)}`);
}

export async function getEntityGraph(entityId: string): Promise<CorpWatchGraphData> {
  return fetchJson<CorpWatchGraphResponse>(`/api/corpwatch/${encodeURIComponent(entityId)}/graph`);
}

export async function getEntityFilings(
  entityId: string,
  options: { limit?: number; offset?: number } = {},
): Promise<CorpWatchFilingListResponse> {
  const searchParams = new URLSearchParams();
  if (options.limit) {
    searchParams.set("limit", String(options.limit));
  }
  if (options.offset) {
    searchParams.set("offset", String(options.offset));
  }
  const suffix = searchParams.toString() ? `?${searchParams.toString()}` : "";
  return fetchJson<CorpWatchFilingListResponse>(`/api/corpwatch/${encodeURIComponent(entityId)}/filings${suffix}`);
}

export async function getEntityEvents(
  entityId: string,
  options: { limit?: number; offset?: number } = {},
): Promise<CorpWatchEventListResponse> {
  const searchParams = new URLSearchParams();
  if (options.limit) {
    searchParams.set("limit", String(options.limit));
  }
  if (options.offset) {
    searchParams.set("offset", String(options.offset));
  }
  const suffix = searchParams.toString() ? `?${searchParams.toString()}` : "";
  return fetchJson<CorpWatchEventListResponse>(`/api/corpwatch/${encodeURIComponent(entityId)}/events${suffix}`);
}

export async function getEntityNarrative(
  entityId: string,
  options: { forceRefresh?: boolean } = {},
): Promise<CorpWatchNarrative> {
  const searchParams = new URLSearchParams();
  if (options.forceRefresh) {
    searchParams.set("forceRefresh", "true");
  }
  const suffix = searchParams.toString() ? `?${searchParams.toString()}` : "";
  return fetchJson<CorpWatchNarrative>(`/api/corpwatch/${encodeURIComponent(entityId)}/narrative${suffix}`);
}
