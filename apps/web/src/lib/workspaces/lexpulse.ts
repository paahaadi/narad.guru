import {
  asArray,
  asOptionalString,
  asRecord,
  asString,
  normalizeSeverity,
  safeQueryRows,
  truncate,
} from "@/lib/workspaces/shared";
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

export type LexPulseEvidence = {
  documentId: string;
  title: string;
  docType: string;
  linkType: string;
  publishedAt: string | null;
};

export type LexPulseDigestCard = {
  eventId: string;
  title: string;
  severity: "critical" | "high" | "medium" | "low" | "informational";
  regulatorLabel: string;
  effectiveDate: string | null;
  answer: string;
  summary: string;
  changeSummary: string[];
  evidence: LexPulseEvidence[];
  affectedEntities: Array<{ name: string; role: string }>;
};

export type LexPulseWorkspaceData = {
  isFallback: boolean;
  queryText: string;
  featured: LexPulseDigestCard;
  recent: LexPulseDigestCard[];
};

type RegulatoryDigestRow = {
  event_id: string;
  digest: unknown;
  effective_date: Date | null;
  projected_at: Date;
};

type RegulatoryFallbackRow = {
  event_id: string;
  title: string;
  severity: string;
  summary: string | null;
  explanation: string | null;
  occurred_at: Date | null;
  regulator: string | null;
  ministry: string | null;
  what_changed: string | null;
  why_it_matters: string | null;
  affected_sectors: string[] | null;
  effective_date: Date | null;
  amendment_type: string | null;
  gazette_ref: string | null;
};

function buildFallbackDigest(): LexPulseDigestCard {
  return {
    eventId: "staged-lexpulse",
    title: "LexPulse digest queue",
    severity: "informational",
    regulatorLabel: "Awaiting regulatory digest projection",
    effectiveDate: null,
    answer:
      "LexPulse is wired to read from the regulatory digest projection first and falls back to canonical regulatory events until the digest warms up for this tenant.",
    summary:
      "Regulatory answers will appear here as soon as a qualifying event is projected or a canonical regulatory event is ingested.",
    changeSummary: [
      "Projection-backed legal synthesis is connected.",
      "Fallback mode reads canonical events and LexPulse metadata directly.",
      "Evidence rail activates when event-document links are available.",
    ],
    evidence: [],
    affectedEntities: [],
  };
}

function regulatorLabelFromDigest(value: unknown) {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  const regulator = asRecord(value);
  return asString(regulator.name, "Regulatory desk");
}

function fromProjection(row: RegulatoryDigestRow): LexPulseDigestCard {
  const digest = asRecord(row.digest);
  const lexPulse = asRecord(digest.lex_pulse);
  const keyClaims = asArray<Record<string, unknown>>(digest.key_claims).slice(0, 3);
  const evidence = asArray<Record<string, unknown>>(digest.documents).slice(0, 4);
  const affectedEntities = asArray<Record<string, unknown>>(digest.affected_entities).slice(0, 4);

  const changeSummary = keyClaims
    .map((claim) => asString(claim.claim_text))
    .filter(Boolean)
    .map((claim) => truncate(claim, 180));

  if (changeSummary.length === 0) {
    const fallbackSummary = [
      asOptionalString(lexPulse.what_changed),
      asOptionalString(lexPulse.why_it_matters),
      ...asArray<string>(lexPulse.affected_sectors)
        .filter((sector) => typeof sector === "string" && sector.trim().length > 0)
        .map((sector) => `Affected sector: ${sector}`),
    ].filter((entry): entry is string => Boolean(entry));
    changeSummary.push(...fallbackSummary.slice(0, 3));
  }

  const answer =
    asString(lexPulse.why_it_matters, asString(digest.summary, "No direct answer has been projected yet.")) ||
    "No direct answer has been projected yet.";

  return {
    eventId: asString(digest.event_id, row.event_id),
    title: asString(digest.title, "Regulatory digest"),
    severity: normalizeSeverity(digest.severity),
    regulatorLabel: regulatorLabelFromDigest(digest.regulator),
    effectiveDate: asOptionalString(digest.effective_date) ?? row.effective_date?.toISOString() ?? null,
    answer,
    summary: asString(digest.summary, answer),
    changeSummary:
      changeSummary.length > 0 ? changeSummary : ["Digest projected, but no change bullets were generated."],
    evidence: evidence.map((document, index) => ({
      documentId: asString(document.document_id, `document-${index}`),
      title: asString(document.title, "Linked document"),
      docType: asString(document.doc_type, "document"),
      linkType: asString(document.link_type, "context"),
      publishedAt: asOptionalString(document.published_at),
    })),
    affectedEntities: affectedEntities.map((entity, index) => ({
      name: asString(entity.name, `Affected entity ${index + 1}`),
      role: asString(entity.role, "mentioned"),
    })),
  };
}

function fromFallbackRow(row: RegulatoryFallbackRow): LexPulseDigestCard {
  const changeSummary = [
    row.what_changed,
    row.why_it_matters,
    ...(row.affected_sectors ?? []).map((sector) => `Affected sector: ${sector}`),
  ].filter((entry): entry is string => Boolean(entry && entry.trim().length > 0));

  const evidence = row.gazette_ref
    ? [
        {
          documentId: `${row.event_id}-gazette`,
          title: row.gazette_ref,
          docType: row.amendment_type ?? "regulatory_source",
          linkType: "reference",
          publishedAt: row.effective_date?.toISOString() ?? row.occurred_at?.toISOString() ?? null,
        },
      ]
    : [];

  return {
    eventId: row.event_id,
    title: row.title,
    severity: normalizeSeverity(row.severity),
    regulatorLabel: row.regulator ?? row.ministry ?? "LexPulse fallback",
    effectiveDate: row.effective_date?.toISOString() ?? null,
    answer:
      row.why_it_matters ??
      row.explanation ??
      row.summary ??
      "Fallback legal synthesis is active while the regulatory digest projection warms up.",
    summary: row.summary ?? row.explanation ?? "Regulatory fallback row",
    changeSummary:
      changeSummary.length > 0
        ? changeSummary.slice(0, 3)
        : ["Canonical regulatory event is live, but no structured digest exists yet."],
    evidence,
    affectedEntities: [],
  };
}

export async function getLexPulseWorkspaceData(tenantId: string): Promise<LexPulseWorkspaceData> {
  const projectedDigests = await safeQueryRows<RegulatoryDigestRow>(
    tenantId,
    `
      SELECT event_id::text, digest, effective_date, projected_at
      FROM projections.regulatory_digest
      WHERE tenant_id = $1
      ORDER BY COALESCE(effective_date::timestamp, projected_at) DESC, projected_at DESC
      LIMIT 6
    `,
    [tenantId],
  );

  if (projectedDigests.length > 0) {
    const digests = projectedDigests.map(fromProjection);
    return {
      isFallback: false,
      queryText: `What changed in ${digests[0].title} and who is exposed?`,
      featured: digests[0],
      recent: digests.slice(1),
    };
  }

  const fallbackRows = await safeQueryRows<RegulatoryFallbackRow>(
    tenantId,
    `
      SELECT
        e.id::text AS event_id,
        e.title,
        e.severity,
        e.summary,
        sc.explanation,
        COALESCE(e.occurred_at, e.created_at) AS occurred_at,
        lp.regulator,
        lp.ministry,
        lp.what_changed,
        lp.why_it_matters,
        lp.affected_sectors,
        lp.effective_date,
        lp.amendment_type,
        lp.gazette_ref
      FROM core.events AS e
      LEFT JOIN core.story_capsules AS sc ON sc.id = e.story_capsule_id
      LEFT JOIN lex_pulse.regulatory_events AS lp ON lp.event_id = e.id
      WHERE e.tenant_id = $1
        AND e.event_type IN ('regulatory', 'legislative', 'judicial')
      ORDER BY COALESCE(lp.effective_date::timestamp, e.occurred_at, e.created_at) DESC
      LIMIT 6
    `,
    [tenantId],
  );

  const digests = fallbackRows.length > 0 ? fallbackRows.map(fromFallbackRow) : [buildFallbackDigest()];
  return {
    isFallback: true,
    queryText: `What changed in ${digests[0].title}?`,
    featured: digests[0],
    recent: digests.slice(1),
  };
}

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
  const response = await fetchJson<LexPulseQueryResponse>("/api/lexpulse/query", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      queryText: payload.queryText,
      forceRefresh: payload.forceRefresh ?? false,
    }),
  });
  return response;
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

export async function getDigest(digestId: string): Promise<LexPulseDigestsResponse["items"][number]> {
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
