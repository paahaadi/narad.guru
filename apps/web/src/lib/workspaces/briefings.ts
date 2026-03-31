import { asArray, asNumber, asRecord, asString, safeQueryRows, truncate } from "@/lib/workspaces/shared";

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
