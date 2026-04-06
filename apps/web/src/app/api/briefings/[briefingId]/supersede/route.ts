import { NextResponse } from "next/server";
import { withTenant } from "@/lib/db";
import { getBriefing } from "@/lib/workspaces/briefings";
import { requireApiSession } from "../../_helpers";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ briefingId: string }> },
) {
  const session = await requireApiSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { briefingId } = await params;
  const current = await getBriefing(session.tenantId, briefingId);
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (current.status !== "published") {
    return NextResponse.json(
      { error: `Cannot supersede briefing with status '${current.status}'. Must be 'published'.` },
      { status: 422 },
    );
  }

  const newBriefingId = await withTenant(session.tenantId, async (client) => {
    // Create new draft briefing that supersedes the original
    const briefingResult = await client.query<{ id: string }>(
      `
        INSERT INTO workflow.briefings (tenant_id, owner_id, title, audience, supersedes_id)
        VALUES ($1, $2::uuid, $3, $4, $5::uuid)
        RETURNING id::text
      `,
      [session.tenantId, session.sub, current.title, current.audience, briefingId],
    );

    const newId = briefingResult.rows[0].id;

    // Copy current version's sections into the new briefing's version 1
    await client.query(
      `
        INSERT INTO workflow.briefing_versions (
          briefing_id, version_number, sections,
          source_investigation_ids, source_event_ids, source_watchlist_ids,
          edited_by
        )
        SELECT
          $1::uuid, 1, bv.sections,
          bv.source_investigation_ids, bv.source_event_ids, bv.source_watchlist_ids,
          $2::uuid
        FROM workflow.briefing_versions AS bv
        WHERE bv.briefing_id = $3::uuid AND bv.version_number = $4
      `,
      [newId, session.sub, briefingId, current.currentVersion],
    );

    // Transition the original to superseded
    await client.query(
      `
        UPDATE workflow.briefings
        SET status = 'superseded'
        WHERE tenant_id = $5 AND id = $3::uuid
      `,
      [newId, session.sub, briefingId, current.currentVersion, session.tenantId],
    );

    return newId;
  });

  const newBriefing = await getBriefing(session.tenantId, newBriefingId);
  return NextResponse.json(newBriefing, { status: 201 });
}
