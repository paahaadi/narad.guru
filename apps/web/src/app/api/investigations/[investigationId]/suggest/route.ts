/**
 * POST /api/investigations/[investigationId]/suggest
 *
 * Track 4D — AI Intelligence Assistant.
 * Generates entity and event suggestions for an active investigation,
 * grounded in the case's existing notes, items, and evidence.
 *
 * GOVERNANCE RULES (4D):
 *   - AI output is returned as suggestions only; it does NOT publish anything.
 *   - All suggestions carry a confidence score and must be analyst-verified.
 *   - The route includes mandatory citation/reasoning fields.
 *   - Degrades gracefully when the LLM key is absent.
 */
import { NextResponse } from "next/server";
import { requireApiSession } from "@/app/api/investigations/_helpers";
import { queryRow, queryRows } from "@/lib/db";

type Suggestion = {
  entities: { label: string; type: string; confidence: number }[];
  events: { label: string; eventType: string; confidence: number }[];
  reasoning: string;
  groundedOn: "notes" | "items-and-evidence" | "fallback";
  verificationRequired: true;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ investigationId: string }> },
) {
  const session = await requireApiSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { investigationId } = await params;

  // Verify investigation belongs to this tenant
  const inv = await queryRow<{ id: string; title: string; description: string | null; hypothesis: string | null }>(
    session.tenantId,
    `SELECT id::text, title, description, hypothesis
     FROM workflow.investigations
     WHERE tenant_id = $1 AND id = $2::uuid`,
    [session.tenantId, investigationId],
  );

  if (!inv) {
    return NextResponse.json({ error: "Investigation not found" }, { status: 404 });
  }

  // Gather grounding context from existing notes and items
  const notes = await queryRows<{ body: string; note_type: string }>(
    session.tenantId,
    `SELECT body, note_type FROM workflow.investigation_notes
     WHERE investigation_id = $1::uuid ORDER BY created_at DESC LIMIT 10`,
    [investigationId],
  );

  const items = await queryRows<{ item_type: string; item_id: string; role: string; notes: string | null }>(
    session.tenantId,
    `SELECT item_type, item_id::text, role, notes
     FROM workflow.investigation_items
     WHERE investigation_id = $1::uuid ORDER BY created_at DESC LIMIT 10`,
    [investigationId],
  );

  // Build grounding text
  const contextLines: string[] = [
    `Investigation: ${inv.title}`,
    inv.description ? `Description: ${inv.description}` : "",
    inv.hypothesis ? `Hypothesis: ${inv.hypothesis}` : "",
    notes.length > 0 ? `Notes:\n${notes.map((n) => `- [${n.note_type}] ${n.body.slice(0, 200)}`).join("\n")}` : "",
    items.length > 0
      ? `Linked items:\n${items.map((i) => `- ${i.item_type} (${i.role})${i.notes ? `: ${i.notes.slice(0, 100)}` : ""}`).join("\n")}`
      : "",
  ].filter(Boolean);

  const contextText = contextLines.join("\n");
  const hasContext = notes.length > 0 || items.length > 0;

  // Attempt LLM-assisted suggestion via intelligence service
  // Falls back to deterministic extraction if unavailable
  let suggestion: Suggestion;

  try {
    const intelBase = process.env.INTELLIGENCE_INTERNAL_URL ?? "http://intelligence:8000";
    const intelRes = await fetch(`${intelBase}/internal/suggest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        investigationId,
        context: contextText,
        tenantId: session.tenantId,
      }),
      signal: AbortSignal.timeout(12_000),
    });

    if (intelRes.ok) {
      const data = await intelRes.json() as {
        entities?: { label: string; type: string; confidence: number }[];
        events?: { label: string; eventType: string; confidence: number }[];
        reasoning?: string;
      };
      suggestion = {
        entities: data.entities ?? [],
        events: data.events ?? [],
        reasoning: data.reasoning ?? "AI-assisted analysis complete.",
        groundedOn: hasContext ? "notes" : "fallback",
        verificationRequired: true,
      };
    } else {
      throw new Error(`Intelligence service returned ${intelRes.status}`);
    }
  } catch {
    // Graceful fallback — deterministic keyword extraction from notes
    const entityPatterns = [
      { pattern: /([A-Z][a-z]+ [A-Z][a-z]+)/g, type: "person" },
      { pattern: /\b([A-Z]{2,})\b/g, type: "organization" },
      { pattern: /\b(India|Pakistan|China|Bangladesh|Nepal|Sri Lanka|Myanmar)\b/gi, type: "location" },
    ];

    const noteText = notes.map((n) => n.body).join(" ");
    const foundEntities: { label: string; type: string; confidence: number }[] = [];
    const seen = new Set<string>();

    for (const { pattern, type } of entityPatterns) {
      const matches = noteText.matchAll(pattern);
      for (const m of matches) {
        const label = m[1];
        if (label && !seen.has(label.toLowerCase()) && label.length > 2) {
          seen.add(label.toLowerCase());
          foundEntities.push({ label, type, confidence: 0.55 });
          if (foundEntities.length >= 5) break;
        }
      }
      if (foundEntities.length >= 5) break;
    }

    suggestion = {
      entities: foundEntities,
      events: [],
      reasoning: hasContext
        ? "AI service is unavailable. The following suggestions were extracted deterministically from case notes — confidence is low and analyst review is required."
        : "No context available for analysis. Add notes, hypothesis, or linked items to improve suggestions.",
      groundedOn: hasContext ? "notes" : "fallback",
      verificationRequired: true,
    };
  }

  return NextResponse.json(suggestion);
}
