import { NextResponse } from "next/server";
import { queryRow } from "@/lib/db";
import { getBriefing } from "@/lib/workspaces/briefings";
import { requireApiSession } from "../_helpers";

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ["under_review"],
  under_review: ["draft"],
  approved: ["draft"],
  published: ["superseded", "withdrawn"],
  superseded: [],
  withdrawn: [],
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ briefingId: string }> },
) {
  const session = await requireApiSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { briefingId } = await params;
  const briefing = await getBriefing(session.tenantId, briefingId);
  if (!briefing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(briefing);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ briefingId: string }> },
) {
  const session = await requireApiSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { briefingId } = await params;
  const body = (await request.json()) as {
    title?: string;
    audience?: string;
    status?: string;
  };

  // Validate status transition if provided
  if (body.status !== undefined) {
    if (body.status === "approved") {
      return NextResponse.json(
        { error: "Use POST /api/briefings/:id/approve to approve" },
        { status: 422 },
      );
    }

    const current = await getBriefing(session.tenantId, briefingId);
    if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const allowed = VALID_TRANSITIONS[current.status] ?? [];
    if (!allowed.includes(body.status)) {
      return NextResponse.json(
        { error: `Cannot transition from '${current.status}' to '${body.status}'` },
        { status: 422 },
      );
    }
  }

  const sets: string[] = [];
  const values: unknown[] = [session.tenantId, briefingId];
  let paramIdx = 3;

  if (body.title !== undefined) {
    sets.push(`title = $${paramIdx++}`);
    values.push(body.title.trim());
  }
  if (body.audience !== undefined) {
    sets.push(`audience = $${paramIdx++}`);
    values.push(body.audience.trim() || null);
  }
  if (body.status !== undefined) {
    sets.push(`status = $${paramIdx++}`);
    values.push(body.status);
  }

  if (sets.length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const row = await queryRow<{ updated_at: Date }>(
    session.tenantId,
    `
      UPDATE workflow.briefings
      SET ${sets.join(", ")}
      WHERE tenant_id = $1 AND id = $2::uuid
      RETURNING updated_at
    `,
    values,
  );

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await getBriefing(session.tenantId, briefingId);
  return NextResponse.json(updated);
}
