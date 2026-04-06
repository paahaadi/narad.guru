import { NextResponse } from "next/server";
import { requireApiKey, logApiUsage } from "@/lib/api-auth";
import { queryRows } from "@/lib/db";

type EventRow = {
  id: string;
  event_type: string;
  title: string;
  summary: string | null;
  severity: string;
  confidence: number | string;
  status: string;
  state_code: string | null;
  district_code: string | null;
  source_count: number;
  occurred_at: Date | string | null;
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
  const eventType = url.searchParams.get("event_type");
  const severity = url.searchParams.get("severity");
  const stateCode = url.searchParams.get("state_code");
  const status = url.searchParams.get("status");
  const limitRaw = Number(url.searchParams.get("limit") ?? 25);
  const limit = Math.min(Math.max(limitRaw, 1), 100);

  const conditions: string[] = ["tenant_id = $1"];
  const values: unknown[] = [principal.tenantId];
  let idx = 2;

  if (eventType) {
    conditions.push(`event_type = $${idx}`);
    values.push(eventType);
    idx++;
  }
  if (severity) {
    conditions.push(`severity = $${idx}`);
    values.push(severity);
    idx++;
  }
  if (stateCode) {
    conditions.push(`state_code = $${idx}`);
    values.push(stateCode);
    idx++;
  }
  if (status) {
    conditions.push(`status = $${idx}`);
    values.push(status);
    idx++;
  }

  const rows = await queryRows<EventRow>(
    principal.tenantId,
    `
      SELECT
        id::text, event_type, title, summary, severity,
        confidence, status, state_code, district_code,
        source_count, occurred_at, created_at
      FROM core.events
      WHERE ${conditions.join(" AND ")}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `,
    values,
  );

  const events = rows.map((r) => ({
    id: r.id,
    eventType: r.event_type,
    title: r.title,
    summary: r.summary,
    severity: r.severity,
    confidence: Number(r.confidence),
    status: r.status,
    stateCode: r.state_code,
    districtCode: r.district_code,
    sourceCount: r.source_count,
    occurredAt:
      r.occurred_at instanceof Date ? r.occurred_at.toISOString() : r.occurred_at,
    createdAt:
      r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
  }));

  const responseStatus = 200;
  logApiUsage(
    principal.apiKeyId,
    principal.tenantId,
    "/api/v1/events",
    "GET",
    responseStatus,
    Date.now() - start,
  );

  return NextResponse.json({
    data: events,
    meta: { count: events.length, limit },
  });
}
