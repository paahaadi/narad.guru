import { NextResponse } from "next/server";
import { queryRow } from "@/lib/db";
import { getInvestigation } from "@/lib/workspaces/investigations";
import { requireApiSession } from "../_helpers";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ investigationId: string }> },
) {
  const session = await requireApiSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { investigationId } = await params;
  const investigation = await getInvestigation(session.tenantId, investigationId);
  if (!investigation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(investigation);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ investigationId: string }> },
) {
  const session = await requireApiSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { investigationId } = await params;
  const body = (await request.json()) as {
    title?: string;
    description?: string;
    confidence?: number;
    hypothesis?: string;
    status?: string;
  };

  const sets: string[] = [];
  const values: unknown[] = [session.tenantId, investigationId];
  let paramIdx = 3;

  if (body.title !== undefined) {
    sets.push(`title = $${paramIdx++}`);
    values.push(body.title.trim());
  }
  if (body.description !== undefined) {
    sets.push(`description = $${paramIdx++}`);
    values.push(body.description.trim() || null);
  }
  if (body.confidence !== undefined) {
    sets.push(`confidence = $${paramIdx++}`);
    values.push(body.confidence);
  }
  if (body.hypothesis !== undefined) {
    sets.push(`hypothesis = $${paramIdx++}`);
    values.push(body.hypothesis.trim() || null);
  }
  if (body.status !== undefined) {
    const validStatuses = ["draft", "under_review", "active", "on_hold", "closed", "archived"];
    if (!validStatuses.includes(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    sets.push(`status = $${paramIdx++}`);
    values.push(body.status);
  }

  if (sets.length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const row = await queryRow<{ updated_at: Date }>(
    session.tenantId,
    `
      UPDATE workflow.investigations
      SET ${sets.join(", ")}
      WHERE tenant_id = $1 AND id = $2::uuid
      RETURNING updated_at
    `,
    values,
  );

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await getInvestigation(session.tenantId, investigationId);
  return NextResponse.json(updated);
}
