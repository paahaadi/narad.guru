import { NextResponse } from "next/server";
import { queryRow } from "@/lib/db";
import { listInvestigations } from "@/lib/workspaces/investigations";
import { requireApiSession } from "./_helpers";

export async function GET(request: Request) {
  const session = await requireApiSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? undefined;
  const limit = Number(url.searchParams.get("limit") ?? 20);
  const offset = Number(url.searchParams.get("offset") ?? 0);

  const result = await listInvestigations(session.tenantId, { status, limit, offset });
  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const session = await requireApiSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as {
    title?: string;
    description?: string;
    classification?: string;
    hypothesis?: string;
  };

  const title = body.title?.trim();
  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });

  const classification = body.classification?.trim() || "unclassified";
  const validClassifications = ["unclassified", "restricted", "confidential", "secret"];
  if (!validClassifications.includes(classification)) {
    return NextResponse.json({ error: "Invalid classification" }, { status: 400 });
  }

  const row = await queryRow<{
    id: string;
    status: string;
    created_at: Date;
    updated_at: Date;
  }>(
    session.tenantId,
    `
      INSERT INTO workflow.investigations (tenant_id, owner_id, title, description, classification, hypothesis)
      VALUES ($1, $2::uuid, $3, $4, $5, $6)
      RETURNING id::text, status, created_at, updated_at
    `,
    [
      session.tenantId,
      session.sub,
      title,
      body.description?.trim() || null,
      classification,
      body.hypothesis?.trim() || null,
    ],
  );

  return NextResponse.json(
    {
      id: row!.id,
      title,
      description: body.description?.trim() || null,
      status: row!.status,
      classification,
      confidence: null,
      hypothesis: body.hypothesis?.trim() || null,
      ownerName: session.sub,
      ownerId: session.sub,
      itemCount: 0,
      evidenceCount: 0,
      noteCount: 0,
      createdAt: row!.created_at.toISOString(),
      updatedAt: row!.updated_at.toISOString(),
    },
    { status: 201 },
  );
}
