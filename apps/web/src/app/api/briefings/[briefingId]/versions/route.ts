import { NextResponse } from "next/server";
import { queryRow, withTenant } from "@/lib/db";
import { listBriefingVersions } from "@/lib/workspaces/briefings";
import type { BriefingSection } from "@/lib/workspaces/briefings";
import { requireApiSession } from "../../_helpers";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ briefingId: string }> },
) {
  const session = await requireApiSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { briefingId } = await params;
  const items = await listBriefingVersions(session.tenantId, briefingId);
  return NextResponse.json({ items });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ briefingId: string }> },
) {
  const session = await requireApiSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { briefingId } = await params;
  const body = (await request.json()) as {
    sections?: BriefingSection[];
    sourceInvestigationIds?: string[];
    sourceEventIds?: string[];
    sourceWatchlistIds?: string[];
    aiDraftModel?: string;
  };

  if (!body.sections || !Array.isArray(body.sections)) {
    return NextResponse.json({ error: "sections array is required" }, { status: 400 });
  }

  const version = await withTenant(session.tenantId, async (client) => {
    // Increment current_version on the briefing
    const briefingResult = await client.query<{ current_version: number }>(
      `
        UPDATE workflow.briefings
        SET current_version = current_version + 1
        WHERE tenant_id = $1 AND id = $2::uuid
        RETURNING current_version
      `,
      [session.tenantId, briefingId],
    );

    if (briefingResult.rows.length === 0) return null;
    const newVersion = briefingResult.rows[0].current_version;

    // Create the version record
    const versionResult = await client.query<{ id: string; created_at: Date }>(
      `
        INSERT INTO workflow.briefing_versions (
          briefing_id, version_number, sections,
          source_investigation_ids, source_event_ids, source_watchlist_ids,
          ai_draft_model, edited_by
        )
        VALUES ($1::uuid, $2, $3::jsonb, $4::uuid[], $5::uuid[], $6::uuid[], $7, $8::uuid)
        RETURNING id::text, created_at
      `,
      [
        briefingId,
        newVersion,
        JSON.stringify(body.sections),
        body.sourceInvestigationIds ?? [],
        body.sourceEventIds ?? [],
        body.sourceWatchlistIds ?? [],
        body.aiDraftModel ?? null,
        session.sub,
      ],
    );

    return {
      id: versionResult.rows[0].id,
      versionNumber: newVersion,
      createdAt: versionResult.rows[0].created_at,
    };
  });

  if (!version) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(
    {
      id: version.id,
      versionNumber: version.versionNumber,
      sections: body.sections,
      sourceInvestigationIds: body.sourceInvestigationIds ?? [],
      sourceEventIds: body.sourceEventIds ?? [],
      sourceWatchlistIds: body.sourceWatchlistIds ?? [],
      aiDraftModel: body.aiDraftModel ?? null,
      editedBy: session.sub,
      editedByName: session.sub,
      createdAt: version.createdAt.toISOString(),
    },
    { status: 201 },
  );
}
