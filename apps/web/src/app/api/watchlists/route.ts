import { NextResponse } from "next/server";
import { queryRow } from "@/lib/db";
import { listWatchlists } from "@/lib/workspaces/watchlists";
import { requireApiSession } from "./_helpers";

export async function GET(request: Request) {
  const session = await requireApiSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const items = await listWatchlists(session.tenantId);
  return NextResponse.json(items);
}

export async function POST(request: Request) {
  const session = await requireApiSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as { name?: string; description?: string; category?: string };
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const row = await queryRow<{ id: string; created_at: Date; updated_at: Date }>(
    session.tenantId,
    `
      INSERT INTO workflow.watchlists (tenant_id, name, description, category, is_active)
      VALUES ($1, $2, $3, $4, TRUE)
      RETURNING id::text, created_at, updated_at
    `,
    [session.tenantId, name, body.description?.trim() || null, body.category?.trim() || null],
  );

  return NextResponse.json({
    id: row!.id,
    name,
    description: body.description?.trim() || null,
    isActive: true,
    isPriority: false,
    category: body.category?.trim() || null,
    folderPath: "/",
    ruleCount: 0,
    alertCount: 0,
    createdAt: row!.created_at.toISOString(),
    updatedAt: row!.updated_at.toISOString(),
  }, { status: 201 });
}
