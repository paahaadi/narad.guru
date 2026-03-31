import { asNumber, asOptionalString, safeQueryRows, truncate } from "@/lib/workspaces/shared";

export type InvestigationCase = {
  investigationId: string;
  title: string;
  description: string;
  status: string;
  classification: string;
  confidence: number | null;
  ownerName: string;
  itemCount: number;
  evidenceCount: number;
  noteCount: number;
  updatedAt: string | null;
};

export type InvestigationsWorkspaceData = {
  isFallback: boolean;
  cases: InvestigationCase[];
  featured: InvestigationCase;
  evidenceChain: string[];
  timeline: string[];
};

type InvestigationRow = {
  investigation_id: string;
  title: string;
  description: string | null;
  status: string;
  classification: string;
  confidence: string | number | null;
  owner_name: string | null;
  item_count: string | number;
  evidence_count: string | number;
  note_count: string | number;
  updated_at: Date;
};

type InvestigationEvidenceRow = {
  label: string;
};

type InvestigationTimelineRow = {
  note_type: string;
  body: string;
  created_at: Date;
};

function buildFallbackCase(): InvestigationCase {
  return {
    investigationId: "staged-investigation",
    title: "Investigation workspace is live",
    description:
      "The case engine is connected to workflow tables. This fallback state persists until the first tenant investigation, evidence record, or note is created.",
    status: "draft",
    classification: "unclassified",
    confidence: null,
    ownerName: "Awaiting assigned analyst",
    itemCount: 0,
    evidenceCount: 0,
    noteCount: 0,
    updatedAt: null,
  };
}

function fromRow(row: InvestigationRow): InvestigationCase {
  return {
    investigationId: row.investigation_id,
    title: row.title,
    description:
      row.description ??
      "Investigation shell is present. Add evidence, notes, and hypothesis statements to deepen this case.",
    status: row.status,
    classification: row.classification,
    confidence:
      row.confidence === null || row.confidence === undefined ? null : asNumber(row.confidence),
    ownerName: row.owner_name ?? "Unassigned analyst",
    itemCount: asNumber(row.item_count),
    evidenceCount: asNumber(row.evidence_count),
    noteCount: asNumber(row.note_count),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function getInvestigationsWorkspaceData(
  tenantId: string,
): Promise<InvestigationsWorkspaceData> {
  const rows = await safeQueryRows<InvestigationRow>(
    tenantId,
    `
      SELECT
        i.id::text AS investigation_id,
        i.title,
        i.description,
        i.status,
        i.classification,
        i.confidence,
        u.display_name AS owner_name,
        COUNT(DISTINCT ii.id) AS item_count,
        COUNT(DISTINCT ie.id) AS evidence_count,
        COUNT(DISTINCT n.id) AS note_count,
        i.updated_at
      FROM workflow.investigations AS i
      LEFT JOIN core.users AS u ON u.id = i.owner_id
      LEFT JOIN workflow.investigation_items AS ii ON ii.investigation_id = i.id
      LEFT JOIN workflow.investigation_evidence AS ie ON ie.investigation_id = i.id
      LEFT JOIN workflow.investigation_notes AS n ON n.investigation_id = i.id
      WHERE i.tenant_id = $1
      GROUP BY i.id, u.display_name
      ORDER BY
        CASE i.status
          WHEN 'active' THEN 0
          WHEN 'under_review' THEN 1
          WHEN 'on_hold' THEN 2
          ELSE 3
        END,
        i.updated_at DESC
      LIMIT 6
    `,
    [tenantId],
  );

  const cases = rows.length > 0 ? rows.map(fromRow) : [buildFallbackCase()];
  const featured = cases[0] ?? buildFallbackCase();

  const evidenceRows =
    rows.length > 0
      ? await safeQueryRows<InvestigationEvidenceRow>(
          tenantId,
          `
            SELECT COALESCE(d.title, d.external_id, d.doc_type, 'Evidence document') AS label
            FROM workflow.investigation_evidence AS ie
            JOIN core.documents AS d ON d.id = ie.document_id
            WHERE ie.investigation_id = $1::uuid
            ORDER BY ie.created_at DESC
            LIMIT 4
          `,
          [featured.investigationId],
        )
      : [];

  const timelineRows =
    rows.length > 0
      ? await safeQueryRows<InvestigationTimelineRow>(
          tenantId,
          `
            SELECT note_type, body, created_at
            FROM workflow.investigation_notes
            WHERE investigation_id = $1::uuid
            ORDER BY created_at DESC
            LIMIT 4
          `,
          [featured.investigationId],
        )
      : [];

  return {
    isFallback: rows.length === 0,
    cases,
    featured,
    evidenceChain:
      evidenceRows.length > 0
        ? evidenceRows.map((row) => row.label)
        : [
            "No evidence documents have been attached yet.",
            "Investigation notes and items are wired and will appear here when created.",
          ],
    timeline:
      timelineRows.length > 0
        ? timelineRows.map((row) => `${row.note_type}: ${truncate(row.body, 120)}`)
        : [
            `Case status: ${featured.status}`,
            `Owner: ${featured.ownerName}`,
            "Timeline activates after the first investigation note is written.",
          ],
  };
}
