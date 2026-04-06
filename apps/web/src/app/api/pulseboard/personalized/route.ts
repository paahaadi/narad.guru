import { NextResponse } from "next/server";
import { requireSessionFromRequest } from "@/lib/auth";
import { listPersonalizedPulseboardCards, type UserPreferences } from "@/lib/pulseboard";
import { queryRow } from "@/lib/db";

export async function GET(request: Request) {
  const session = await requireSessionFromRequest(request);

  const limitRaw = Number(new URL(request.url).searchParams.get("limit") ?? 24);
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(Math.trunc(limitRaw), 1), 100)
    : 24;

  // Fetch user preferences
  type PrefRow = { preferences: Record<string, unknown> };
  const row = await queryRow<PrefRow>(
    session.tenantId,
    `SELECT preferences FROM core.users WHERE id = $1::uuid AND tenant_id = $2`,
    [session.sub, session.tenantId],
  );

  const prefs: UserPreferences = {
    regions: [],
    entityTypes: [],
    eventTypes: [],
    severityFilter: "all",
  };

  if (row?.preferences && typeof row.preferences === "object") {
    const p = row.preferences;
    if (Array.isArray(p.regions)) prefs.regions = p.regions.filter((r) => typeof r === "string");
    if (Array.isArray(p.entityTypes)) prefs.entityTypes = p.entityTypes.filter((e) => typeof e === "string");
    if (Array.isArray(p.eventTypes)) prefs.eventTypes = p.eventTypes.filter((e) => typeof e === "string");
    if (typeof p.severityFilter === "string") prefs.severityFilter = p.severityFilter;
  }

  const hasFilters =
    prefs.regions.length > 0 ||
    prefs.eventTypes.length > 0 ||
    prefs.severityFilter !== "all";

  if (!hasFilters) {
    // No preferences set, return standard feed
    const { listPulseboardCards } = await import("@/lib/pulseboard");
    const cards = await listPulseboardCards(session.tenantId, limit);
    return NextResponse.json({ cards, personalized: false });
  }

  const cards = await listPersonalizedPulseboardCards(session.tenantId, prefs, limit);
  return NextResponse.json({ cards, personalized: true, appliedFilters: prefs });
}
