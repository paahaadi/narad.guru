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

function getApiBaseUrl() {
  const configuredBaseUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configuredBaseUrl) {
    return configuredBaseUrl;
  }
  if (typeof window !== "undefined" && window.location.origin) {
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
  const response = await fetchJson<{ data: any[] }>(
    `/api/v1/entities?${searchParams.toString()}`,
  );
  return response.data.map((item) => ({
    entityId: item.id,
    canonicalName: item.canonical_name,
    entityType: item.entity_type,
    description: "",
    riskScore: item.resolution_confidence ? item.resolution_confidence * 100 : 0,
    healthScore: 100,
    locationLabel: "",
    aliases: item.aliases || [],
    externalIds: item.external_ids || {},
    matchType: "db-exact",
    isResolved: item.is_resolved,
    updatedAt: item.updated_at,
  }));
}

export async function getEntityProfile(entityId: string): Promise<CorpWatchEntityProfile> {
  const response = await fetchJson<{ data: any }>(`/api/v1/entities/${encodeURIComponent(entityId)}`);
  const item = response.data;
  return {
    entityId: item.id,
    canonicalName: item.canonical_name,
    entityType: item.entity_type,
    description: "Detailed entity profile retrieved from canonical index.",
    riskScore: item.resolution_confidence ? item.resolution_confidence * 100 : 0,
    healthScore: 100,
    location: {
      label: "Regulatory Jurisdiction",
      stateCode: null,
      districtCode: null,
      lat: null,
      lon: null,
    },
    aliases: item.aliases || [],
    externalIds: item.external_ids || {},
    corpWatch: {
      sector: "Sector not specified",
      companyStatus: "Active",
      listingStatus: "Unlisted",
      filingCompleteness: 100,
      registeredOffice: "Not available",
      lastFilingDate: item.updated_at,
      directors: [],
      shareholders: [],
      paidUpCapitalInr: null,
      authorizedCapitalInr: null,
      complianceBreachCount: 0,
    },
    recentEvents: [],
    keyRelationships: [],
    narrative: null,
    updatedAt: item.updated_at,
    projectedAt: null,
  };
}

export async function getEntityGraph(entityId: string): Promise<CorpWatchGraphData> {
  const response = await fetchJson<{ data: { nodes: any[]; edges: any[] } }>(
    `/api/v1/entities/${encodeURIComponent(entityId)}/relationships`,
  );
  
  return {
    entityId,
    nodes: response.data.nodes.map((n) => ({
      entityId: n.id,
      name: n.label,
      entityType: n.type,
      riskScore: 50,
      healthScore: 50,
      isCentral: n.id === entityId,
    })),
    edges: response.data.edges.map((e, idx) => ({
      relationshipId: idx.toString(),
      sourceEntityId: e.source,
      targetEntityId: e.target,
      sourceName: "Source",
      targetName: "Target",
      sourceType: "unknown",
      targetType: "unknown",
      relationshipType: e.type,
      confidence: e.attributes?.confidence || 1.0,
      direction: "outbound",
    })),
  };
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
  return fetchJson<CorpWatchFilingListResponse>(
    `/api/corpwatch/${encodeURIComponent(entityId)}/filings${suffix}`,
  );
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
  return fetchJson<CorpWatchEventListResponse>(
    `/api/corpwatch/${encodeURIComponent(entityId)}/events${suffix}`,
  );
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
  return fetchJson<CorpWatchNarrative>(
    `/api/corpwatch/${encodeURIComponent(entityId)}/narrative${suffix}`,
  );
}
