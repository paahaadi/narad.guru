"use client";

import type { Watchlist, WatchlistAlert, WatchlistMetrics, WatchlistRule } from "./watchlists";

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, credentials: "include" });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function fetchWatchlistMetrics() {
  return apiFetch<WatchlistMetrics>("/api/watchlists/metrics");
}

export async function fetchWatchlists() {
  return apiFetch<Watchlist[]>("/api/watchlists");
}

export async function fetchWatchlist(watchlistId: string) {
  return apiFetch<Watchlist>(`/api/watchlists/${watchlistId}`);
}

export async function fetchWatchlistRules(watchlistId: string) {
  return apiFetch<WatchlistRule[]>(`/api/watchlists/${watchlistId}/rules`);
}

export async function fetchWatchlistAlerts(watchlistId?: string, options?: { status?: string; severity?: string }) {
  const params = new URLSearchParams();
  if (watchlistId) params.set("watchlistId", watchlistId);
  if (options?.status) params.set("status", options.status);
  if (options?.severity) params.set("severity", options.severity);
  const qs = params.toString();
  return apiFetch<WatchlistAlert[]>(`/api/watchlists/alerts${qs ? `?${qs}` : ""}`);
}

export async function createWatchlist(body: { name: string; description?: string; category?: string }) {
  return apiFetch<Watchlist>("/api/watchlists", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function createWatchlistRule(
  watchlistId: string,
  body: { ruleName: string; description?: string; condition: Record<string, unknown>; severityOverride?: string },
) {
  return apiFetch<WatchlistRule>(`/api/watchlists/${watchlistId}/rules`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function updateAlertStatus(alertId: string, status: string) {
  return apiFetch<WatchlistAlert>(`/api/watchlists/alerts/${alertId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
}
