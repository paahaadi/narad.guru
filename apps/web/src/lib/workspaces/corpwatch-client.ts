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
  const response = await fetchJson<CorpWatchSearchResponse>(
    `/api/corpwatch/search?${searchParams.toString()}`,
  );
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
