import { NextResponse } from "next/server";
import { requireSessionFromRequest } from "@/lib/auth";
import { getSourceBySlug } from "@/lib/workspaces/sources";
import { queryRow } from "@/lib/db";

type RouteContext = { params: Promise<{ sourceSlug: string }> };

export async function GET(request: Request, context: RouteContext) {
  let session;
  try {
    session = await requireSessionFromRequest(request);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sourceSlug } = await context.params;
  const source = await getSourceBySlug(session.tenantId, sourceSlug);
  if (!source) {
    return NextResponse.json({ error: "Source not found" }, { status: 404 });
  }

  return NextResponse.json({ data: source });
}

export async function POST(request: Request, context: RouteContext) {
  let session;
  try {
    session = await requireSessionFromRequest(request);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.role !== "admin" && session.role !== "analyst") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { sourceSlug } = await context.params;

  // Look up source ID by slug
  type IdRow = { id: string };
  const row = await queryRow<IdRow>(
    session.tenantId,
    `SELECT id::text FROM core.sources WHERE tenant_id = $1 AND slug = $2`,
    [session.tenantId, sourceSlug],
  );

  if (!row) {
    return NextResponse.json({ error: "Source not found" }, { status: 404 });
  }

  // Trigger ingest via intelligence service
  const intelligenceUrl = process.env.INTELLIGENCE_SERVICE_URL || "http://localhost:8000";
  const internalKey = process.env.INTERNAL_API_KEY || "";

  const res = await fetch(`${intelligenceUrl}/internal/trigger-ingest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Key": internalKey,
    },
    body: JSON.stringify({ source_id: row.id }),
  });

  if (!res.ok) {
    return NextResponse.json(
      { error: "Failed to trigger ingest", detail: await res.text() },
      { status: 502 },
    );
  }

  return NextResponse.json({
    message: "Ingest triggered",
    sourceSlug,
    sourceId: row.id,
  });
}
