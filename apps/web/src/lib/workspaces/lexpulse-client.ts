import type { LexPulseEvidence } from "@/lib/workspaces/lexpulse";
import type {
  LexPulseAnswer,
  LexPulseDigestsResponse,
  LexPulseFeedback,
  LexPulseQueryRequest,
  LexPulseQueryResponse,
  LexPulseSectorForecast,
  LexPulseSectorsResponse,
  LexPulseWatchlist,
  LexPulseWatchlistsResponse,
} from "@/lib/workspaces/lexpulse-types";

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

export async function queryRegulatory(
  payload: LexPulseQueryRequest,
): Promise<LexPulseAnswer> {
  return fetchJson<LexPulseQueryResponse>("/api/lexpulse/query", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      queryText: payload.queryText,
      forceRefresh: payload.forceRefresh ?? false,
    }),
  });
}

export async function getWatchlists(): Promise<LexPulseWatchlist[]> {
  const response = await fetchJson<LexPulseWatchlistsResponse>("/api/lexpulse/watchlists");
  return response.items;
}

export async function getDigests(
  options: { limit?: number; offset?: number } = {},
): Promise<LexPulseDigestsResponse> {
  const searchParams = new URLSearchParams();
  if (options.limit) {
    searchParams.set("limit", String(options.limit));
  }
  if (options.offset) {
    searchParams.set("offset", String(options.offset));
  }
  const suffix = searchParams.toString() ? `?${searchParams.toString()}` : "";
  return fetchJson<LexPulseDigestsResponse>(`/api/lexpulse/digests${suffix}`);
}

export async function getDigest(
  digestId: string,
): Promise<LexPulseDigestsResponse["items"][number]> {
  return fetchJson<LexPulseDigestsResponse["items"][number]>(
    `/api/lexpulse/digests/${encodeURIComponent(digestId)}`,
  );
}

export async function getSectorForecasts(): Promise<LexPulseSectorForecast[]> {
  const response = await fetchJson<LexPulseSectorsResponse>("/api/lexpulse/sectors");
  return response.items;
}

export async function submitFeedback(payload: {
  queryCacheId: string;
  rating: "up" | "down";
}): Promise<LexPulseFeedback> {
  return fetchJson<LexPulseFeedback>("/api/lexpulse/feedback", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export type { LexPulseEvidence };
