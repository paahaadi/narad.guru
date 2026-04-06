import { NextResponse } from "next/server";
import { queryRow, withTenant } from "@/lib/db";
import { listBriefings, getBriefing } from "@/lib/workspaces/briefings";
import { requireApiSession } from "./_helpers";

export async function GET(request: Request) {
  const session = await requireApiSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? undefined;
  const audience = url.searchParams.get("audience") ?? undefined;
  const limit = Number(url.searchParams.get("limit") ?? 20);
  const offset = Number(url.searchParams.get("offset") ?? 0);

  const result = await listBriefings(session.tenantId, { status, audience, limit, offset });
  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const session = await requireApiSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as { title?: string; audience?: string };
  const title = body.title?.trim();
  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });

  const briefingId = await withTenant(session.tenantId, async (client) => {
    const briefingResult = await client.query<{ id: string }>(
      `
        INSERT INTO workflow.briefings (tenant_id, owner_id, title, audience)
        VALUES ($1, $2::uuid, $3, $4)
        RETURNING id::text
      `,
      [session.tenantId, session.sub, title, body.audience?.trim() || null],
    );

    const id = briefingResult.rows[0].id;

    // Create initial version 1 with empty sections
    await client.query(
      `
        INSERT INTO workflow.briefing_versions (briefing_id, version_number, sections, edited_by)
        VALUES ($1::uuid, 1, $2::jsonb, $3::uuid)
      `,
      [id, JSON.stringify([]), session.sub],
    );

    return id;
  });

  const detail = await getBriefing(session.tenantId, briefingId);
  return NextResponse.json(detail, { status: 201 });
}
