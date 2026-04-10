export type AdminSource = {
  id: string;
  name: string;
  slug: string;
  source_type: string;
  trust_tier: number;
  is_active: boolean;
  documents_ingested_24h: number;
  last_successful_fetch: string | null;
  last_error: string | null;
  health: {
    status: "healthy" | "degraded" | "unhealthy" | "inactive" | "unknown";
    reason: string;
  };
};

export type AdminSourcesSnapshot = {
  sources: AdminSource[];
  total: number;
  active: number;
  healthy: number;
  degraded: number;
  unhealthy: number;
};

export type AdminPipelineStats = {
  summary: {
    dlq_total: number;
    queue_total: number;
  };
};

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

export async function getSources(): Promise<AdminSourcesSnapshot> {
  return fetchJson<AdminSourcesSnapshot>("/api/admin/sources");
}

export async function getPipelineStats(): Promise<AdminPipelineStats> {
  return fetchJson<AdminPipelineStats>("/api/admin/pipeline");
}

export async function triggerSource(sourceId: string): Promise<{ status: string }> {
  return fetchJson<{ status: string }>(`/api/admin/sources/${encodeURIComponent(sourceId)}/trigger`, {
    method: "POST",
  });
}
