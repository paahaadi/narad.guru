import { NextResponse } from "next/server";
import { queryRow } from "@/lib/db";
import { listWatchlistRules } from "@/lib/workspaces/watchlists";
import { requireApiSession } from "../../_helpers";

export async function GET(request: Request, { params }: { params: Promise<{ watchlistId: string }> }) {
  const session = await requireApiSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { watchlistId } = await params;
  const rules = await listWatchlistRules(session.tenantId, watchlistId);
  return NextResponse.json(rules);
}

export async function POST(request: Request, { params }: { params: Promise<{ watchlistId: string }> }) {
  const session = await requireApiSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { watchlistId } = await params;
  const body = (await request.json()) as {
    ruleName?: string;
    description?: string;
    condition?: Record<string, unknown>;
    severityOverride?: string;
  };

  const ruleName = body.ruleName?.trim();
  if (!ruleName) return NextResponse.json({ error: "ruleName is required" }, { status: 400 });
  if (!body.condition || typeof body.condition !== "object") {
    return NextResponse.json({ error: "condition is required and must be an object" }, { status: 400 });
  }

  const row = await queryRow<{ id: string; created_at: Date }>(
    session.tenantId,
    `
      INSERT INTO workflow.watchlist_rules (
        tenant_id, watchlist_id, rule_name, description, condition, severity_override, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, TRUE)
      RETURNING id::text, created_at
    `,
    [
      session.tenantId,
      watchlistId,
      ruleName,
      body.description?.trim() || null,
      JSON.stringify(body.condition),
      body.severityOverride?.trim() || null,
    ],
  );

  return NextResponse.json({
    id: row!.id,
    watchlistId,
    ruleName,
    description: body.description?.trim() || null,
    condition: body.condition,
    severityOverride: body.severityOverride?.trim() || null,
    isActive: true,
    createdAt: row!.created_at.toISOString(),
  }, { status: 201 });
}
