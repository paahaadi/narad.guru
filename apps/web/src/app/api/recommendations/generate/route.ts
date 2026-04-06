import { NextResponse } from "next/server";
import { requireSessionFromRequest } from "@/lib/auth";
import { createRecommendation } from "@/lib/workspaces/recommendations";
import { queryRow, queryRows } from "@/lib/db";

const INTELLIGENCE_BASE =
  process.env.INTELLIGENCE_SERVICE_URL?.trim() || "http://intelligence:8000";
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY?.trim() || "";

export async function POST(request: Request) {
  const session = await requireSessionFromRequest(request);

  const body = (await request.json()) as {
    eventId?: string;
    investigationId?: string;
    entityId?: string;
    context?: string;
  };

  if (!body.eventId && !body.investigationId && !body.entityId) {
    return NextResponse.json(
      { error: "At least one of eventId, investigationId, or entityId is required" },
      { status: 400 },
    );
  }

  // ── Gather grounding context ───────────────────────────────────────────
  const contextParts: string[] = [];
  let targetType = "general";
  let targetId = "";

  if (body.eventId) {
    targetType = "event";
    targetId = body.eventId;

    type EventRow = { title: string; summary: string | null; event_type: string; severity: string };
    const event = await queryRow<EventRow>(
      session.tenantId,
      `SELECT title, summary, event_type, severity FROM core.events WHERE id = $1::uuid AND tenant_id = $2`,
      [body.eventId, session.tenantId],
    );
    if (event) {
      contextParts.push(`Event: ${event.title}\nType: ${event.event_type}\nSeverity: ${event.severity}\n${event.summary || ""}`);
    }

    // Linked entities
    type LinkedEntity = { canonical_name: string; entity_type: string };
    const entities = await queryRows<LinkedEntity>(
      session.tenantId,
      `SELECT e.canonical_name, e.entity_type
       FROM core.event_entity_links AS l
       JOIN core.entities AS e ON e.id = l.entity_id
       WHERE l.event_id = $1::uuid AND l.tenant_id = $2
       LIMIT 10`,
      [body.eventId, session.tenantId],
    );
    if (entities.length > 0) {
      contextParts.push("Linked entities: " + entities.map((e) => `${e.canonical_name} (${e.entity_type})`).join(", "));
    }
  }

  if (body.investigationId) {
    targetType = "investigation";
    targetId = body.investigationId;

    type InvRow = { title: string; description: string | null; hypothesis: string | null };
    const inv = await queryRow<InvRow>(
      session.tenantId,
      `SELECT title, description, hypothesis FROM workflow.investigations WHERE id = $1::uuid AND tenant_id = $2`,
      [body.investigationId, session.tenantId],
    );
    if (inv) {
      contextParts.push(`Investigation: ${inv.title}\n${inv.description || ""}\nHypothesis: ${inv.hypothesis || "none"}`);
    }

    type NoteRow = { body: string };
    const notes = await queryRows<NoteRow>(
      session.tenantId,
      `SELECT body FROM workflow.investigation_notes WHERE investigation_id = $1::uuid ORDER BY created_at DESC LIMIT 5`,
      [body.investigationId],
    );
    if (notes.length > 0) {
      contextParts.push("Investigation notes:\n" + notes.map((n) => `- ${n.body.slice(0, 300)}`).join("\n"));
    }
  }

  if (body.entityId) {
    targetType = body.eventId ? "event" : "entity";
    targetId = targetId || body.entityId;

    type EntRow = { canonical_name: string; entity_type: string; description: string | null; risk_score: number | null };
    const ent = await queryRow<EntRow>(
      session.tenantId,
      `SELECT canonical_name, entity_type, description, risk_score FROM core.entities WHERE id = $1::uuid AND tenant_id = $2`,
      [body.entityId, session.tenantId],
    );
    if (ent) {
      contextParts.push(`Entity: ${ent.canonical_name} (${ent.entity_type})\nRisk: ${ent.risk_score ?? "unknown"}\n${ent.description || ""}`);
    }
  }

  if (body.context) {
    contextParts.push(body.context.slice(0, 3000));
  }

  const fullContext = contextParts.join("\n\n---\n\n").slice(0, 10000);

  // ── Call intelligence service ──────────────────────────────────────────
  let aiRecommendations: Array<{
    recommendationType: string;
    title: string;
    summary: string;
    impactSummary?: string;
    reasoning: string;
    evidenceRefs: Array<{ type: string; label: string }>;
    confidence: number;
  }> = [];
  let aiModel = "deterministic-fallback";

  try {
    const res = await fetch(`${INTELLIGENCE_BASE}/internal/recommend`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Key": INTERNAL_API_KEY,
      },
      body: JSON.stringify({
        targetType,
        targetId,
        context: fullContext,
        tenantId: session.tenantId,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (res.ok) {
      const data = await res.json();
      aiRecommendations = data.recommendations || [];
      aiModel = data.model || "unknown";
    }
  } catch {
    // fallback below
  }

  // ── Fallback if AI fails ───────────────────────────────────────────────
  if (aiRecommendations.length === 0) {
    aiRecommendations = [
      {
        recommendationType: "monitoring",
        title: "Continue monitoring",
        summary: "AI recommendations are unavailable. Continue monitoring this item and review manually.",
        reasoning: "Automated analysis could not be completed.",
        evidenceRefs: [],
        confidence: 0.0,
      },
    ];
  }

  // ── Store all recommendations ──────────────────────────────────────────
  const stored = [];
  for (const rec of aiRecommendations) {
    const result = await createRecommendation(session.tenantId, {
      recommendationType: rec.recommendationType,
      title: rec.title,
      summary: rec.summary,
      impactSummary: rec.impactSummary,
      reasoning: rec.reasoning,
      evidenceRefs: rec.evidenceRefs,
      confidence: rec.confidence,
      aiModel,
      generatedFor: targetType,
      eventId: body.eventId,
      entityId: body.entityId,
      investigationId: body.investigationId,
      contextSnapshot: { contextLength: fullContext.length },
    });
    if (result) stored.push(result);
  }

  return NextResponse.json({
    recommendations: stored,
    verificationRequired: true,
    model: aiModel,
  }, { status: 201 });
}
