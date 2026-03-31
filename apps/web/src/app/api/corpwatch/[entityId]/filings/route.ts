import { NextResponse } from "next/server";
import { queryRow, queryRows } from "@/lib/db";
import { asNumber, asOptionalString, asString } from "@/lib/workspaces/shared";
import type { CorpWatchFilingListResponse } from "@/lib/workspaces/corpwatch-types";
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
      JOIN core.event_document_links AS edl ON edl.event_id = eel.event_id AND edl.tenant_id = eel.tenant_id
      JOIN core.documents AS d ON d.id = edl.document_id
      WHERE eel.tenant_id = $1
        AND eel.entity_id = $2::uuid
        AND d.doc_type IN ('filing', 'circular', 'order', 'report')
    `,
    [session.tenantId, entityId],
  );

  const rows = await queryRows<{
    document_id: string;
    title: string;
    doc_type: string;
    source_name: string;
    fetch_url: string | null;
    published_at: Date | string | null;
    excerpt: string | null;
    event_id: string | null;
    event_title: string | null;
  }>(
    session.tenantId,
    `
      SELECT
        d.id::text AS document_id,
        COALESCE(d.title, d.external_id, d.doc_type) AS title,
        d.doc_type,
        s.name AS source_name,
        d.fetch_url,
        d.published_at,
        LEFT(COALESCE(d.translated_text, d.body_text, d.title, ''), 320) AS excerpt,
        ev.id::text AS event_id,
        ev.title AS event_title
      FROM core.event_entity_links AS eel
      JOIN core.events AS ev ON ev.id = eel.event_id
      JOIN core.event_document_links AS edl ON edl.event_id = ev.id AND edl.tenant_id = eel.tenant_id
      JOIN core.documents AS d ON d.id = edl.document_id
      JOIN core.sources AS s ON s.id = d.source_id
      WHERE eel.tenant_id = $1
        AND eel.entity_id = $2::uuid
        AND d.doc_type IN ('filing', 'circular', 'order', 'report')
      ORDER BY COALESCE(d.published_at, ev.occurred_at, ev.created_at) DESC NULLS LAST
      LIMIT $3 OFFSET $4
    `,
    [session.tenantId, entityId, limit, offset],
  );

  const response: CorpWatchFilingListResponse = {
    entityId,
    limit,
    offset,
    total: asNumber(totalRow?.total),
    items: rows.map((row) => ({
      documentId: row.document_id,
      title: asString(row.title, "Untitled filing"),
      docType: asString(row.doc_type, "filing"),
      sourceName: asString(row.source_name, "Source"),
      fetchUrl: asOptionalString(row.fetch_url),
      publishedAt:
        row.published_at instanceof Date
          ? row.published_at.toISOString()
          : row.published_at
            ? String(row.published_at)
            : null,
      excerpt: asOptionalString(row.excerpt) ?? "",
      eventId: asOptionalString(row.event_id),
      eventTitle: asOptionalString(row.event_title),
    })),
  };

  return NextResponse.json(response);
}
