import { NextResponse } from "next/server";
import { queryRow } from "@/lib/db";
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

  if (current.status !== "under_review") {
    return NextResponse.json(
      { error: `Cannot approve briefing with status '${current.status}'. Must be 'under_review'.` },
      { status: 422 },
    );
  }

  await queryRow(
    session.tenantId,
    `
      UPDATE workflow.briefings
      SET status = 'approved', approved_by = $1::uuid, approved_at = now()
      WHERE tenant_id = $2 AND id = $3::uuid
    `,
    [session.sub, session.tenantId, briefingId],
  );

  const updated = await getBriefing(session.tenantId, briefingId);
  return NextResponse.json(updated);
}
