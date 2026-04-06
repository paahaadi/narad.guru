import { NextResponse } from "next/server";
import { queryRows } from "@/lib/db";
import { requireApiSession } from "../_helpers";

type AlertRow = {
  id: string;
  watchlist_id: string;
  watchlist_name: string;
  rule_name: string | null;
  event_id: string | null;
  event_title: string | null;
  entity_id: string | null;
  entity_name: string | null;
  severity: string;
  status: string;
  title: string;
  summary: string | null;
  assigned_to: string | null;
  created_at: Date | string;
};

export async function GET(request: Request) {
  const session = await requireApiSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const severity = url.searchParams.get("severity");
  const limitRaw = Number(url.searchParams.get("limit") ?? 50);
  const limit = Math.min(Math.max(limitRaw, 1), 200);

  const conditions: string[] = ["a.tenant_id = $1"];
  const values: unknown[] = [session.tenantId];
  let idx = 2;

  if (status) {
    conditions.push(`a.status = $${idx}`);
    values.push(status);
    idx++;
  }
  if (severity) {
    conditions.push(`a.severity = $${idx}`);
    values.push(severity);
    idx++;
  }

  const rows = await queryRows<AlertRow>(
    session.tenantId,
    `
      SELECT
        a.id::text,
        a.watchlist_id::text,
        w.name AS watchlist_name,
        r.rule_name,
        a.triggered_by_event_id::text AS event_id,
        ev.title AS event_title,
        a.triggered_by_entity_id::text AS entity_id,
        en.canonical_name AS entity_name,
        a.severity,
        a.status,
        a.title,
        a.summary,
        a.assigned_to::text,
        a.created_at
      FROM workflow.watchlist_alerts AS a
      JOIN workflow.watchlists AS w ON w.id = a.watchlist_id
      LEFT JOIN workflow.watchlist_rules AS r ON r.id = a.rule_id
      LEFT JOIN core.events AS ev ON ev.id = a.triggered_by_event_id
      LEFT JOIN core.entities AS en ON en.id = a.triggered_by_entity_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY
        CASE a.severity
          WHEN 'critical' THEN 0
          WHEN 'high' THEN 1
          WHEN 'medium' THEN 2
          WHEN 'low' THEN 3
          ELSE 4
        END,
        a.created_at DESC
      LIMIT ${limit}
    `,
    values,
  );

  return NextResponse.json(
    rows.map((r) => ({
      id: r.id,
      watchlistId: r.watchlist_id,
      watchlistName: r.watchlist_name,
      ruleName: r.rule_name,
      eventId: r.event_id,
      eventTitle: r.event_title,
      entityId: r.entity_id,
      entityName: r.entity_name,
      severity: r.severity,
      status: r.status,
      title: r.title,
      summary: r.summary,
      assignedTo: r.assigned_to,
      createdAt:
        r.created_at instanceof Date
          ? r.created_at.toISOString()
          : r.created_at,
    })),
  );
}
