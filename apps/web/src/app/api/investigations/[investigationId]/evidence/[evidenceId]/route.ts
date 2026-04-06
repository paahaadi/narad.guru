import { NextResponse } from "next/server";
import { queryRow } from "@/lib/db";
import { requireApiSession } from "../../../_helpers";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ investigationId: string; evidenceId: string }> },
) {
  const session = await requireApiSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { evidenceId } = await params;
  const body = (await request.json()) as { action?: "verified" | "challenged" };

  if (!body.action || !["verified", "challenged"].includes(body.action)) {
    return NextResponse.json({ error: "action must be 'verified' or 'challenged'" }, { status: 400 });
  }

  const isVerified = body.action === "verified";

  const row = await queryRow<{
    id: string;
    is_verified: boolean;
    verified_by: string | null;
    verified_at: Date | null;
    evidence_hash: string;
  }>(
    session.tenantId,
    `
      UPDATE workflow.investigation_evidence
      SET is_verified = $1, verified_by = $2::uuid, verified_at = now()
      WHERE id = $3::uuid
      RETURNING id::text, is_verified, verified_by::text, verified_at, evidence_hash
    `,
    [isVerified, session.sub, evidenceId],
  );

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Log custody action
  await queryRow(
    session.tenantId,
    `
      INSERT INTO workflow.evidence_custody_log (evidence_id, user_id, action, evidence_hash_at_action, ip_address)
      VALUES ($1::uuid, $2::uuid, $3, $4, NULL)
    `,
    [evidenceId, session.sub, body.action, row.evidence_hash],
  );

  return NextResponse.json({
    id: row.id,
    isVerified: row.is_verified,
    verifiedBy: row.verified_by,
    verifiedAt: row.verified_at?.toISOString() ?? null,
  });
}
