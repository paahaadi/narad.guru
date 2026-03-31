import { NextResponse } from "next/server";
import { queryRow } from "@/lib/db";
import { requireApiSession } from "../../_helpers";

const VALID_TRANSITIONS: Record<string, string[]> = {
  new: ["triaged", "suppressed"],
  triaged: ["assigned", "suppressed"],
  assigned: ["acknowledged", "suppressed"],
  acknowledged: ["in_progress", "suppressed"],
  in_progress: ["resolved", "suppressed"],
};

export async function PATCH(request: Request, { params }: { params: Promise<{ alertId: string }> }) {
  const session = await requireApiSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { alertId } = await params;
  const body = (await request.json()) as { status?: string; assignedTo?: string };
  const newStatus = body.status?.trim();

  if (!newStatus) return NextResponse.json({ error: "status is required" }, { status: 400 });

  const current = await queryRow<{ status: string }>(
    session.tenantId,
    "SELECT status FROM workflow.watchlist_alerts WHERE tenant_id = $1 AND id = $2",
    [session.tenantId, alertId],
  );

  if (!current) return NextResponse.json({ error: "Alert not found" }, { status: 404 });

  const allowed = VALID_TRANSITIONS[current.status] ?? ["suppressed"];
  if (!allowed.includes(newStatus)) {
    return NextResponse.json(
      { error: `Cannot transition from '${current.status}' to '${newStatus}'` },
      { status: 422 },
    );
  }

  const timestampCol =
    newStatus === "triaged" ? "triaged_at" :
    newStatus === "resolved" ? "resolved_at" :
    null;

  const setClauses = ["status = $3", "updated_at = now()"];
  const values: unknown[] = [session.tenantId, alertId, newStatus];
  let paramIdx = 4;

  if (timestampCol) {
    setClauses.push(`${timestampCol} = now()`);
  }

  if (body.assignedTo && newStatus === "assigned") {
    setClauses.push(`assigned_to = $${paramIdx}`);
    values.push(body.assignedTo);
    paramIdx++;
  }

  const row = await queryRow<{
    id: string; status: string; severity: string; title: string;
    updated_at: Date;
  }>(
    session.tenantId,
    `
      UPDATE workflow.watchlist_alerts
      SET ${setClauses.join(", ")}
      WHERE tenant_id = $1 AND id = $2
      RETURNING id::text, status, severity, title, updated_at
    `,
    values,
  );

  return NextResponse.json(row);
}
