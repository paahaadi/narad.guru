import { NextResponse } from "next/server";
import { requireApiKey, logApiUsage } from "@/lib/api-auth";
import { queryRows } from "@/lib/db";

export async function GET(request: Request) {
  const start = Date.now();
  const { principal, error } = await requireApiKey(request);

  if (error) {
    return NextResponse.json(error.body, { status: error.status });
  }

  if (!principal.scopes.includes("read")) {
    return NextResponse.json({ error: "Insufficient scope — 'read' required" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") || "";
  const type = searchParams.get("type") || "";

  let sql = `
    SELECT id, canonical_name, entity_type, aliases, external_ids, resolution_confidence, created_at, updated_at
    FROM core.entities
    WHERE tenant_id = $1 AND is_resolved = TRUE
  `;
  const params: unknown[] = [principal.tenantId];

  if (type) {
    params.push(type);
    sql += ` AND entity_type = $${params.length}`;
  }

  if (q) {
    params.push(`%${q}%`);
    sql += ` AND (canonical_name ILIKE $${params.length} OR EXISTS (SELECT 1 FROM unnest(aliases) a WHERE a ILIKE $${params.length}))`;
  }

  sql += ` ORDER BY updated_at DESC LIMIT 50`;

  let rows;
  try {
    rows = await queryRows<any>(principal.tenantId, sql, params);
  } catch (err) {
    console.error("Failed to fetch entities:", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  logApiUsage(
    principal.apiKeyId,
    principal.tenantId,
    "/api/v1/entities",
    "GET",
    200,
    Date.now() - start
  );

  return NextResponse.json({ data: rows });
}
