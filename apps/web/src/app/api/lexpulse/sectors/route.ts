import { NextResponse } from "next/server";
import { queryRows } from "@/lib/db";
import { asArray, asNumber, asRecord, asString } from "@/lib/workspaces/shared";
import type { LexPulseSectorsResponse } from "@/lib/workspaces/lexpulse-types";
import { requireApiSession } from "../_helpers";

type ForecastRow = {
  sector_name: string;
  friction_change_pct: string | number | null;
  period_label: string;
  narrative: string;
};

type DigestRow = {
  digest: unknown;
  projected_at: Date | string | null;
};

function buildForecastNarrative(sectorName: string, recentCount: number, previousCount: number, periodLabel: string) {
  const trend = recentCount > previousCount ? "accelerated" : recentCount < previousCount ? "cooled" : "held steady";
  return `${sectorName} regulatory friction ${trend} over ${periodLabel.toLowerCase()}, with ${recentCount} qualifying digests versus ${previousCount} in the prior window.`;
}

function aggregateForecasts(rows: DigestRow[]) {
  const recent = new Map<string, number>();
  const previous = new Map<string, number>();
  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;

  for (const row of rows) {
    const digest = asRecord(row.digest);
    const lexPulse = asRecord(digest.lex_pulse);
    const sectors = asArray<string>(lexPulse.affected_sectors).filter(
      (sector) => typeof sector === "string" && sector.trim().length > 0,
    );
    const timestamp = row.projected_at instanceof Date ? row.projected_at.getTime() : row.projected_at ? Date.parse(String(row.projected_at)) : NaN;
    const target = Number.isFinite(timestamp) && timestamp >= cutoff ? recent : previous;

    for (const sector of sectors) {
      target.set(sector, (target.get(sector) ?? 0) + 1);
    }
  }

  const periodLabel = "Last 90 days";
  const topSectors = [...recent.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6);

  return topSectors.map(([sectorName, recentCount]) => {
    const previousCount = previous.get(sectorName) ?? 0;
    const frictionChangePct =
      previousCount <= 0 ? (recentCount > 0 ? 100 : 0) : Math.round(((recentCount - previousCount) / previousCount) * 10000) / 100;

    return {
      sectorName,
      frictionChangePct,
      periodLabel,
      narrative: buildForecastNarrative(sectorName, recentCount, previousCount, periodLabel),
    };
  });
}

export async function GET(request: Request) {
  const session = await requireApiSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await queryRows<ForecastRow>(
    session.tenantId,
    `
      SELECT
        sector_name,
        friction_change_pct,
        period_label,
        narrative
      FROM lex_pulse.sector_forecasts
      WHERE tenant_id = $1
      ORDER BY period_label DESC, friction_change_pct DESC, updated_at DESC
    `,
    [session.tenantId],
  );

  if (rows.length > 0) {
    return NextResponse.json({
      items: rows.map((row) => ({
        sectorName: asString(row.sector_name, "Sector"),
        frictionChangePct: asNumber(row.friction_change_pct),
        periodLabel: asString(row.period_label, "Last 90 days"),
        narrative: asString(row.narrative, ""),
      })),
    } satisfies LexPulseSectorsResponse);
  }

  const digests = await queryRows<DigestRow>(
    session.tenantId,
    `
      SELECT digest, projected_at
      FROM projections.regulatory_digest
      WHERE tenant_id = $1
        AND projected_at >= now() - interval '180 days'
      ORDER BY projected_at DESC
    `,
    [session.tenantId],
  );

  return NextResponse.json({
    items: aggregateForecasts(digests).map((item) => ({
      sectorName: item.sectorName,
      frictionChangePct: item.frictionChangePct,
      periodLabel: item.periodLabel,
      narrative: item.narrative,
    })),
  } satisfies LexPulseSectorsResponse);
}
