import { NextResponse } from "next/server";
import { queryRow } from "@/lib/db";
import { listInvestigationItems } from "@/lib/workspaces/investigations";
import { requireApiSession } from "../../_helpers";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ investigationId: string }> },
) {
  const session = await requireApiSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { investigationId } = await params;
  const url = new URL(request.url);
  const itemType = url.searchParams.get("itemType") ?? undefined;
  const role = url.searchParams.get("role") ?? undefined;

  const items = await listInvestigationItems(session.tenantId, investigationId, { itemType, role });
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
    itemType?: string;
    itemId?: string;
    role?: string;
    notes?: string;
  };

  const itemType = body.itemType?.trim();
  const itemId = body.itemId?.trim();
  if (!itemType || !itemId) {
    return NextResponse.json({ error: "itemType and itemId are required" }, { status: 400 });
  }

  const validItemTypes = ["event", "entity", "document", "claim"];
  if (!validItemTypes.includes(itemType)) {
    return NextResponse.json({ error: "Invalid itemType" }, { status: 400 });
  }

  const role = body.role?.trim() || "evidence";
  const validRoles = ["key_evidence", "supporting", "context", "lead", "exculpatory", "disputed"];
  if (!validRoles.includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const row = await queryRow<{
    id: string;
    created_at: Date;
  }>(
    session.tenantId,
    `
      INSERT INTO workflow.investigation_items (investigation_id, item_type, item_id, role, added_by, notes)
      VALUES ($1::uuid, $2, $3::uuid, $4, $5::uuid, $6)
      RETURNING id::text, created_at
    `,
    [investigationId, itemType, itemId, role, session.sub, body.notes?.trim() || null],
  );

  return NextResponse.json(
    {
      id: row!.id,
      itemType,
      itemId,
      role,
      addedBy: session.sub,
      addedByName: session.sub,
      notes: body.notes?.trim() || null,
      createdAt: row!.created_at.toISOString(),
    },
    { status: 201 },
  );
}
