import { queryRow, queryRows } from "@/lib/db";

// ── Types ────────────────────────────────────────────────────────────────────

export type Recommendation = {
  id: string;
  recommendationType: string;
  title: string;
  summary: string;
  impactSummary: string | null;
  reasoning: string | null;
  evidenceRefs: Array<{ type: string; label: string }>;
  confidence: number;
  aiModel: string;
  status: string;
  generatedFor: string;
  eventId: string | null;
  entityId: string | null;
  investigationId: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
};

// ── Row types ────────────────────────────────────────────────────────────────

type RecommendationRow = {
  id: string;
  recommendation_type: string;
  title: string;
  summary: string;
  impact_summary: string | null;
  reasoning: string | null;
  evidence_refs: unknown;
  confidence: number | string;
  ai_model: string;
  status: string;
  generated_for: string;
  event_id: string | null;
  entity_id: string | null;
  investigation_id: string | null;
  reviewed_by: string | null;
  reviewed_at: Date | string | null;
  created_at: Date | string;
};

// ── Normalizer ───────────────────────────────────────────────────────────────

function normalizeRecommendation(row: RecommendationRow): Recommendation {
  const refs = Array.isArray(row.evidence_refs) ? row.evidence_refs : [];
  return {
    id: row.id,
    recommendationType: row.recommendation_type,
    title: row.title,
    summary: row.summary,
    impactSummary: row.impact_summary,
    reasoning: row.reasoning,
    evidenceRefs: refs.filter(
      (r): r is { type: string; label: string } =>
        typeof r === "object" && r !== null && "label" in r,
    ),
    confidence: Number(row.confidence),
    aiModel: row.ai_model,
    status: row.status,
    generatedFor: row.generated_for,
    eventId: row.event_id,
    entityId: row.entity_id,
    investigationId: row.investigation_id,
    reviewedBy: row.reviewed_by,
    reviewedAt:
      row.reviewed_at instanceof Date
        ? row.reviewed_at.toISOString()
        : row.reviewed_at,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : row.created_at,
  };
}

// ── Queries ──────────────────────────────────────────────────────────────────

export async function listRecommendations(
  tenantId: string,
  filters: {
    eventId?: string;
    entityId?: string;
    investigationId?: string;
    status?: string;
    limit?: number;
  } = {},
) {
  const conditions: string[] = ["tenant_id = $1"];
  const values: unknown[] = [tenantId];
  let paramIdx = 2;

  if (filters.eventId) {
    conditions.push(`event_id = $${paramIdx}::uuid`);
    values.push(filters.eventId);
    paramIdx++;
  }
  if (filters.entityId) {
    conditions.push(`entity_id = $${paramIdx}::uuid`);
    values.push(filters.entityId);
    paramIdx++;
  }
  if (filters.investigationId) {
    conditions.push(`investigation_id = $${paramIdx}::uuid`);
    values.push(filters.investigationId);
    paramIdx++;
  }
  if (filters.status) {
    conditions.push(`status = $${paramIdx}`);
    values.push(filters.status);
    paramIdx++;
  }

  const limit = Math.min(Math.max(filters.limit || 20, 1), 100);
  conditions.push(`1=1`);

  const rows = await queryRows<RecommendationRow>(
    tenantId,
    `
      SELECT
        id::text, recommendation_type, title, summary, impact_summary,
        reasoning, evidence_refs, confidence, ai_model, status,
        generated_for, event_id::text, entity_id::text, investigation_id::text,
        reviewed_by::text, reviewed_at, created_at
      FROM workflow.decision_recommendations
      WHERE ${conditions.join(" AND ")}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `,
    values,
  );

  return rows.map(normalizeRecommendation);
}

export async function createRecommendation(
  tenantId: string,
  data: {
    recommendationType: string;
    title: string;
    summary: string;
    impactSummary?: string;
    reasoning?: string;
    evidenceRefs?: Array<{ type: string; label: string }>;
    confidence: number;
    aiModel: string;
    generatedFor: string;
    eventId?: string;
    entityId?: string;
    investigationId?: string;
    contextSnapshot?: Record<string, unknown>;
  },
) {
  const row = await queryRow<RecommendationRow>(
    tenantId,
    `
      INSERT INTO workflow.decision_recommendations
        (tenant_id, recommendation_type, title, summary, impact_summary,
         reasoning, evidence_refs, confidence, ai_model, generated_for,
         event_id, entity_id, investigation_id, context_snapshot)
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10,
              $11::uuid, $12::uuid, $13::uuid, $14::jsonb)
      RETURNING
        id::text, recommendation_type, title, summary, impact_summary,
        reasoning, evidence_refs, confidence, ai_model, status,
        generated_for, event_id::text, entity_id::text, investigation_id::text,
        reviewed_by::text, reviewed_at, created_at
    `,
    [
      tenantId,
      data.recommendationType,
      data.title,
      data.summary,
      data.impactSummary || null,
      data.reasoning || null,
      JSON.stringify(data.evidenceRefs || []),
      data.confidence,
      data.aiModel,
      data.generatedFor,
      data.eventId || null,
      data.entityId || null,
      data.investigationId || null,
      JSON.stringify(data.contextSnapshot || {}),
    ],
  );

  return row ? normalizeRecommendation(row) : null;
}

export async function updateRecommendationStatus(
  tenantId: string,
  recommendationId: string,
  status: string,
  reviewedBy: string,
) {
  const validStatuses = ["pending", "accepted", "rejected", "expired"];
  if (!validStatuses.includes(status)) {
    return null;
  }

  const row = await queryRow<RecommendationRow>(
    tenantId,
    `
      UPDATE workflow.decision_recommendations
      SET status = $2, reviewed_by = $3::uuid, reviewed_at = now()
      WHERE id = $1::uuid AND tenant_id = $4
      RETURNING
        id::text, recommendation_type, title, summary, impact_summary,
        reasoning, evidence_refs, confidence, ai_model, status,
        generated_for, event_id::text, entity_id::text, investigation_id::text,
        reviewed_by::text, reviewed_at, created_at
    `,
    [recommendationId, status, reviewedBy, tenantId],
  );

  return row ? normalizeRecommendation(row) : null;
}
