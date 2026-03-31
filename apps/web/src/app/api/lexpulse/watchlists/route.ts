import { NextResponse } from "next/server";
import { queryRows } from "@/lib/db";
import { asNumber, asOptionalString, asString } from "@/lib/workspaces/shared";
import type { LexPulseWatchlistsResponse } from "@/lib/workspaces/lexpulse-types";
import { requireApiSession } from "../_helpers";

type WatchlistRow = {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  owner_id: string;
  updated_at: Date | string | null;
  alert_count: string | number | null;
  unresolved_alert_count: string | number | null;
};

export async function GET(request: Request) {
  const session = await requireApiSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await queryRows<WatchlistRow>(
    session.tenantId,
    `
      SELECT
        wl.id::text AS id,
        wl.name,
        wl.description,
        wl.is_active,
        wl.owner_id::text AS owner_id,
        wl.updated_at,
        COUNT(wa.id)::int AS alert_count,
        COUNT(*) FILTER (WHERE wa.status = 'new')::int AS unresolved_alert_count
      FROM workflow.watchlists AS wl
      LEFT JOIN workflow.watchlist_alerts AS wa
        ON wa.watchlist_id = wl.id AND wa.tenant_id = wl.tenant_id
      WHERE wl.tenant_id = $1
      GROUP BY wl.id
      ORDER BY wl.is_active DESC, unresolved_alert_count DESC, wl.updated_at DESC
    `,
    [session.tenantId],
  );

  const items = rows.map((row) => ({
    watchlistId: row.id,
    name: asString(row.name, "Watchlist"),
    description: asOptionalString(row.description) ?? "",
    isActive: Boolean(row.is_active),
    alertCount: asNumber(row.alert_count),
    unresolvedAlertCount: asNumber(row.unresolved_alert_count),
    ownerId: row.owner_id,
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : row.updated_at
          ? String(row.updated_at)
          : null,
  }));

  return NextResponse.json({ items } satisfies LexPulseWatchlistsResponse);
}
