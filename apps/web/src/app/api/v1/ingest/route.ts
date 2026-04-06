import { NextResponse } from "next/server";
import { requireApiKey, logApiUsage } from "@/lib/api-auth";
import { queryRow } from "@/lib/db";

type InsertedRow = {
  id: string;
  created_at: Date;
};

export async function POST(request: Request) {
  const start = Date.now();
  const { principal, error } = await requireApiKey(request);

  if (error) {
    return NextResponse.json(error.body, { status: error.status });
  }

  if (!principal.scopes.includes("write")) {
    return NextResponse.json({ error: "Insufficient scope — 'write' required" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const summary = typeof body.summary === "string" ? body.summary.trim() : "";
  const eventType = typeof body.eventType === "string" ? body.eventType.trim() : "regulatory";
  const severity = typeof body.severity === "string" ? body.severity.trim() : "medium";
  const confidence = typeof body.confidence === "number" ? body.confidence : 0.5;
  const stateCode = typeof body.stateCode === "string" ? body.stateCode.trim() : null;
  const districtCode = typeof body.districtCode === "string" ? body.districtCode.trim() : null;
  const metadata = typeof body.metadata === "object" && body.metadata !== null ? body.metadata : {};

  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const validSeverities = ["critical", "high", "medium", "low", "informational"];
  if (!validSeverities.includes(severity)) {
    return NextResponse.json(
      { error: `Invalid severity. Must be one of: ${validSeverities.join(", ")}` },
      { status: 400 },
    );
  }

  const row = await queryRow<InsertedRow>(
    principal.tenantId,
    `
      INSERT INTO core.events (
        tenant_id, event_type, title, summary, severity, confidence,
        status, state_code, district_code, source_count, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'ingested', $7, $8, 1, $9::jsonb)
      RETURNING id::text, created_at
    `,
    [
      principal.tenantId,
      eventType,
      title,
      summary || title,
      severity,
      confidence,
      stateCode,
      districtCode,
      JSON.stringify(metadata),
    ],
  );

  const status = row ? 201 : 500;

  logApiUsage(
    principal.apiKeyId,
    principal.tenantId,
    "/api/v1/ingest",
    "POST",
    status,
    Date.now() - start,
  );

  if (!row) {
    return NextResponse.json({ error: "Failed to create event" }, { status: 500 });
  }

  return NextResponse.json(
    {
      data: {
        id: row.id,
        eventType,
        title,
        severity,
        status: "ingested",
        createdAt: row.created_at.toISOString(),
      },
    },
    { status: 201 },
  );
}
