import { NextResponse } from "next/server";
import { queryRow } from "@/lib/db";
import { listInvestigationNotes } from "@/lib/workspaces/investigations";
import { requireApiSession } from "../../_helpers";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ investigationId: string }> },
) {
  const session = await requireApiSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { investigationId } = await params;
  const url = new URL(request.url);
  const noteType = url.searchParams.get("noteType") ?? undefined;

  const items = await listInvestigationNotes(session.tenantId, investigationId, { noteType });
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
    body?: string;
    noteType?: string;
  };

  const noteBody = body.body?.trim();
  if (!noteBody) {
    return NextResponse.json({ error: "body is required" }, { status: 400 });
  }

  const noteType = body.noteType?.trim() || "note";
  const validNoteTypes = ["note", "hypothesis", "task", "decision"];
  if (!validNoteTypes.includes(noteType)) {
    return NextResponse.json({ error: "Invalid noteType" }, { status: 400 });
  }

  const row = await queryRow<{
    id: string;
    verification_status: string;
    created_at: Date;
    updated_at: Date;
  }>(
    session.tenantId,
    `
      INSERT INTO workflow.investigation_notes (investigation_id, author_id, note_type, body)
      VALUES ($1::uuid, $2::uuid, $3, $4)
      RETURNING id::text, verification_status, created_at, updated_at
    `,
    [investigationId, session.sub, noteType, noteBody],
  );

  return NextResponse.json(
    {
      id: row!.id,
      noteType,
      body: noteBody,
      authorId: session.sub,
      authorName: session.sub,
      isAiGenerated: false,
      verificationStatus: row!.verification_status,
      createdAt: row!.created_at.toISOString(),
      updatedAt: row!.updated_at.toISOString(),
    },
    { status: 201 },
  );
}
