import { NextResponse } from "next/server";
import { requireSessionFromRequest } from "@/lib/auth";
import { queryRow } from "@/lib/db";

type PreferencesRow = {
  preferences: Record<string, unknown>;
};

const DEFAULT_PREFERENCES = {
  regions: [],
  entityTypes: [],
  eventTypes: [],
  severityFilter: "all",
};

export async function GET(request: Request) {
  const session = await requireSessionFromRequest(request);

  const row = await queryRow<PreferencesRow>(
    session.tenantId,
    `SELECT preferences FROM core.users WHERE id = $1::uuid AND tenant_id = $2`,
    [session.sub, session.tenantId],
  );

  const prefs =
    row?.preferences && typeof row.preferences === "object"
      ? { ...DEFAULT_PREFERENCES, ...row.preferences }
      : DEFAULT_PREFERENCES;

  return NextResponse.json(prefs);
}

export async function PUT(request: Request) {
  const session = await requireSessionFromRequest(request);

  const body = (await request.json()) as {
    regions?: string[];
    entityTypes?: string[];
    eventTypes?: string[];
    severityFilter?: string;
  };

  // Validate + sanitize
  const validSeverities = ["all", "critical", "high", "medium", "low"];
  const preferences = {
    regions: Array.isArray(body.regions)
      ? body.regions.filter((r) => typeof r === "string").slice(0, 50)
      : [],
    entityTypes: Array.isArray(body.entityTypes)
      ? body.entityTypes.filter((e) => typeof e === "string").slice(0, 20)
      : [],
    eventTypes: Array.isArray(body.eventTypes)
      ? body.eventTypes.filter((e) => typeof e === "string").slice(0, 20)
      : [],
    severityFilter:
      body.severityFilter && validSeverities.includes(body.severityFilter)
        ? body.severityFilter
        : "all",
  };

  await queryRow(
    session.tenantId,
    `UPDATE core.users SET preferences = $1::jsonb WHERE id = $2::uuid AND tenant_id = $3`,
    [JSON.stringify(preferences), session.sub, session.tenantId],
  );

  return NextResponse.json(preferences);
}
