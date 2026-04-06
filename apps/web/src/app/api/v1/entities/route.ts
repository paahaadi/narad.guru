import { NextResponse } from "next/server";
import { requireApiKey, logApiUsage } from "@/lib/api-auth";
import { queryRows } from "@/lib/db";

type EntityRow = {
  id: string;
  entity_type: string;
  canonical_name: string;
  aliases: string[];
  description: string | null;
  state_code: string | null;
  district_code: string | null;
  risk_score: number | string | null;
  health_score: number | string | null;
  created_at: Date | string;
};

export async function GET(request: Request) {
  const start = Date.now();
  const { principal, error } = await requireApiKey(request);

  if (error) {
    return NextResponse.json(error.body, { status: error.status });
  }

  if (!principal.scopes.includes("read")) {
    return NextResponse.json({ error: "Insufficient scope" }, { status: 403 });
  }

  const url = new URL(request.url);
  const entityType = url.searchParams.get("entity_type");
  const search = url.searchParams.get("q");
  const stateCode = url.searchParams.get("state_code");
  const limitRaw = Number(url.searchParams.get("limit") ?? 25);
  const limit = Math.min(Math.max(limitRaw, 1), 100);

  const conditions: string[] = ["tenant_id = $1"];
  const values: unknown[] = [principal.tenantId];
  let idx = 2;

  if (entityType) {
    conditions.push(`entity_type = $${idx}`);
    values.push(entityType);
    idx++;
  }
  if (stateCode) {
    conditions.push(`state_code = $${idx}`);
    values.push(stateCode);
    idx++;
  }
  if (search) {
    conditions.push(`tsv @@ plainto_tsquery('english', $${idx})`);
    values.push(search);
    idx++;
  }

  const rows = await queryRows<EntityRow>(
    principal.tenantId,
    `
      SELECT
        id::text, entity_type, canonical_name, aliases,
        description, state_code, district_code,
        risk_score, health_score, created_at
      FROM core.entities
      WHERE ${conditions.join(" AND ")}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `,
    values,
  );

  const entities = rows.map((r) => ({
    id: r.id,
    entityType: r.entity_type,
    canonicalName: r.canonical_name,
    aliases: r.aliases,
    description: r.description,
    stateCode: r.state_code,
    districtCode: r.district_code,
    riskScore: r.risk_score != null ? Number(r.risk_score) : null,
    healthScore: r.health_score != null ? Number(r.health_score) : null,
    createdAt:
      r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
  }));

  logApiUsage(
    principal.apiKeyId,
    principal.tenantId,
    "/api/v1/entities",
    "GET",
    200,
    Date.now() - start,
  );

  return NextResponse.json({
    data: entities,
    meta: { count: entities.length, limit },
  });
}
