"use client";

import type {
  InvestigationSummary,
  InvestigationItem,
  EvidenceRecord,
  InvestigationNote,
  CustodyEntry,
  InvestigationMetrics,
} from "./investigations";

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, credentials: "include" });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function fetchInvestigations(options?: { status?: string; limit?: number; offset?: number }) {
  const params = new URLSearchParams();
  if (options?.status) params.set("status", options.status);
  if (options?.limit) params.set("limit", String(options.limit));
  if (options?.offset) params.set("offset", String(options.offset));
  const qs = params.toString();
  return apiFetch<{ items: InvestigationSummary[]; total: number }>(`/api/investigations${qs ? `?${qs}` : ""}`);
}

export async function fetchInvestigation(id: string) {
  return apiFetch<InvestigationSummary>(`/api/investigations/${id}`);
}

export async function createInvestigation(body: {
  title: string;
  description?: string;
  classification?: string;
  hypothesis?: string;
}) {
  return apiFetch<InvestigationSummary>("/api/investigations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function updateInvestigation(
  id: string,
  body: { title?: string; description?: string; confidence?: number; hypothesis?: string; status?: string },
) {
  return apiFetch<InvestigationSummary>(`/api/investigations/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function fetchInvestigationItems(id: string, options?: { itemType?: string; role?: string }) {
  const params = new URLSearchParams();
  if (options?.itemType) params.set("itemType", options.itemType);
  if (options?.role) params.set("role", options.role);
  const qs = params.toString();
  return apiFetch<{ items: InvestigationItem[] }>(`/api/investigations/${id}/items${qs ? `?${qs}` : ""}`);
}

export async function attachInvestigationItem(
  id: string,
  body: { itemType: string; itemId: string; role?: string; notes?: string },
) {
  return apiFetch<InvestigationItem>(`/api/investigations/${id}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function fetchInvestigationEvidence(id: string) {
  return apiFetch<{ items: EvidenceRecord[] }>(`/api/investigations/${id}/evidence`);
}

export async function attachInvestigationEvidence(
  id: string,
  body: { documentId: string; evidenceHash: string; s3KeyWorm: string },
) {
  return apiFetch<EvidenceRecord>(`/api/investigations/${id}/evidence`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function verifyEvidence(investigationId: string, evidenceId: string, action: "verified" | "challenged") {
  return apiFetch<{ id: string; isVerified: boolean; verifiedBy: string | null; verifiedAt: string | null }>(
    `/api/investigations/${investigationId}/evidence/${evidenceId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    },
  );
}

export async function fetchInvestigationNotes(id: string, options?: { noteType?: string }) {
  const params = new URLSearchParams();
  if (options?.noteType) params.set("noteType", options.noteType);
  const qs = params.toString();
  return apiFetch<{ items: InvestigationNote[] }>(`/api/investigations/${id}/notes${qs ? `?${qs}` : ""}`);
}

export async function createInvestigationNote(id: string, body: { body: string; noteType?: string }) {
  return apiFetch<InvestigationNote>(`/api/investigations/${id}/notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function fetchCustodyLog(id: string) {
  return apiFetch<{ entries: CustodyEntry[] }>(`/api/investigations/${id}/custody`);
}

export async function fetchInvestigationMetrics() {
  return apiFetch<InvestigationMetrics>("/api/investigations/metrics");
}
