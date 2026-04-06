import { NextResponse } from "next/server";
import { queryRow } from "@/lib/db";
import { listInvestigationEvidence } from "@/lib/workspaces/investigations";
import { requireApiSession } from "../../_helpers";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ investigationId: string }> },
) {
  const session = await requireApiSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { investigationId } = await params;
  const items = await listInvestigationEvidence(session.tenantId, investigationId);
  return NextResponse.json({ items });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ investigationId: string }> },
) {
  const session = await requireApiSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { investigationId } = await params;
  const body = (await request.json()) as {
    documentId?: string;
    evidenceHash?: string;
    s3KeyWorm?: string;
  };

  const documentId = body.documentId?.trim();
  const evidenceHash = body.evidenceHash?.trim();
  const s3KeyWorm = body.s3KeyWorm?.trim();

  if (!documentId || !evidenceHash || !s3KeyWorm) {
    return NextResponse.json(
      { error: "documentId, evidenceHash, and s3KeyWorm are required" },
      { status: 400 },
    );
  }

  const row = await queryRow<{
    id: string;
    created_at: Date;
  }>(
    session.tenantId,
    `
      INSERT INTO workflow.investigation_evidence (investigation_id, document_id, evidence_hash, s3_key_worm)
      VALUES ($1::uuid, $2::uuid, $3, $4)
      RETURNING id::text, created_at
    `,
    [investigationId, documentId, evidenceHash, s3KeyWorm],
  );

  // Log custody entry for the newly attached evidence
  await queryRow(
    session.tenantId,
    `
      INSERT INTO workflow.evidence_custody_log (evidence_id, user_id, action, evidence_hash_at_action, ip_address)
      VALUES ($1::uuid, $2::uuid, 'ingested', $3, NULL)
    `,
    [row!.id, session.sub, evidenceHash],
  );

  return NextResponse.json(
    {
      id: row!.id,
      documentId,
      documentTitle: "Evidence document",
      evidenceHash,
      s3KeyWorm,
      isVerified: false,
      verifiedBy: null,
      verifiedByName: null,
      verifiedAt: null,
      createdAt: row!.created_at.toISOString(),
    },
    { status: 201 },
  );
}
