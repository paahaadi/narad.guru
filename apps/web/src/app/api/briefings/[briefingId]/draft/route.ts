/**
 * POST /api/briefings/[briefingId]/draft
 *
 * Track 4D — AI Intelligence Assistant (Briefings).
 * Generates a drafted set of sections for a briefing grounded in:
 *   - The briefing's existing source investigation IDs → fetches their notes/evidence
 *   - Any existing section titles the analyst has framed
 *
 * GOVERNANCE RULES:
 *   - Output is returned to the analyst for review; NOT published automatically.
 *   - ai_draft_model field is explicitly tracked in the version record.
 *   - Confidence fields are surfaced per-section.
 *   - Degrades gracefully when the intelligence service / LLM is unavailable.
 */
import { NextResponse } from "next/server";
import { requireApiSession } from "@/app/api/briefings/_helpers";
import { queryRow, queryRows } from "@/lib/db";
import { normalizeSectionInput } from "@/app/api/briefings/[briefingId]/draft/_normalizer";

export async function POST(
  request: Request,
  { params }: { params: { briefingId: string } },
) {
  const session = await requireApiSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { briefingId } = params;

  // Verify briefing ownership
  const briefing = await queryRow<{
    id: string;
    title: string;
    audience: string | null;
    status: string;
    current_version: number;
  }>(
    session.tenantId,
    `SELECT id::text, title, audience, status, current_version
     FROM workflow.briefings
     WHERE tenant_id = $1 AND id = $2::uuid`,
    [session.tenantId, briefingId],
  );

  if (!briefing) {
    return NextResponse.json({ error: "Briefing not found" }, { status: 404 });
  }

  // Only allow drafting on non-published briefings
  if (["published", "superseded", "withdrawn"].includes(briefing.status)) {
    return NextResponse.json(
      { error: `Cannot generate draft on a briefing with status '${briefing.status}'` },
      { status: 422 },
    );
  }

  // Fetch current version's sections and source IDs
  const version = await queryRow<{
    sections: unknown;
    source_investigation_ids: string[] | null;
    source_event_ids: string[] | null;
    source_watchlist_ids: string[] | null;
  }>(
    session.tenantId,
    `SELECT sections, source_investigation_ids, source_event_ids, source_watchlist_ids
     FROM workflow.briefing_versions
     WHERE briefing_id = $1::uuid AND version_number = $2`,
    [briefingId, briefing.current_version],
  );

  const sourceInvestigationIds = version?.source_investigation_ids ?? [];
  const existingSections = normalizeSectionInput(version?.sections);

  // Gather grounding context from linked investigations
  const groundingLines: string[] = [
    `Briefing title: ${briefing.title}`,
    briefing.audience ? `Target audience: ${briefing.audience}` : "",
  ].filter(Boolean);

  if (sourceInvestigationIds.length > 0) {
    for (const invId of sourceInvestigationIds.slice(0, 3)) {
      const inv = await queryRow<{ title: string; description: string | null; hypothesis: string | null }>(
        session.tenantId,
        `SELECT title, description, hypothesis FROM workflow.investigations WHERE id = $1::uuid`,
        [invId],
      );
      if (inv) groundingLines.push(`Investigation: ${inv.title}${inv.hypothesis ? ` — ${inv.hypothesis}` : ""}`);

      const notes = await queryRows<{ note_type: string; body: string }>(
        session.tenantId,
        `SELECT note_type, body FROM workflow.investigation_notes
         WHERE investigation_id = $1::uuid ORDER BY created_at DESC LIMIT 5`,
        [invId],
      );
      for (const n of notes) {
        groundingLines.push(`[${n.note_type}] ${n.body.slice(0, 300)}`);
      }
    }
  }

  const contextText = groundingLines.join("\n");
  const hasContext = groundingLines.length > 2;

  // Attempt AI draft
  let draftSections: { title: string; body: string; confidence: number }[];
  let aiModel = "deterministic-fallback";

  try {
    const intelBase = process.env.INTELLIGENCE_INTERNAL_URL ?? "http://intelligence:8000";
    const intelRes = await fetch(`${intelBase}/internal/draft-briefing`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        briefingId,
        title: briefing.title,
        audience: briefing.audience,
        context: contextText,
        sectionHints: existingSections.map((s) => s.title).filter(Boolean),
        tenantId: session.tenantId,
      }),
      signal: AbortSignal.timeout(25_000),
    });

    if (intelRes.ok) {
      const data = await intelRes.json() as {
        sections?: { title: string; body: string; confidence?: number }[];
        model?: string;
      };
      draftSections = (data.sections ?? []).map((s) => ({
        title: s.title,
        body: s.body,
        confidence: s.confidence ?? 0.65,
      }));
      aiModel = data.model ?? "gemini-intelligence";
    } else {
      throw new Error(`Intelligence service returned ${intelRes.status}`);
    }
  } catch {
    // Graceful deterministic fallback
    if (existingSections.length > 0) {
      // Preserve analyst's section structure, populate with context hints
      draftSections = existingSections.map((s) => ({
        title: s.title,
        body: s.body.trim() || (hasContext
          ? `[AI draft unavailable. Context available from ${sourceInvestigationIds.length} linked investigation(s). Please write this section manually.]`
          : "[No linked investigations. Attach source investigation IDs to enable AI-assisted drafting.]"),
        confidence: 0,
      }));
    } else {
      draftSections = [
        {
          title: "Executive Summary",
          body: hasContext
            ? `[AI service unavailable. Context: ${contextText.slice(0, 400)}]`
            : "[No context available. Link investigations to enable drafting.]",
          confidence: 0,
        },
        { title: "Key Findings", body: "", confidence: 0 },
        { title: "Recommended Actions", body: "", confidence: 0 },
      ];
    }
    aiModel = "deterministic-fallback";
  }

  return NextResponse.json({
    briefingId,
    aiModel,
    sections: draftSections,
    groundedOnInvestigations: sourceInvestigationIds.length,
    verificationRequired: true,
    note: "This draft requires analyst review and editing before being saved as a version or submitted for approval.",
  });
}
