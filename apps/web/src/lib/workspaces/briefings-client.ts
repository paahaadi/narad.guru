"use client";

import type {
  BriefingSummary,
  BriefingDetail,
  BriefingVersion,
  BriefingSection,
  BriefingMetrics,
} from "./briefings";

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, credentials: "include" });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function fetchBriefings(options?: { status?: string; audience?: string; limit?: number; offset?: number }) {
  const params = new URLSearchParams();
  if (options?.status) params.set("status", options.status);
  if (options?.audience) params.set("audience", options.audience);
  if (options?.limit) params.set("limit", String(options.limit));
  if (options?.offset) params.set("offset", String(options.offset));
  const qs = params.toString();
  return apiFetch<{ items: BriefingSummary[]; total: number }>(`/api/briefings${qs ? `?${qs}` : ""}`);
}

export async function fetchBriefing(id: string) {
  return apiFetch<BriefingDetail>(`/api/briefings/${id}`);
}

export async function createBriefing(body: { title: string; audience?: string }) {
  return apiFetch<BriefingDetail>("/api/briefings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function updateBriefing(id: string, body: { title?: string; audience?: string; status?: string }) {
  return apiFetch<BriefingDetail>(`/api/briefings/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function fetchBriefingVersions(id: string) {
  return apiFetch<{ items: BriefingVersion[] }>(`/api/briefings/${id}/versions`);
}

export async function createBriefingVersion(
  id: string,
  body: {
    sections: BriefingSection[];
    sourceInvestigationIds?: string[];
    sourceEventIds?: string[];
    sourceWatchlistIds?: string[];
    aiDraftModel?: string;
  },
) {
  return apiFetch<BriefingVersion>(`/api/briefings/${id}/versions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function approveBriefing(id: string) {
  return apiFetch<BriefingDetail>(`/api/briefings/${id}/approve`, { method: "POST" });
}

export async function publishBriefing(id: string) {
  return apiFetch<BriefingDetail>(`/api/briefings/${id}/publish`, { method: "POST" });
}

export async function supersedeBriefing(id: string) {
  return apiFetch<BriefingDetail>(`/api/briefings/${id}/supersede`, { method: "POST" });
}

export async function fetchBriefingMetrics() {
  return apiFetch<BriefingMetrics>("/api/briefings/metrics");
}
