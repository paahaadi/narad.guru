import { NextResponse } from "next/server";
import { queryRow, queryRows } from "@/lib/db";
import { asArray, asNumber, asOptionalString, asRecord, asString } from "@/lib/workspaces/shared";
import type { CorpWatchNarrative } from "@/lib/workspaces/corpwatch-types";
import { getIntelligenceServiceUrl, requireApiSession, tenantHeaders } from "../../_helpers";

async function buildFallbackNarrative(tenantId: string, entityId: string) {
  const profile = await queryRow<{
    entity_id: string;
    canonical_name: string;
    entity_type: string;
    description: string | null;
    risk_score: string | number | null;
    summary: unknown;
  }>(
    tenantId,
    `
      SELECT
        e.id::text AS entity_id,
        e.canonical_name,
        e.entity_type,
        e.description,
        e.risk_score,
        ps.summary
      FROM core.entities AS e
      LEFT JOIN projections.entity_summaries AS ps
        ON ps.entity_id = e.id AND ps.tenant_id = e.tenant_id
      WHERE e.tenant_id = $1 AND e.id = $2::uuid
    `,
    [tenantId, entityId],
  );
  if (!profile) {
    return null;
  }

  const summary = asRecord(profile.summary);
  const corpWatch = asRecord(summary.corp_watch);
  const recentEvents = asArray<Record<string, unknown>>(summary.recent_events);
  const relationships = asArray<Record<string, unknown>>(summary.key_relationships);

  const firstSentence = `${profile.canonical_name} is tracked as a ${profile.entity_type}`;
  const secondSentence = recentEvents.length
    ? `Recent activity includes ${asString(recentEvents[0].title, "linked event")}, with ${recentEvents.length} linked events in the current projection window.`
    : "No recent event cluster is linked in the projection window.";
  const thirdSentence = relationships.length
    ? `The relationship graph currently centers on ${relationships
        .slice(0, 3)
        .map((item) => asString(item.target_name, "connected entity"))
        .join(", ")}.`
    : "Relationship coverage is still sparse and should be treated as provisional.";

  return {
    entityId: profile.entity_id,
    tenantId,
    narrative: `${firstSentence} with a risk score of ${asNumber(profile.risk_score).toFixed(1)}. ${secondSentence} ${thirdSentence}`.trim(),
    confidence: 0.58,
    generatedBy: "deterministic-fallback",
    expiresAt: null,
    cached: false,
  } satisfies CorpWatchNarrative;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ entityId: string }> },
) {
  const session = await requireApiSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { entityId } = await params;
  const forceRefresh = new URL(request.url).searchParams.get("forceRefresh") === "true";

  if (!forceRefresh) {
    const cached = await queryRow<{
      narrative: string;
      confidence: string | number | null;
      generated_by: string;
      expires_at: Date | string | null;
    }>(
      session.tenantId,
      `
        SELECT narrative, confidence, generated_by, expires_at
        FROM corp_watch.entity_narratives
        WHERE tenant_id = $1
          AND entity_id = $2::uuid
          AND expires_at > now()
      `,
      [session.tenantId, entityId],
    );

    if (cached) {
      return NextResponse.json({
        entityId,
        tenantId: session.tenantId,
        narrative: cached.narrative,
        confidence: asNumber(cached.confidence, 0.65),
        generatedBy: cached.generated_by,
        expiresAt:
          cached.expires_at instanceof Date
            ? cached.expires_at.toISOString()
            : cached.expires_at
              ? String(cached.expires_at)
              : null,
        cached: true,
      } satisfies CorpWatchNarrative);
    }
  }

  try {
    const response = await fetch(new URL("/api/corpwatch/narrative", getIntelligenceServiceUrl()), {
      method: "POST",
      headers: tenantHeaders(session.tenantId),
      body: JSON.stringify({
        entityId,
        forceRefresh,
      }),
    });

    if (response.ok) {
      const payload = (await response.json()) as Record<string, unknown>;
      return NextResponse.json({
        entityId: asString(payload.entityId, entityId),
        tenantId: asString(payload.tenantId, session.tenantId),
        narrative: asString(payload.narrative, ""),
        confidence: asNumber(payload.confidence, 0.65),
        generatedBy: asString(payload.generatedBy, "backend"),
        expiresAt: asOptionalString(payload.expiresAt),
        cached: Boolean(payload.cached),
      } satisfies CorpWatchNarrative);
    }
  } catch {
    // Fall back to a deterministic narrative below.
  }

  const fallback = await buildFallbackNarrative(session.tenantId, entityId);
  if (!fallback) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(fallback);
}
