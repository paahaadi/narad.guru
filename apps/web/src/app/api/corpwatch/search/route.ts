import { NextResponse } from "next/server";
import { queryRows } from "@/lib/db";
import { asArray, asNumber, asOptionalString, asRecord, asString } from "@/lib/workspaces/shared";
import { requireApiSession } from "../_helpers";

type SearchRow = {
  entity_id: string;
  canonical_name: string;
  entity_type: string;
  description: string | null;
  risk_score: string | number | null;
  health_score: string | number | null;
  aliases: string[] | null;
  external_ids: unknown;
  location_label: string | null;
  is_resolved: boolean | null;
  updated_at: Date | string | null;
  match_type: string;
};

export async function GET(request: Request) {
  const session = await requireApiSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = new URL(request.url).searchParams;
  const query = searchParams.get("q")?.trim() ?? "";
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? 20) || 20, 1), 50);

  if (!query) {
    return NextResponse.json({ query, limit, items: [] });
  }

  const rows = await queryRows<SearchRow>(
    session.tenantId,
    `
      SELECT
        e.id::text AS entity_id,
        e.canonical_name,
        e.entity_type,
        e.description,
        e.risk_score,
        e.health_score,
        e.aliases,
        e.external_ids,
        COALESCE(
          ps.summary->'location'->>'label',
          CONCAT_WS(' • ', ps.summary->'location'->>'district_code', ps.summary->'location'->>'state_code')
        ) AS location_label,
        COALESCE((ps.summary->>'is_resolved')::boolean, false) AS is_resolved,
        e.updated_at,
        CASE
          WHEN LOWER(e.canonical_name) = LOWER($2) THEN 'exact'
          WHEN e.external_ids::text ILIKE '%' || $2 || '%' THEN 'structured-id'
          WHEN e.canonical_name ILIKE $2 || '%' THEN 'prefix'
          WHEN to_tsvector('english',
              COALESCE(e.canonical_name, '') || ' ' ||
              COALESCE(e.description, '') || ' ' ||
              COALESCE(array_to_string(COALESCE(e.aliases, '{}'::text[]), ' '), '')
            ) @@ websearch_to_tsquery('english', $2) THEN 'text'
          ELSE 'broad'
        END AS match_type
      FROM core.entities AS e
      LEFT JOIN projections.entity_summaries AS ps
        ON ps.entity_id = e.id AND ps.tenant_id = e.tenant_id
      WHERE e.tenant_id = $1
        AND (
          e.canonical_name ILIKE '%' || $2 || '%'
          OR COALESCE(e.description, '') ILIKE '%' || $2 || '%'
          OR COALESCE(array_to_string(COALESCE(e.aliases, '{}'::text[]), ' '), '') ILIKE '%' || $2 || '%'
          OR e.external_ids::text ILIKE '%' || $2 || '%'
          OR to_tsvector('english',
              COALESCE(e.canonical_name, '') || ' ' ||
              COALESCE(e.description, '') || ' ' ||
              COALESCE(array_to_string(COALESCE(e.aliases, '{}'::text[]), ' '), '')
            ) @@ websearch_to_tsquery('english', $2)
        )
      ORDER BY
        CASE
          WHEN LOWER(e.canonical_name) = LOWER($2) THEN 0
          WHEN e.external_ids::text ILIKE '%' || $2 || '%' THEN 1
          WHEN e.canonical_name ILIKE $2 || '%' THEN 2
          WHEN to_tsvector('english',
              COALESCE(e.canonical_name, '') || ' ' ||
              COALESCE(e.description, '') || ' ' ||
              COALESCE(array_to_string(COALESCE(e.aliases, '{}'::text[]), ' '), '')
            ) @@ websearch_to_tsquery('english', $2) THEN 3
          ELSE 4
        END,
        COALESCE(e.risk_score, 0) DESC,
        e.updated_at DESC
      LIMIT $3
    `,
    [session.tenantId, query, limit],
  );

  return NextResponse.json({
    query,
    limit,
    items: rows.map((row) => ({
      entityId: row.entity_id,
      canonicalName: row.canonical_name,
      entityType: row.entity_type,
      description: asString(row.description, ""),
      riskScore: asNumber(row.risk_score),
      healthScore: asNumber(row.health_score),
      locationLabel: asOptionalString(row.location_label) ?? "Location pending",
      aliases: asArray<string>(row.aliases),
      externalIds: asRecord(row.external_ids) as Record<string, string>,
      matchType: asString(row.match_type, "broad"),
      isResolved: Boolean(row.is_resolved),
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at ? String(row.updated_at) : null,
    })),
  });
}
