import { asArray, asNumber, asRecord, asString, safeQueryRow, safeQueryRows, truncate } from "@/lib/workspaces/shared";

export type BriefingCard = {
  briefingId: string;
  title: string;
  audience: string;
  status: string;
  currentVersion: number;
  ownerName: string;
  publishedAt: string | null;
  updatedAt: string | null;
  executiveOverview: string;
  sectionTitles: string[];
  sourceInvestigationCount: number;
  sourceEventCount: number;
  sourceWatchlistCount: number;
};

export type BriefingsWorkspaceData = {
  isFallback: boolean;
  briefings: BriefingCard[];
  featured: BriefingCard;
  distribution: string[];
  assistantNotes: string[];
};

type BriefingRow = {
  briefing_id: string;
  title: string;
  audience: string | null;
  status: string;
  current_version: number;
  owner_name: string | null;
  published_at: Date | null;
  updated_at: Date;
  sections: unknown;
  source_investigation_ids: string[] | null;
  source_event_ids: string[] | null;
  source_watchlist_ids: string[] | null;
};

function normalizeSections(value: unknown) {
  const sections = asArray<Record<string, unknown>>(value);
  if (sections.length > 0) {
    return sections
      .map((section, index) => ({
        title: asString(section.title, asString(section.heading, `Section ${index + 1}`)),
        body: asString(section.body, asString(section.summary, "")),
      }))
      .filter((section) => section.title.length > 0 || section.body.length > 0);
  }

  const record = asRecord(value);
  return Object.entries(record).map(([title, body]) => ({
    title,
    body: typeof body === "string" ? body : JSON.stringify(body),
  }));
}

function buildFallbackBriefing(): BriefingCard {
  return {
    briefingId: "staged-briefing",
    title: "Briefing publication surface is ready",
    audience: "Awaiting target audience",
    status: "draft",
    currentVersion: 1,
    ownerName: "Awaiting editor",
    publishedAt: null,
    updatedAt: null,
    executiveOverview:
      "Briefings will promote investigations, watchlist pressure, and PulseBoard clusters into an editorial synthesis once the first briefing version is authored.",
    sectionTitles: ["Operational snapshot", "Scenario framing", "Recommended actions"],
    sourceInvestigationCount: 0,
    sourceEventCount: 0,
    sourceWatchlistCount: 0,
  };
}

function fromRow(row: BriefingRow): BriefingCard {
  const sections = normalizeSections(row.sections);
  const firstSection = sections[0];

  return {
    briefingId: row.briefing_id,
    title: row.title,
    audience: row.audience ?? "Internal circulation",
    status: row.status,
    currentVersion: asNumber(row.current_version, 1),
    ownerName: row.owner_name ?? "Editorial queue",
    publishedAt: row.published_at?.toISOString() ?? null,
    updatedAt: row.updated_at.toISOString(),
    executiveOverview:
      truncate(
        firstSection?.body ||
          "Briefing version is stored and ready to surface once an editorial summary is attached.",
        240,
      ),
    sectionTitles: sections.slice(0, 4).map((section) => section.title),
    sourceInvestigationCount: row.source_investigation_ids?.length ?? 0,
    sourceEventCount: row.source_event_ids?.length ?? 0,
    sourceWatchlistCount: row.source_watchlist_ids?.length ?? 0,
  };
}

/* ── API types (used by route handlers and client SDK) ── */

export type BriefingSection = {
  title: string;
  body: string;
};

export type BriefingSummary = {
  id: string;
  title: string;
  audience: string | null;
  status: string;
  currentVersion: number;
  ownerName: string;
  ownerId: string;
  approvedBy: string | null;
  approvedAt: string | null;
  publishedAt: string | null;
  supersedesId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BriefingDetail = BriefingSummary & {
  sections: BriefingSection[];
  sourceInvestigationIds: string[];
  sourceEventIds: string[];
  sourceWatchlistIds: string[];
};

export type BriefingVersion = {
  id: string;
  versionNumber: number;
  sections: BriefingSection[];
  sourceInvestigationIds: string[];
  sourceEventIds: string[];
  sourceWatchlistIds: string[];
  aiDraftModel: string | null;
  editedBy: string;
  editedByName: string;
  createdAt: string;
};

export type BriefingMetrics = {
  byStatus: Record<string, number>;
  byAudience: Record<string, number>;
  totalVersions: number;
  recentPublications: BriefingSummary[];
};

/* ── CRUD query functions (used by API routes) ── */

export async function listBriefings(
  tenantId: string,
  options?: { status?: string; audience?: string; limit?: number; offset?: number },
): Promise<{ items: BriefingSummary[]; total: number }> {
  const limit = options?.limit ?? 20;
  const offset = options?.offset ?? 0;

  const conditions = ["b.tenant_id = $1"];
  const values: unknown[] = [tenantId];
  let paramIdx = 2;

  if (options?.status) {
    conditions.push(`b.status = $${paramIdx}`);
    values.push(options.status);
    paramIdx++;
  }
  if (options?.audience) {
    conditions.push(`b.audience = $${paramIdx}`);
    values.push(options.audience);
    paramIdx++;
  }

  const where = conditions.join(" AND ");

  const countRow = await safeQueryRow<{ count: string }>(
    tenantId,
    `SELECT COUNT(*)::text AS count FROM workflow.briefings AS b WHERE ${where}`,
    values,
  );

  const rows = await safeQueryRows<{
    id: string;
    title: string;
    audience: string | null;
    status: string;
    current_version: number;
    owner_name: string | null;
    owner_id: string;
    approved_by_name: string | null;
    approved_at: Date | null;
    published_at: Date | null;
    supersedes_id: string | null;
    created_at: Date;
    updated_at: Date;
  }>(
    tenantId,
    `
      SELECT
        b.id::text,
        b.title,
        b.audience,
        b.status,
        b.current_version,
        u.display_name AS owner_name,
        b.owner_id::text,
        ua.display_name AS approved_by_name,
        b.approved_at,
        b.published_at,
        b.supersedes_id::text,
        b.created_at,
        b.updated_at
      FROM workflow.briefings AS b
      LEFT JOIN core.users AS u ON u.id = b.owner_id
      LEFT JOIN core.users AS ua ON ua.id = b.approved_by
      WHERE ${where}
      ORDER BY COALESCE(b.published_at, b.updated_at) DESC
      LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `,
    [...values, limit, offset],
  );

  return {
    items: rows.map((r) => ({
      id: r.id,
      title: r.title,
      audience: r.audience,
      status: r.status,
      currentVersion: r.current_version,
      ownerName: r.owner_name ?? "Unknown",
      ownerId: r.owner_id,
      approvedBy: r.approved_by_name,
      approvedAt: r.approved_at?.toISOString() ?? null,
      publishedAt: r.published_at?.toISOString() ?? null,
      supersedesId: r.supersedes_id,
      createdAt: r.created_at.toISOString(),
      updatedAt: r.updated_at.toISOString(),
    })),
    total: Number(countRow?.count ?? 0),
  };
}

export async function getBriefing(
  tenantId: string,
  briefingId: string,
): Promise<BriefingDetail | null> {
  const rows = await safeQueryRows<{
    id: string;
    title: string;
    audience: string | null;
    status: string;
    current_version: number;
    owner_name: string | null;
    owner_id: string;
    approved_by_name: string | null;
    approved_at: Date | null;
    published_at: Date | null;
    supersedes_id: string | null;
    created_at: Date;
    updated_at: Date;
    sections: unknown;
    source_investigation_ids: string[] | null;
    source_event_ids: string[] | null;
    source_watchlist_ids: string[] | null;
  }>(
    tenantId,
    `
      SELECT
        b.id::text,
        b.title,
        b.audience,
        b.status,
        b.current_version,
        u.display_name AS owner_name,
        b.owner_id::text,
        ua.display_name AS approved_by_name,
        b.approved_at,
        b.published_at,
        b.supersedes_id::text,
        b.created_at,
        b.updated_at,
        bv.sections,
        bv.source_investigation_ids,
        bv.source_event_ids,
        bv.source_watchlist_ids
      FROM workflow.briefings AS b
      LEFT JOIN core.users AS u ON u.id = b.owner_id
      LEFT JOIN core.users AS ua ON ua.id = b.approved_by
      LEFT JOIN workflow.briefing_versions AS bv
        ON bv.briefing_id = b.id AND bv.version_number = b.current_version
      WHERE b.tenant_id = $1 AND b.id = $2::uuid
    `,
    [tenantId, briefingId],
  );

  if (rows.length === 0) return null;
  const r = rows[0];
  const sections = normalizeSections(r.sections);

  return {
    id: r.id,
    title: r.title,
    audience: r.audience,
    status: r.status,
    currentVersion: r.current_version,
    ownerName: r.owner_name ?? "Unknown",
    ownerId: r.owner_id,
    approvedBy: r.approved_by_name,
    approvedAt: r.approved_at?.toISOString() ?? null,
    publishedAt: r.published_at?.toISOString() ?? null,
    supersedesId: r.supersedes_id,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
    sections: sections.map((s) => ({ title: s.title, body: s.body })),
    sourceInvestigationIds: (r.source_investigation_ids ?? []).map(String),
    sourceEventIds: (r.source_event_ids ?? []).map(String),
    sourceWatchlistIds: (r.source_watchlist_ids ?? []).map(String),
  };
}

export async function listBriefingVersions(
  tenantId: string,
  briefingId: string,
): Promise<BriefingVersion[]> {
  const rows = await safeQueryRows<{
    id: string;
    version_number: number;
    sections: unknown;
    source_investigation_ids: string[] | null;
    source_event_ids: string[] | null;
    source_watchlist_ids: string[] | null;
    ai_draft_model: string | null;
    edited_by: string;
    edited_by_name: string | null;
    created_at: Date;
  }>(
    tenantId,
    `
      SELECT
        bv.id::text,
        bv.version_number,
        bv.sections,
        bv.source_investigation_ids,
        bv.source_event_ids,
        bv.source_watchlist_ids,
        bv.ai_draft_model,
        bv.edited_by::text,
        u.display_name AS edited_by_name,
        bv.created_at
      FROM workflow.briefing_versions AS bv
      JOIN workflow.briefings AS b ON b.id = bv.briefing_id
      LEFT JOIN core.users AS u ON u.id = bv.edited_by
      WHERE b.tenant_id = $1 AND bv.briefing_id = $2::uuid
      ORDER BY bv.version_number DESC
    `,
    [tenantId, briefingId],
  );

  return rows.map((r) => {
    const sections = normalizeSections(r.sections);
    return {
      id: r.id,
      versionNumber: r.version_number,
      sections: sections.map((s) => ({ title: s.title, body: s.body })),
      sourceInvestigationIds: (r.source_investigation_ids ?? []).map(String),
      sourceEventIds: (r.source_event_ids ?? []).map(String),
      sourceWatchlistIds: (r.source_watchlist_ids ?? []).map(String),
      aiDraftModel: r.ai_draft_model,
      editedBy: r.edited_by,
      editedByName: r.edited_by_name ?? "Unknown",
      createdAt: r.created_at.toISOString(),
    };
  });
}

export async function getBriefingMetrics(tenantId: string): Promise<BriefingMetrics> {
  const statusRows = await safeQueryRows<{ status: string; count: string }>(
    tenantId,
    `SELECT status, COUNT(*)::text AS count FROM workflow.briefings WHERE tenant_id = $1 GROUP BY status`,
    [tenantId],
  );

  const audienceRows = await safeQueryRows<{ audience: string; count: string }>(
    tenantId,
    `SELECT COALESCE(audience, 'Unspecified') AS audience, COUNT(*)::text AS count FROM workflow.briefings WHERE tenant_id = $1 GROUP BY audience`,
    [tenantId],
  );

  const versionRow = await safeQueryRow<{ count: string }>(
    tenantId,
    `
      SELECT COUNT(*)::text AS count
      FROM workflow.briefing_versions AS bv
      JOIN workflow.briefings AS b ON b.id = bv.briefing_id
      WHERE b.tenant_id = $1
    `,
    [tenantId],
  );

  const pubRows = await safeQueryRows<{
    id: string;
    title: string;
    audience: string | null;
    status: string;
    current_version: number;
    owner_name: string | null;
    owner_id: string;
    approved_by_name: string | null;
    approved_at: Date | null;
    published_at: Date | null;
    supersedes_id: string | null;
    created_at: Date;
    updated_at: Date;
  }>(
    tenantId,
    `
      SELECT
        b.id::text, b.title, b.audience, b.status, b.current_version,
        u.display_name AS owner_name, b.owner_id::text,
        ua.display_name AS approved_by_name, b.approved_at, b.published_at,
        b.supersedes_id::text, b.created_at, b.updated_at
      FROM workflow.briefings AS b
      LEFT JOIN core.users AS u ON u.id = b.owner_id
      LEFT JOIN core.users AS ua ON ua.id = b.approved_by
      WHERE b.tenant_id = $1 AND b.status = 'published'
      ORDER BY b.published_at DESC LIMIT 5
    `,
    [tenantId],
  );

  const byStatus: Record<string, number> = {};
  for (const r of statusRows) byStatus[r.status] = Number(r.count);

  const byAudience: Record<string, number> = {};
  for (const r of audienceRows) byAudience[r.audience] = Number(r.count);

  return {
    byStatus,
    byAudience,
    totalVersions: Number(versionRow?.count ?? 0),
    recentPublications: pubRows.map((r) => ({
      id: r.id,
      title: r.title,
      audience: r.audience,
      status: r.status,
      currentVersion: r.current_version,
      ownerName: r.owner_name ?? "Unknown",
      ownerId: r.owner_id,
      approvedBy: r.approved_by_name,
      approvedAt: r.approved_at?.toISOString() ?? null,
      publishedAt: r.published_at?.toISOString() ?? null,
      supersedesId: r.supersedes_id,
      createdAt: r.created_at.toISOString(),
      updatedAt: r.updated_at.toISOString(),
    })),
  };
}

export async function getBriefingsWorkspaceData(tenantId: string): Promise<BriefingsWorkspaceData> {
  const rows = await safeQueryRows<BriefingRow>(
    tenantId,
    `
      SELECT
        b.id::text AS briefing_id,
        b.title,
        b.audience,
        b.status,
        b.current_version,
        u.display_name AS owner_name,
        b.published_at,
        b.updated_at,
        bv.sections,
        bv.source_investigation_ids,
        bv.source_event_ids,
        bv.source_watchlist_ids
      FROM workflow.briefings AS b
      LEFT JOIN core.users AS u ON u.id = b.owner_id
      LEFT JOIN workflow.briefing_versions AS bv
        ON bv.briefing_id = b.id
       AND bv.version_number = b.current_version
      WHERE b.tenant_id = $1
      ORDER BY COALESCE(b.published_at, b.updated_at) DESC
      LIMIT 6
    `,
    [tenantId],
  );

  const briefings = rows.length > 0 ? rows.map(fromRow) : [buildFallbackBriefing()];
  const featured = briefings[0] ?? buildFallbackBriefing();

  return {
    isFallback: rows.length === 0,
    briefings,
    featured,
    distribution: [featured.audience, featured.ownerName, `Version ${featured.currentVersion}`],
    assistantNotes: [
      featured.sourceInvestigationCount > 0
        ? `This draft already draws from ${featured.sourceInvestigationCount} linked investigations.`
        : "No investigation lineage is attached yet.",
      featured.sourceWatchlistCount > 0
        ? `${featured.sourceWatchlistCount} watchlist sources are feeding the editorial surface.`
        : "Attach watchlist source IDs to improve provenance in the briefing rail.",
      featured.status === "published"
        ? "Published briefings should be reviewed for supersedence on the next editorial cycle."
        : "Editorial warning: this briefing is still pre-publication and may need a final approver pass.",
    ],
  };
}
