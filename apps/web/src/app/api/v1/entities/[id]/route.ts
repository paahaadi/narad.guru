import { NextResponse } from "next/server";
import { requireApiKey, logApiUsage } from "@/lib/api-auth";
import { queryRow } from "@/lib/db";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const start = Date.now();
  const { principal, error } = await requireApiKey(request);

  if (error) {
    return NextResponse.json(error.body, { status: error.status });
  }

  if (!principal.scopes.includes("read")) {
    return NextResponse.json({ error: "Insufficient scope — 'read' required" }, { status: 403 });
  }

  // Next.js 15+ resolution compatibility pattern
  const resolvedParams = await Promise.resolve(params);
  const id = resolvedParams.id;

  try {
    const row = await queryRow(
      principal.tenantId,
      `
        SELECT id, canonical_name, entity_type, aliases, external_ids, resolution_confidence, created_at, updated_at
        FROM core.entities
        WHERE tenant_id = $1 AND id = $2
      `,
      [principal.tenantId, id]
    );

    const status = row ? 200 : 404;

    logApiUsage(
      principal.apiKeyId,
      principal.tenantId,
      `/api/v1/entities/${id}`,
      "GET",
      status,
      Date.now() - start
    );

    if (!row) {
      return NextResponse.json({ error: "Entity not found" }, { status: 404 });
    }

    return NextResponse.json({ data: row });
  } catch (err) {
    console.error("Failed to fetch entity details:", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
