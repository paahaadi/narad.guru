import { NextResponse } from "next/server";
import { queryRow, queryRows } from "@/lib/db";
import { asNumber, asOptionalString, asString } from "@/lib/workspaces/shared";
import type { CorpWatchEventListResponse } from "@/lib/workspaces/corpwatch-types";
import { requireApiSession } from "../../_helpers";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ entityId: string }> },
) {
  const session = await requireApiSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { entityId } = await params;
  const searchParams = new URL(request.url).searchParams;
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? 20) || 20, 1), 100);
  const offset = Math.max(Number(searchParams.get("offset") ?? 0) || 0, 0);

  const totalRow = await queryRow<{ total: string | number }>(
    session.tenantId,
    `
      SELECT COUNT(*)::int AS total
      FROM core.event_entity_links AS eel
      JOIN core.events AS ev ON ev.id = eel.event_id
      WHERE eel.tenant_id = $1 AND eel.entity_id = $2::uuid
    `,
    [session.tenantId, entityId],
  );

  const rows = await queryRows<{
    event_id: string;
    title: string;
    event_type: string;
    severity: string;
    summary: string | null;
    occurred_at: Date | string | null;
    source_name: string | null;
  }>(
    session.tenantId,
    `
      SELECT
        ev.id::text AS event_id,
        ev.title,
        ev.event_type,
        ev.severity,
        ev.summary,
        COALESCE(ev.occurred_at, ev.created_at) AS occurred_at,
        s.name AS source_name
      FROM core.event_entity_links AS eel
      JOIN core.events AS ev ON ev.id = eel.event_id
      LEFT JOIN core.event_document_links AS edl ON edl.event_id = ev.id AND edl.tenant_id = eel.tenant_id
      LEFT JOIN core.documents AS d ON d.id = edl.document_id
      LEFT JOIN core.sources AS s ON s.id = d.source_id
      WHERE eel.tenant_id = $1
        AND eel.entity_id = $2::uuid
      ORDER BY COALESCE(ev.occurred_at, ev.created_at) DESC
      LIMIT $3 OFFSET $4
    `,
    [session.tenantId, entityId, limit, offset],
  );

  const response: CorpWatchEventListResponse = {
    entityId,
    limit,
    offset,
    total: asNumber(totalRow?.total),
    items: rows.map((row) => ({
      eventId: row.event_id,
      title: asString(row.title, "Event"),
      eventType: asString(row.event_type, "event"),
      severity: asString(row.severity, "informational"),
      summary: asOptionalString(row.summary),
      occurredAt:
        row.occurred_at instanceof Date
          ? row.occurred_at.toISOString()
          : row.occurred_at
            ? String(row.occurred_at)
            : null,
      sourceName: asOptionalString(row.source_name),
    })),
  };

  return NextResponse.json(response);
}
