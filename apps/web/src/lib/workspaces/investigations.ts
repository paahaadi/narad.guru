import { asNumber, asOptionalString, safeQueryRow, safeQueryRows, truncate } from "@/lib/workspaces/shared";

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

/* ── API types (used by route handlers and client SDK) ── */

export type InvestigationSummary = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  classification: string;
  confidence: number | null;
  hypothesis: string | null;
  ownerName: string;
  ownerId: string;
  itemCount: number;
  evidenceCount: number;
  noteCount: number;
  createdAt: string;
  updatedAt: string;
};

export type InvestigationItem = {
  id: string;
  itemType: string;
  itemId: string;
  role: string;
  addedBy: string;
  addedByName: string;
  notes: string | null;
  createdAt: string;
};

export type EvidenceRecord = {
  id: string;
  documentId: string;
  documentTitle: string;
  evidenceHash: string;
  s3KeyWorm: string;
  isVerified: boolean;
  verifiedBy: string | null;
  verifiedByName: string | null;
  verifiedAt: string | null;
  createdAt: string;
};

export type CustodyEntry = {
  id: string;
  evidenceId: string;
  userId: string;
  userName: string;
  action: string;
  evidenceHashAtAction: string;
  ipAddress: string | null;
  createdAt: string;
};

export type InvestigationNote = {
  id: string;
  noteType: string;
  body: string;
  authorId: string;
  authorName: string;
  isAiGenerated: boolean;
  verificationStatus: string;
  createdAt: string;
  updatedAt: string;
};

export type InvestigationMetrics = {
  byStatus: Record<string, number>;
  byClassification: Record<string, number>;
  totalEvidence: number;
  recentActivity: { action: string; subject: string; timestamp: string }[];
};

/* ── CRUD query functions (used by API routes) ── */

export async function listInvestigations(
  tenantId: string,
  options?: { status?: string; limit?: number; offset?: number },
): Promise<{ items: InvestigationSummary[]; total: number }> {
  const limit = options?.limit ?? 20;
  const offset = options?.offset ?? 0;

  const conditions = ["i.tenant_id = $1"];
  const values: unknown[] = [tenantId];
  let paramIdx = 2;

  if (options?.status) {
    conditions.push(`i.status = $${paramIdx}`);
    values.push(options.status);
    paramIdx++;
  }

  const where = conditions.join(" AND ");

  const countRow = await safeQueryRow<{ count: string }>(
    tenantId,
    `SELECT COUNT(*)::text AS count FROM workflow.investigations AS i WHERE ${where}`,
    values,
  );

  const rows = await safeQueryRows<{
    id: string;
    title: string;
    description: string | null;
    status: string;
    classification: string;
    confidence: string | number | null;
    hypothesis: string | null;
    owner_name: string | null;
    owner_id: string;
    item_count: string | number;
    evidence_count: string | number;
    note_count: string | number;
    created_at: Date;
    updated_at: Date;
  }>(
    tenantId,
    `
      SELECT
        i.id::text,
        i.title,
        i.description,
        i.status,
        i.classification,
        i.confidence,
        i.hypothesis,
        u.display_name AS owner_name,
        i.owner_id::text,
        COUNT(DISTINCT ii.id) AS item_count,
        COUNT(DISTINCT ie.id) AS evidence_count,
        COUNT(DISTINCT n.id) AS note_count,
        i.created_at,
        i.updated_at
      FROM workflow.investigations AS i
      LEFT JOIN core.users AS u ON u.id = i.owner_id
      LEFT JOIN workflow.investigation_items AS ii ON ii.investigation_id = i.id
      LEFT JOIN workflow.investigation_evidence AS ie ON ie.investigation_id = i.id
      LEFT JOIN workflow.investigation_notes AS n ON n.investigation_id = i.id
      WHERE ${where}
      GROUP BY i.id, u.display_name
      ORDER BY i.updated_at DESC
      LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `,
    [...values, limit, offset],
  );

  return {
    items: rows.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      status: r.status,
      classification: r.classification,
      confidence: r.confidence !== null ? Number(r.confidence) : null,
      hypothesis: r.hypothesis,
      ownerName: r.owner_name ?? "Unknown",
      ownerId: r.owner_id,
      itemCount: Number(r.item_count),
      evidenceCount: Number(r.evidence_count),
      noteCount: Number(r.note_count),
      createdAt: r.created_at.toISOString(),
      updatedAt: r.updated_at.toISOString(),
    })),
    total: Number(countRow?.count ?? 0),
  };
}

export async function getInvestigation(
  tenantId: string,
  investigationId: string,
): Promise<InvestigationSummary | null> {
  const rows = await safeQueryRows<{
    id: string;
    title: string;
    description: string | null;
    status: string;
    classification: string;
    confidence: string | number | null;
    hypothesis: string | null;
    owner_name: string | null;
    owner_id: string;
    item_count: string | number;
    evidence_count: string | number;
    note_count: string | number;
    created_at: Date;
    updated_at: Date;
  }>(
    tenantId,
    `
      SELECT
        i.id::text,
        i.title,
        i.description,
        i.status,
        i.classification,
        i.confidence,
        i.hypothesis,
        u.display_name AS owner_name,
        i.owner_id::text,
        COUNT(DISTINCT ii.id) AS item_count,
        COUNT(DISTINCT ie.id) AS evidence_count,
        COUNT(DISTINCT n.id) AS note_count,
        i.created_at,
        i.updated_at
      FROM workflow.investigations AS i
      LEFT JOIN core.users AS u ON u.id = i.owner_id
      LEFT JOIN workflow.investigation_items AS ii ON ii.investigation_id = i.id
      LEFT JOIN workflow.investigation_evidence AS ie ON ie.investigation_id = i.id
      LEFT JOIN workflow.investigation_notes AS n ON n.investigation_id = i.id
      WHERE i.tenant_id = $1 AND i.id = $2::uuid
      GROUP BY i.id, u.display_name
    `,
    [tenantId, investigationId],
  );

  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    status: r.status,
    classification: r.classification,
    confidence: r.confidence !== null ? Number(r.confidence) : null,
    hypothesis: r.hypothesis,
    ownerName: r.owner_name ?? "Unknown",
    ownerId: r.owner_id,
    itemCount: Number(r.item_count),
    evidenceCount: Number(r.evidence_count),
    noteCount: Number(r.note_count),
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

export async function listInvestigationItems(
  tenantId: string,
  investigationId: string,
  options?: { itemType?: string; role?: string },
): Promise<InvestigationItem[]> {
  const conditions = ["ii.investigation_id = $1::uuid"];
  const values: unknown[] = [investigationId];
  let paramIdx = 2;

  if (options?.itemType) {
    conditions.push(`ii.item_type = $${paramIdx}`);
    values.push(options.itemType);
    paramIdx++;
  }
  if (options?.role) {
    conditions.push(`ii.role = $${paramIdx}`);
    values.push(options.role);
    paramIdx++;
  }

  const rows = await safeQueryRows<{
    id: string;
    item_type: string;
    item_id: string;
    role: string;
    added_by: string;
    added_by_name: string | null;
    notes: string | null;
    created_at: Date;
  }>(
    tenantId,
    `
      SELECT
        ii.id::text,
        ii.item_type,
        ii.item_id::text,
        ii.role,
        ii.added_by::text,
        u.display_name AS added_by_name,
        ii.notes,
        ii.created_at
      FROM workflow.investigation_items AS ii
      LEFT JOIN core.users AS u ON u.id = ii.added_by
      WHERE ${conditions.join(" AND ")}
      ORDER BY ii.created_at DESC
    `,
    values,
  );

  return rows.map((r) => ({
    id: r.id,
    itemType: r.item_type,
    itemId: r.item_id,
    role: r.role,
    addedBy: r.added_by,
    addedByName: r.added_by_name ?? "Unknown",
    notes: r.notes,
    createdAt: r.created_at.toISOString(),
  }));
}

export async function listInvestigationEvidence(
  tenantId: string,
  investigationId: string,
): Promise<EvidenceRecord[]> {
  const rows = await safeQueryRows<{
    id: string;
    document_id: string;
    document_title: string | null;
    evidence_hash: string;
    s3_key_worm: string;
    is_verified: boolean;
    verified_by: string | null;
    verified_by_name: string | null;
    verified_at: Date | null;
    created_at: Date;
  }>(
    tenantId,
    `
      SELECT
        ie.id::text,
        ie.document_id::text,
        COALESCE(d.title, d.external_id, d.doc_type, 'Evidence document') AS document_title,
        ie.evidence_hash,
        ie.s3_key_worm,
        ie.is_verified,
        ie.verified_by::text,
        uv.display_name AS verified_by_name,
        ie.verified_at,
        ie.created_at
      FROM workflow.investigation_evidence AS ie
      LEFT JOIN core.documents AS d ON d.id = ie.document_id
      LEFT JOIN core.users AS uv ON uv.id = ie.verified_by
      WHERE ie.investigation_id = $1::uuid
      ORDER BY ie.created_at DESC
    `,
    [investigationId],
  );

  return rows.map((r) => ({
    id: r.id,
    documentId: r.document_id,
    documentTitle: r.document_title ?? "Evidence document",
    evidenceHash: r.evidence_hash,
    s3KeyWorm: r.s3_key_worm,
    isVerified: r.is_verified,
    verifiedBy: r.verified_by,
    verifiedByName: r.verified_by_name,
    verifiedAt: r.verified_at?.toISOString() ?? null,
    createdAt: r.created_at.toISOString(),
  }));
}

export async function listInvestigationNotes(
  tenantId: string,
  investigationId: string,
  options?: { noteType?: string },
): Promise<InvestigationNote[]> {
  const conditions = ["n.investigation_id = $1::uuid"];
  const values: unknown[] = [investigationId];

  if (options?.noteType) {
    conditions.push("n.note_type = $2");
    values.push(options.noteType);
  }

  const rows = await safeQueryRows<{
    id: string;
    note_type: string;
    body: string;
    author_id: string;
    author_name: string | null;
    is_ai_generated: boolean;
    verification_status: string;
    created_at: Date;
    updated_at: Date;
  }>(
    tenantId,
    `
      SELECT
        n.id::text,
        n.note_type,
        n.body,
        n.author_id::text,
        u.display_name AS author_name,
        n.is_ai_generated,
        n.verification_status,
        n.created_at,
        n.updated_at
      FROM workflow.investigation_notes AS n
      LEFT JOIN core.users AS u ON u.id = n.author_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY n.created_at DESC
    `,
    values,
  );

  return rows.map((r) => ({
    id: r.id,
    noteType: r.note_type,
    body: r.body,
    authorId: r.author_id,
    authorName: r.author_name ?? "Unknown",
    isAiGenerated: r.is_ai_generated,
    verificationStatus: r.verification_status,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  }));
}

export async function getCustodyLog(
  tenantId: string,
  investigationId: string,
): Promise<CustodyEntry[]> {
  const rows = await safeQueryRows<{
    id: string;
    evidence_id: string;
    user_id: string;
    user_name: string | null;
    action: string;
    evidence_hash_at_action: string;
    ip_address: string | null;
    created_at: Date;
  }>(
    tenantId,
    `
      SELECT
        cl.id::text,
        cl.evidence_id::text,
        cl.user_id::text,
        u.display_name AS user_name,
        cl.action,
        cl.evidence_hash_at_action,
        cl.ip_address::text,
        cl.created_at
      FROM workflow.evidence_custody_log AS cl
      JOIN workflow.investigation_evidence AS ie ON ie.id = cl.evidence_id
      LEFT JOIN core.users AS u ON u.id = cl.user_id
      WHERE ie.investigation_id = $1::uuid
      ORDER BY cl.created_at ASC
    `,
    [investigationId],
  );

  return rows.map((r) => ({
    id: r.id,
    evidenceId: r.evidence_id,
    userId: r.user_id,
    userName: r.user_name ?? "Unknown",
    action: r.action,
    evidenceHashAtAction: r.evidence_hash_at_action,
    ipAddress: r.ip_address,
    createdAt: r.created_at.toISOString(),
  }));
}

export async function getInvestigationMetrics(
  tenantId: string,
): Promise<InvestigationMetrics> {
  const statusRows = await safeQueryRows<{ status: string; count: string }>(
    tenantId,
    `
      SELECT status, COUNT(*)::text AS count
      FROM workflow.investigations
      WHERE tenant_id = $1
      GROUP BY status
    `,
    [tenantId],
  );

  const classRows = await safeQueryRows<{ classification: string; count: string }>(
    tenantId,
    `
      SELECT classification, COUNT(*)::text AS count
      FROM workflow.investigations
      WHERE tenant_id = $1
      GROUP BY classification
    `,
    [tenantId],
  );

  const evidenceRow = await safeQueryRow<{ count: string }>(
    tenantId,
    `
      SELECT COUNT(*)::text AS count
      FROM workflow.investigation_evidence AS ie
      JOIN workflow.investigations AS i ON i.id = ie.investigation_id
      WHERE i.tenant_id = $1
    `,
    [tenantId],
  );

  const activityRows = await safeQueryRows<{
    action: string;
    subject: string;
    created_at: Date;
  }>(
    tenantId,
    `
      (
        SELECT 'note_added' AS action, LEFT(n.body, 80) AS subject, n.created_at
        FROM workflow.investigation_notes AS n
        JOIN workflow.investigations AS i ON i.id = n.investigation_id
        WHERE i.tenant_id = $1
        ORDER BY n.created_at DESC LIMIT 5
      )
      UNION ALL
      (
        SELECT 'evidence_attached' AS action, COALESCE(d.title, 'document') AS subject, ie.created_at
        FROM workflow.investigation_evidence AS ie
        JOIN workflow.investigations AS i ON i.id = ie.investigation_id
        LEFT JOIN core.documents AS d ON d.id = ie.document_id
        WHERE i.tenant_id = $1
        ORDER BY ie.created_at DESC LIMIT 5
      )
      ORDER BY created_at DESC LIMIT 10
    `,
    [tenantId],
  );

  const byStatus: Record<string, number> = {};
  for (const r of statusRows) byStatus[r.status] = Number(r.count);

  const byClassification: Record<string, number> = {};
  for (const r of classRows) byClassification[r.classification] = Number(r.count);

  return {
    byStatus,
    byClassification,
    totalEvidence: Number(evidenceRow?.count ?? 0),
    recentActivity: activityRows.map((r) => ({
      action: r.action,
      subject: r.subject,
      timestamp: r.created_at.toISOString(),
    })),
  };
}
