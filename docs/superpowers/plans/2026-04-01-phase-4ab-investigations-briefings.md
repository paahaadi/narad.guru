# Phase 4A+4B: Investigations & Briefings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build fully interactive Investigations and Briefings workspaces — completing all 7 NARAD V2 workspaces with CRUD APIs, client stores, and status workflows.

**Architecture:** Follows the Watchlists workspace pattern: Next.js API route handlers with JWT session auth, Zustand stores for client state, typed SDK clients, and three-column interactive layouts. No new database migrations — all 7 tables exist from `005_workflow_schema.sql`.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Zustand 5, PostgreSQL (pg library), JWT auth (jose)

**Design Spec:** `docs/superpowers/specs/2026-04-01-phase-4ab-investigations-briefings-design.md`

---

## File Structure

### New Files (Phase 4A — Investigations)

| File | Responsibility |
|------|----------------|
| `apps/web/src/app/api/investigations/_helpers.ts` | Auth helper (imports from `@/lib/auth`) |
| `apps/web/src/app/api/investigations/route.ts` | GET list, POST create |
| `apps/web/src/app/api/investigations/metrics/route.ts` | GET workspace metrics |
| `apps/web/src/app/api/investigations/[investigationId]/route.ts` | GET detail, PATCH update/transition |
| `apps/web/src/app/api/investigations/[investigationId]/items/route.ts` | GET list, POST attach |
| `apps/web/src/app/api/investigations/[investigationId]/evidence/route.ts` | GET list, POST attach |
| `apps/web/src/app/api/investigations/[investigationId]/evidence/[evidenceId]/route.ts` | PATCH verify/challenge |
| `apps/web/src/app/api/investigations/[investigationId]/notes/route.ts` | GET list, POST create |
| `apps/web/src/app/api/investigations/[investigationId]/custody/route.ts` | GET custody log |
| `apps/web/src/lib/workspaces/investigations-client.ts` | Typed fetch SDK |
| `apps/web/src/stores/investigations-store.ts` | Zustand store |
| `apps/web/src/features/investigations/investigations-workspace.tsx` | Interactive workspace orchestrator |
| `apps/web/src/features/investigations/case-directory-panel.tsx` | Left panel — case list + create |
| `apps/web/src/features/investigations/case-detail.tsx` | Center panel — tabbed detail view |
| `apps/web/src/features/investigations/case-integrity-rail.tsx` | Right panel — metadata summary |

### New Files (Phase 4B — Briefings)

| File | Responsibility |
|------|----------------|
| `apps/web/src/app/api/briefings/_helpers.ts` | Auth helper (imports from `@/lib/auth`) |
| `apps/web/src/app/api/briefings/route.ts` | GET list, POST create |
| `apps/web/src/app/api/briefings/metrics/route.ts` | GET workspace metrics |
| `apps/web/src/app/api/briefings/[briefingId]/route.ts` | GET detail, PATCH update/transition |
| `apps/web/src/app/api/briefings/[briefingId]/versions/route.ts` | GET list, POST create version |
| `apps/web/src/app/api/briefings/[briefingId]/approve/route.ts` | POST approve |
| `apps/web/src/app/api/briefings/[briefingId]/publish/route.ts` | POST publish |
| `apps/web/src/app/api/briefings/[briefingId]/supersede/route.ts` | POST supersede |
| `apps/web/src/lib/workspaces/briefings-client.ts` | Typed fetch SDK |
| `apps/web/src/stores/briefings-store.ts` | Zustand store |
| `apps/web/src/features/briefings/briefings-workspace.tsx` | Interactive workspace orchestrator |
| `apps/web/src/features/briefings/library-panel.tsx` | Left panel — briefing list + create |
| `apps/web/src/features/briefings/editorial-surface.tsx` | Center panel — section editor + versions + lineage |
| `apps/web/src/features/briefings/briefing-ai-rail.tsx` | Right panel — editorial signals |

### Modified Files

| File | Change |
|------|--------|
| `apps/web/src/lib/workspaces/investigations.ts` | Add exported types for API responses, add `listInvestigations`, `getInvestigation`, `listInvestigationItems`, `listInvestigationEvidence`, `listInvestigationNotes`, `getCustodyLog`, `getInvestigationMetrics` query functions |
| `apps/web/src/lib/workspaces/briefings.ts` | Add exported types for API responses, add `listBriefings`, `getBriefing`, `listBriefingVersions`, `getBriefingMetrics` query functions |
| `apps/web/src/app/(authenticated)/investigations/page.tsx` | Import and render `InvestigationsInteractiveWorkspace` instead of `InvestigationsWorkspace` |
| `apps/web/src/app/(authenticated)/briefings/page.tsx` | Import and render `BriefingsInteractiveWorkspace` instead of `BriefingsWorkspace` |
| `apps/web/src/features/workspaces/live-workspaces.tsx` | Keep old components for fallback; add re-exports of interactive workspaces |

---

## Task 1: Shared Auth Helper for Investigations

**Files:**
- Create: `apps/web/src/app/api/investigations/_helpers.ts`

- [ ] **Step 1: Create the auth helper**

```typescript
// apps/web/src/app/api/investigations/_helpers.ts
import { requireSessionFromRequest } from "@/lib/auth";

export async function requireApiSession(request: Request) {
  try {
    return await requireSessionFromRequest(request);
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/api/investigations/_helpers.ts
git commit -m "feat(investigations): add API auth helper"
```

---

## Task 2: Investigation Data Layer — Types and Query Functions

**Files:**
- Modify: `apps/web/src/lib/workspaces/investigations.ts`

This task adds the types and query functions that API routes will use. The existing file already has `InvestigationCase` and `InvestigationsWorkspaceData` types — we add the API-specific types and CRUD query functions alongside them.

- [ ] **Step 1: Add API response types after existing types**

Add these types after the existing `InvestigationsWorkspaceData` type in `apps/web/src/lib/workspaces/investigations.ts`:

```typescript
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
```

- [ ] **Step 2: Add list investigations query function**

Add after the existing `getInvestigationsWorkspaceData` function:

```typescript
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
```

- [ ] **Step 3: Add get single investigation query**

```typescript
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
```

- [ ] **Step 4: Add items, evidence, notes, custody, and metrics query functions**

```typescript
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
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `cd apps/web && npx tsc --noEmit --pretty 2>&1 | head -30`

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/workspaces/investigations.ts
git commit -m "feat(investigations): add API types and CRUD query functions"
```

---

## Task 3: Investigations List & Create API Routes

**Files:**
- Create: `apps/web/src/app/api/investigations/route.ts`

- [ ] **Step 1: Create the list/create route**

```typescript
// apps/web/src/app/api/investigations/route.ts
import { NextResponse } from "next/server";
import { queryRow } from "@/lib/db";
import { listInvestigations } from "@/lib/workspaces/investigations";
import { requireApiSession } from "./_helpers";

export async function GET(request: Request) {
  const session = await requireApiSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? undefined;
  const limit = Number(url.searchParams.get("limit") ?? 20);
  const offset = Number(url.searchParams.get("offset") ?? 0);

  const result = await listInvestigations(session.tenantId, { status, limit, offset });
  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const session = await requireApiSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as {
    title?: string;
    description?: string;
    classification?: string;
    hypothesis?: string;
  };

  const title = body.title?.trim();
  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });

  const classification = body.classification?.trim() || "unclassified";
  const validClassifications = ["unclassified", "restricted", "confidential", "secret"];
  if (!validClassifications.includes(classification)) {
    return NextResponse.json({ error: `classification must be one of: ${validClassifications.join(", ")}` }, { status: 400 });
  }

  const row = await queryRow<{ id: string; created_at: Date; updated_at: Date }>(
    session.tenantId,
    `
      INSERT INTO workflow.investigations (tenant_id, owner_id, title, description, classification, hypothesis)
      VALUES ($1, $2::uuid, $3, $4, $5, $6)
      RETURNING id::text, created_at, updated_at
    `,
    [
      session.tenantId,
      session.sub,
      title,
      body.description?.trim() || null,
      classification,
      body.hypothesis?.trim() || null,
    ],
  );

  return NextResponse.json(
    {
      id: row!.id,
      title,
      description: body.description?.trim() || null,
      status: "draft",
      classification,
      confidence: null,
      hypothesis: body.hypothesis?.trim() || null,
      ownerName: session.sub,
      ownerId: session.sub,
      itemCount: 0,
      evidenceCount: 0,
      noteCount: 0,
      createdAt: row!.created_at.toISOString(),
      updatedAt: row!.updated_at.toISOString(),
    },
    { status: 201 },
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd apps/web && npx tsc --noEmit --pretty 2>&1 | head -30`

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/investigations/route.ts
git commit -m "feat(investigations): add list and create API routes"
```

---

## Task 4: Investigation Detail, Update & Status Transition

**Files:**
- Create: `apps/web/src/app/api/investigations/[investigationId]/route.ts`

- [ ] **Step 1: Create the detail/update route with state machine**

```typescript
// apps/web/src/app/api/investigations/[investigationId]/route.ts
import { NextResponse } from "next/server";
import { queryRow } from "@/lib/db";
import { getInvestigation } from "@/lib/workspaces/investigations";
import { requireApiSession } from "../_helpers";

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ["under_review"],
  under_review: ["active", "on_hold"],
  active: ["on_hold", "closed"],
  on_hold: ["active", "under_review"],
  closed: ["archived"],
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ investigationId: string }> },
) {
  const session = await requireApiSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { investigationId } = await params;
  const investigation = await getInvestigation(session.tenantId, investigationId);
  if (!investigation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(investigation);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ investigationId: string }> },
) {
  const session = await requireApiSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { investigationId } = await params;
  const body = (await request.json()) as {
    title?: string;
    description?: string;
    confidence?: number;
    hypothesis?: string;
    status?: string;
  };

  // If status transition requested, validate it first
  if (body.status) {
    const current = await queryRow<{ status: string }>(
      session.tenantId,
      "SELECT status FROM workflow.investigations WHERE tenant_id = $1 AND id = $2::uuid",
      [session.tenantId, investigationId],
    );
    if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const allowed = VALID_TRANSITIONS[current.status] ?? [];
    if (!allowed.includes(body.status)) {
      return NextResponse.json(
        { error: `Cannot transition from '${current.status}' to '${body.status}'` },
        { status: 422 },
      );
    }
  }

  const setClauses: string[] = ["updated_at = now()"];
  const values: unknown[] = [session.tenantId, investigationId];
  let paramIdx = 3;

  if (body.title !== undefined) {
    setClauses.push(`title = $${paramIdx}`);
    values.push(body.title.trim());
    paramIdx++;
  }
  if (body.description !== undefined) {
    setClauses.push(`description = $${paramIdx}`);
    values.push(body.description.trim() || null);
    paramIdx++;
  }
  if (body.confidence !== undefined) {
    setClauses.push(`confidence = $${paramIdx}`);
    values.push(body.confidence);
    paramIdx++;
  }
  if (body.hypothesis !== undefined) {
    setClauses.push(`hypothesis = $${paramIdx}`);
    values.push(body.hypothesis.trim() || null);
    paramIdx++;
  }
  if (body.status) {
    setClauses.push(`status = $${paramIdx}`);
    values.push(body.status);
    paramIdx++;
  }

  await queryRow(
    session.tenantId,
    `
      UPDATE workflow.investigations
      SET ${setClauses.join(", ")}
      WHERE tenant_id = $1 AND id = $2::uuid
    `,
    values,
  );

  const updated = await getInvestigation(session.tenantId, investigationId);
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(updated);
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd apps/web && npx tsc --noEmit --pretty 2>&1 | head -30`

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/investigations/[investigationId]/route.ts
git commit -m "feat(investigations): add detail, update, and status transition API"
```

---

## Task 5: Investigation Items API

**Files:**
- Create: `apps/web/src/app/api/investigations/[investigationId]/items/route.ts`

- [ ] **Step 1: Create the items route**

```typescript
// apps/web/src/app/api/investigations/[investigationId]/items/route.ts
import { NextResponse } from "next/server";
import { queryRow } from "@/lib/db";
import { listInvestigationItems } from "@/lib/workspaces/investigations";
import { requireApiSession } from "../../_helpers";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ investigationId: string }> },
) {
  const session = await requireApiSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { investigationId } = await params;
  const url = new URL(request.url);
  const itemType = url.searchParams.get("itemType") ?? undefined;
  const role = url.searchParams.get("role") ?? undefined;

  const items = await listInvestigationItems(session.tenantId, investigationId, { itemType, role });
  return NextResponse.json({ items });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ investigationId: string }> },
) {
  const session = await requireApiSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { investigationId } = await params;
  const body = (await request.json()) as {
    itemType?: string;
    itemId?: string;
    role?: string;
    notes?: string;
  };

  const validTypes = ["event", "entity", "document", "claim"];
  if (!body.itemType || !validTypes.includes(body.itemType)) {
    return NextResponse.json({ error: `itemType must be one of: ${validTypes.join(", ")}` }, { status: 400 });
  }
  if (!body.itemId?.trim()) {
    return NextResponse.json({ error: "itemId is required" }, { status: 400 });
  }

  const validRoles = ["key_evidence", "supporting", "context", "lead", "exculpatory", "disputed"];
  const role = body.role?.trim() || "evidence";
  if (!validRoles.includes(role)) {
    return NextResponse.json({ error: `role must be one of: ${validRoles.join(", ")}` }, { status: 400 });
  }

  const row = await queryRow<{ id: string; created_at: Date }>(
    session.tenantId,
    `
      INSERT INTO workflow.investigation_items (investigation_id, item_type, item_id, role, added_by, notes)
      VALUES ($1::uuid, $2, $3::uuid, $4, $5::uuid, $6)
      RETURNING id::text, created_at
    `,
    [investigationId, body.itemType, body.itemId.trim(), role, session.sub, body.notes?.trim() || null],
  );

  return NextResponse.json(
    {
      id: row!.id,
      itemType: body.itemType,
      itemId: body.itemId.trim(),
      role,
      addedBy: session.sub,
      addedByName: session.sub,
      notes: body.notes?.trim() || null,
      createdAt: row!.created_at.toISOString(),
    },
    { status: 201 },
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/api/investigations/[investigationId]/items/route.ts
git commit -m "feat(investigations): add items list and attach API"
```

---

## Task 6: Investigation Evidence & Custody API

**Files:**
- Create: `apps/web/src/app/api/investigations/[investigationId]/evidence/route.ts`
- Create: `apps/web/src/app/api/investigations/[investigationId]/evidence/[evidenceId]/route.ts`
- Create: `apps/web/src/app/api/investigations/[investigationId]/custody/route.ts`

- [ ] **Step 1: Create evidence list/attach route with custody logging**

```typescript
// apps/web/src/app/api/investigations/[investigationId]/evidence/route.ts
import { NextResponse } from "next/server";
import { queryRow } from "@/lib/db";
import { listInvestigationEvidence } from "@/lib/workspaces/investigations";
import { requireApiSession } from "../../_helpers";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ investigationId: string }> },
) {
  const session = await requireApiSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { investigationId } = await params;
  const items = await listInvestigationEvidence(session.tenantId, investigationId);
  return NextResponse.json({ items });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ investigationId: string }> },
) {
  const session = await requireApiSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { investigationId } = await params;
  const body = (await request.json()) as {
    documentId?: string;
    evidenceHash?: string;
    s3KeyWorm?: string;
  };

  if (!body.documentId?.trim()) return NextResponse.json({ error: "documentId is required" }, { status: 400 });
  if (!body.evidenceHash?.trim()) return NextResponse.json({ error: "evidenceHash is required" }, { status: 400 });
  if (!body.s3KeyWorm?.trim()) return NextResponse.json({ error: "s3KeyWorm is required" }, { status: 400 });

  const row = await queryRow<{ id: string; created_at: Date }>(
    session.tenantId,
    `
      INSERT INTO workflow.investigation_evidence (investigation_id, document_id, evidence_hash, s3_key_worm)
      VALUES ($1::uuid, $2::uuid, $3, $4)
      RETURNING id::text, created_at
    `,
    [investigationId, body.documentId.trim(), body.evidenceHash.trim(), body.s3KeyWorm.trim()],
  );

  // Log ingested action to custody log
  const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  await queryRow(
    session.tenantId,
    `
      INSERT INTO workflow.evidence_custody_log (evidence_id, user_id, action, evidence_hash_at_action, ip_address)
      VALUES ($1::uuid, $2::uuid, 'ingested', $3, $4::inet)
    `,
    [row!.id, session.sub, body.evidenceHash.trim(), clientIp],
  );

  return NextResponse.json(
    {
      id: row!.id,
      documentId: body.documentId.trim(),
      documentTitle: "Evidence document",
      evidenceHash: body.evidenceHash.trim(),
      s3KeyWorm: body.s3KeyWorm.trim(),
      isVerified: false,
      verifiedBy: null,
      verifiedByName: null,
      verifiedAt: null,
      createdAt: row!.created_at.toISOString(),
    },
    { status: 201 },
  );
}
```

- [ ] **Step 2: Create evidence verify/challenge route**

```typescript
// apps/web/src/app/api/investigations/[investigationId]/evidence/[evidenceId]/route.ts
import { NextResponse } from "next/server";
import { queryRow } from "@/lib/db";
import { requireApiSession } from "../../../_helpers";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ investigationId: string; evidenceId: string }> },
) {
  const session = await requireApiSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { evidenceId } = await params;
  const body = (await request.json()) as { action?: string };

  const validActions = ["verified", "challenged"];
  if (!body.action || !validActions.includes(body.action)) {
    return NextResponse.json({ error: `action must be one of: ${validActions.join(", ")}` }, { status: 400 });
  }

  const current = await queryRow<{ id: string; evidence_hash: string }>(
    session.tenantId,
    "SELECT id::text, evidence_hash FROM workflow.investigation_evidence WHERE id = $1::uuid",
    [evidenceId],
  );
  if (!current) return NextResponse.json({ error: "Evidence not found" }, { status: 404 });

  if (body.action === "verified") {
    await queryRow(
      session.tenantId,
      `
        UPDATE workflow.investigation_evidence
        SET is_verified = TRUE, verified_by = $2::uuid, verified_at = now()
        WHERE id = $1::uuid
      `,
      [evidenceId, session.sub],
    );
  }

  // Log custody action
  const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  await queryRow(
    session.tenantId,
    `
      INSERT INTO workflow.evidence_custody_log (evidence_id, user_id, action, evidence_hash_at_action, ip_address)
      VALUES ($1::uuid, $2::uuid, $3, $4, $5::inet)
    `,
    [evidenceId, session.sub, body.action, current.evidence_hash, clientIp],
  );

  const updated = await queryRow<{
    id: string;
    is_verified: boolean;
    verified_by: string | null;
    verified_at: Date | null;
  }>(
    session.tenantId,
    "SELECT id::text, is_verified, verified_by::text, verified_at FROM workflow.investigation_evidence WHERE id = $1::uuid",
    [evidenceId],
  );

  return NextResponse.json({
    id: updated!.id,
    isVerified: updated!.is_verified,
    verifiedBy: updated!.verified_by,
    verifiedAt: updated!.verified_at?.toISOString() ?? null,
  });
}
```

- [ ] **Step 3: Create custody log route**

```typescript
// apps/web/src/app/api/investigations/[investigationId]/custody/route.ts
import { NextResponse } from "next/server";
import { getCustodyLog } from "@/lib/workspaces/investigations";
import { requireApiSession } from "../../_helpers";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ investigationId: string }> },
) {
  const session = await requireApiSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { investigationId } = await params;
  const entries = await getCustodyLog(session.tenantId, investigationId);
  return NextResponse.json({ entries });
}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd apps/web && npx tsc --noEmit --pretty 2>&1 | head -30`

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/investigations/[investigationId]/evidence/ apps/web/src/app/api/investigations/[investigationId]/custody/
git commit -m "feat(investigations): add evidence, verification, and custody log APIs"
```

---

## Task 7: Investigation Notes & Metrics API

**Files:**
- Create: `apps/web/src/app/api/investigations/[investigationId]/notes/route.ts`
- Create: `apps/web/src/app/api/investigations/metrics/route.ts`

- [ ] **Step 1: Create notes route**

```typescript
// apps/web/src/app/api/investigations/[investigationId]/notes/route.ts
import { NextResponse } from "next/server";
import { queryRow } from "@/lib/db";
import { listInvestigationNotes } from "@/lib/workspaces/investigations";
import { requireApiSession } from "../../_helpers";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ investigationId: string }> },
) {
  const session = await requireApiSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { investigationId } = await params;
  const url = new URL(request.url);
  const noteType = url.searchParams.get("noteType") ?? undefined;

  const items = await listInvestigationNotes(session.tenantId, investigationId, { noteType });
  return NextResponse.json({ items });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ investigationId: string }> },
) {
  const session = await requireApiSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { investigationId } = await params;
  const body = (await request.json()) as {
    body?: string;
    noteType?: string;
  };

  const noteBody = body.body?.trim();
  if (!noteBody) return NextResponse.json({ error: "body is required" }, { status: 400 });

  const validTypes = ["note", "hypothesis", "task", "decision"];
  const noteType = body.noteType?.trim() || "note";
  if (!validTypes.includes(noteType)) {
    return NextResponse.json({ error: `noteType must be one of: ${validTypes.join(", ")}` }, { status: 400 });
  }

  const row = await queryRow<{ id: string; created_at: Date; updated_at: Date }>(
    session.tenantId,
    `
      INSERT INTO workflow.investigation_notes (investigation_id, author_id, note_type, body)
      VALUES ($1::uuid, $2::uuid, $3, $4)
      RETURNING id::text, created_at, updated_at
    `,
    [investigationId, session.sub, noteType, noteBody],
  );

  return NextResponse.json(
    {
      id: row!.id,
      noteType,
      body: noteBody,
      authorId: session.sub,
      authorName: session.sub,
      isAiGenerated: false,
      verificationStatus: "unverified",
      createdAt: row!.created_at.toISOString(),
      updatedAt: row!.updated_at.toISOString(),
    },
    { status: 201 },
  );
}
```

- [ ] **Step 2: Create metrics route**

```typescript
// apps/web/src/app/api/investigations/metrics/route.ts
import { NextResponse } from "next/server";
import { getInvestigationMetrics } from "@/lib/workspaces/investigations";
import { requireApiSession } from "../_helpers";

export async function GET(request: Request) {
  const session = await requireApiSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const metrics = await getInvestigationMetrics(session.tenantId);
  return NextResponse.json(metrics);
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/investigations/[investigationId]/notes/ apps/web/src/app/api/investigations/metrics/
git commit -m "feat(investigations): add notes and metrics API routes"
```

---

## Task 8: Investigations Client SDK

**Files:**
- Create: `apps/web/src/lib/workspaces/investigations-client.ts`

- [ ] **Step 1: Create the typed fetch client**

```typescript
// apps/web/src/lib/workspaces/investigations-client.ts
"use client";

import type {
  InvestigationSummary,
  InvestigationItem,
  EvidenceRecord,
  InvestigationNote,
  CustodyEntry,
  InvestigationMetrics,
} from "./investigations";

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, credentials: "include" });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function fetchInvestigations(options?: { status?: string; limit?: number; offset?: number }) {
  const params = new URLSearchParams();
  if (options?.status) params.set("status", options.status);
  if (options?.limit) params.set("limit", String(options.limit));
  if (options?.offset) params.set("offset", String(options.offset));
  const qs = params.toString();
  return apiFetch<{ items: InvestigationSummary[]; total: number }>(`/api/investigations${qs ? `?${qs}` : ""}`);
}

export async function fetchInvestigation(id: string) {
  return apiFetch<InvestigationSummary>(`/api/investigations/${id}`);
}

export async function createInvestigation(body: {
  title: string;
  description?: string;
  classification?: string;
  hypothesis?: string;
}) {
  return apiFetch<InvestigationSummary>("/api/investigations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function updateInvestigation(
  id: string,
  body: { title?: string; description?: string; confidence?: number; hypothesis?: string; status?: string },
) {
  return apiFetch<InvestigationSummary>(`/api/investigations/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function fetchInvestigationItems(id: string, options?: { itemType?: string; role?: string }) {
  const params = new URLSearchParams();
  if (options?.itemType) params.set("itemType", options.itemType);
  if (options?.role) params.set("role", options.role);
  const qs = params.toString();
  return apiFetch<{ items: InvestigationItem[] }>(`/api/investigations/${id}/items${qs ? `?${qs}` : ""}`);
}

export async function attachInvestigationItem(
  id: string,
  body: { itemType: string; itemId: string; role?: string; notes?: string },
) {
  return apiFetch<InvestigationItem>(`/api/investigations/${id}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function fetchInvestigationEvidence(id: string) {
  return apiFetch<{ items: EvidenceRecord[] }>(`/api/investigations/${id}/evidence`);
}

export async function attachInvestigationEvidence(
  id: string,
  body: { documentId: string; evidenceHash: string; s3KeyWorm: string },
) {
  return apiFetch<EvidenceRecord>(`/api/investigations/${id}/evidence`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function verifyEvidence(investigationId: string, evidenceId: string, action: "verified" | "challenged") {
  return apiFetch<{ id: string; isVerified: boolean; verifiedBy: string | null; verifiedAt: string | null }>(
    `/api/investigations/${investigationId}/evidence/${evidenceId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    },
  );
}

export async function fetchInvestigationNotes(id: string, options?: { noteType?: string }) {
  const params = new URLSearchParams();
  if (options?.noteType) params.set("noteType", options.noteType);
  const qs = params.toString();
  return apiFetch<{ items: InvestigationNote[] }>(`/api/investigations/${id}/notes${qs ? `?${qs}` : ""}`);
}

export async function createInvestigationNote(id: string, body: { body: string; noteType?: string }) {
  return apiFetch<InvestigationNote>(`/api/investigations/${id}/notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function fetchCustodyLog(id: string) {
  return apiFetch<{ entries: CustodyEntry[] }>(`/api/investigations/${id}/custody`);
}

export async function fetchInvestigationMetrics() {
  return apiFetch<InvestigationMetrics>("/api/investigations/metrics");
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd apps/web && npx tsc --noEmit --pretty 2>&1 | head -30`

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/workspaces/investigations-client.ts
git commit -m "feat(investigations): add typed client SDK"
```

---

## Task 9: Investigations Zustand Store

**Files:**
- Create: `apps/web/src/stores/investigations-store.ts`

- [ ] **Step 1: Create the store**

```typescript
// apps/web/src/stores/investigations-store.ts
"use client";

import { create } from "zustand";
import type {
  InvestigationSummary,
  InvestigationItem,
  EvidenceRecord,
  InvestigationNote,
  CustodyEntry,
} from "@/lib/workspaces/investigations";

type ActiveTab = "overview" | "items" | "evidence" | "notes" | "timeline";

type InvestigationsState = {
  cases: InvestigationSummary[];
  selectedCaseId: string | null;
  activeTab: ActiveTab;
  items: InvestigationItem[];
  evidence: EvidenceRecord[];
  notes: InvestigationNote[];
  custodyLog: CustodyEntry[];
  statusFilter: string | null;
  isCreatingCase: boolean;
  isAttachingItem: boolean;
  isAttachingEvidence: boolean;
  isWritingNote: boolean;

  hydrate: (cases: InvestigationSummary[]) => void;
  selectCase: (caseId: string | null) => void;
  setActiveTab: (tab: ActiveTab) => void;
  setItems: (items: InvestigationItem[]) => void;
  setEvidence: (evidence: EvidenceRecord[]) => void;
  setNotes: (notes: InvestigationNote[]) => void;
  setCustodyLog: (entries: CustodyEntry[]) => void;
  setStatusFilter: (status: string | null) => void;
  addCase: (c: InvestigationSummary) => void;
  addItem: (item: InvestigationItem) => void;
  addEvidence: (evidence: EvidenceRecord) => void;
  addNote: (note: InvestigationNote) => void;
  patchCase: (caseId: string, patch: Partial<InvestigationSummary>) => void;
  patchEvidence: (evidenceId: string, patch: Partial<EvidenceRecord>) => void;
  setIsCreatingCase: (v: boolean) => void;
  setIsAttachingItem: (v: boolean) => void;
  setIsAttachingEvidence: (v: boolean) => void;
  setIsWritingNote: (v: boolean) => void;
};

export const useInvestigationsStore = create<InvestigationsState>((set) => ({
  cases: [],
  selectedCaseId: null,
  activeTab: "overview",
  items: [],
  evidence: [],
  notes: [],
  custodyLog: [],
  statusFilter: null,
  isCreatingCase: false,
  isAttachingItem: false,
  isAttachingEvidence: false,
  isWritingNote: false,

  hydrate: (cases) =>
    set({
      cases,
      selectedCaseId: cases[0]?.id ?? null,
    }),

  selectCase: (selectedCaseId) =>
    set({ selectedCaseId, activeTab: "overview", items: [], evidence: [], notes: [], custodyLog: [] }),

  setActiveTab: (activeTab) => set({ activeTab }),
  setItems: (items) => set({ items }),
  setEvidence: (evidence) => set({ evidence }),
  setNotes: (notes) => set({ notes }),
  setCustodyLog: (custodyLog) => set({ custodyLog }),
  setStatusFilter: (statusFilter) => set({ statusFilter }),

  addCase: (c) =>
    set((state) => ({
      cases: [c, ...state.cases],
      selectedCaseId: c.id,
      isCreatingCase: false,
    })),

  addItem: (item) =>
    set((state) => ({
      items: [item, ...state.items],
      isAttachingItem: false,
    })),

  addEvidence: (evidence) =>
    set((state) => ({
      evidence: [evidence, ...state.evidence],
      isAttachingEvidence: false,
    })),

  addNote: (note) =>
    set((state) => ({
      notes: [note, ...state.notes],
      isWritingNote: false,
    })),

  patchCase: (caseId, patch) =>
    set((state) => ({
      cases: state.cases.map((c) => (c.id === caseId ? { ...c, ...patch } : c)),
    })),

  patchEvidence: (evidenceId, patch) =>
    set((state) => ({
      evidence: state.evidence.map((e) => (e.id === evidenceId ? { ...e, ...patch } : e)),
    })),

  setIsCreatingCase: (isCreatingCase) => set({ isCreatingCase }),
  setIsAttachingItem: (isAttachingItem) => set({ isAttachingItem }),
  setIsAttachingEvidence: (isAttachingEvidence) => set({ isAttachingEvidence }),
  setIsWritingNote: (isWritingNote) => set({ isWritingNote }),
}));
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/stores/investigations-store.ts
git commit -m "feat(investigations): add Zustand store"
```

---

## Task 10: Investigations Interactive Workspace — Case Directory Panel

**Files:**
- Create: `apps/web/src/features/investigations/case-directory-panel.tsx`

- [ ] **Step 1: Create the case directory panel**

```tsx
// apps/web/src/features/investigations/case-directory-panel.tsx
"use client";

import { useState } from "react";
import { useInvestigationsStore } from "@/stores/investigations-store";
import { createInvestigation } from "@/lib/workspaces/investigations-client";

const STATUS_OPTIONS = ["all", "draft", "under_review", "active", "on_hold", "closed", "archived"] as const;
const CLASSIFICATION_BADGES: Record<string, string> = {
  unclassified: "pill--muted",
  restricted: "pill--warning",
  confidential: "pill--accent",
  secret: "pill--danger",
};

export function CaseDirectoryPanel() {
  const {
    cases,
    selectedCaseId,
    statusFilter,
    isCreatingCase,
    selectCase,
    setStatusFilter,
    setIsCreatingCase,
    addCase,
  } = useInvestigationsStore();

  const [newTitle, setNewTitle] = useState("");
  const [newClassification, setNewClassification] = useState("unclassified");
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!newTitle.trim()) return;
    setSaving(true);
    try {
      const created = await createInvestigation({
        title: newTitle.trim(),
        classification: newClassification,
      });
      addCase(created);
      setNewTitle("");
      setNewClassification("unclassified");
    } finally {
      setSaving(false);
    }
  }

  const filtered = statusFilter
    ? cases.filter((c) => c.status === statusFilter)
    : cases;

  return (
    <aside className="panel panel--muted">
      <div className="section-heading section-heading--row">
        <p className="eyebrow">Case Directory</p>
        <button
          className="pill pill--primary"
          onClick={() => setIsCreatingCase(!isCreatingCase)}
        >
          {isCreatingCase ? "Cancel" : "+ New"}
        </button>
      </div>

      <select
        className="command-bar__input"
        value={statusFilter ?? "all"}
        onChange={(e) => setStatusFilter(e.target.value === "all" ? null : e.target.value)}
        style={{ marginBottom: "0.75rem" }}
      >
        {STATUS_OPTIONS.map((s) => (
          <option key={s} value={s}>
            {s === "all" ? "All statuses" : s.replace("_", " ")}
          </option>
        ))}
      </select>

      {isCreatingCase && (
        <div className="panel panel--glass" style={{ marginBottom: "0.75rem" }}>
          <input
            className="command-bar__input"
            placeholder="Investigation title"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
          <select
            className="command-bar__input"
            value={newClassification}
            onChange={(e) => setNewClassification(e.target.value)}
            style={{ marginTop: "0.5rem" }}
          >
            <option value="unclassified">Unclassified</option>
            <option value="restricted">Restricted</option>
            <option value="confidential">Confidential</option>
            <option value="secret">Secret</option>
          </select>
          <button
            className="pill pill--primary"
            onClick={handleCreate}
            disabled={saving || !newTitle.trim()}
            style={{ marginTop: "0.5rem" }}
          >
            {saving ? "Creating..." : "Create"}
          </button>
        </div>
      )}

      <div className="list-stack">
        {filtered.map((c) => (
          <div
            key={c.id}
            className={`feed-card${c.id === selectedCaseId ? " is-active" : ""}`}
            onClick={() => selectCase(c.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && selectCase(c.id)}
          >
            <div className="feed-card__meta">
              <span className={`pill ${CLASSIFICATION_BADGES[c.classification] ?? "pill--muted"}`}>
                {c.classification}
              </span>
              <span className="pill">{c.status.replace("_", " ")}</span>
            </div>
            <strong>{c.id.slice(0, 8).toUpperCase()}</strong>
            <p>{c.title}</p>
            <div className="feed-card__meta">
              <span>{c.itemCount} items</span>
              <span>{c.evidenceCount} evidence</span>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text--muted">No investigations found.</p>
        )}
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/features/investigations/case-directory-panel.tsx
git commit -m "feat(investigations): add case directory panel component"
```

---

## Task 11: Investigations Interactive Workspace — Case Detail Panel

**Files:**
- Create: `apps/web/src/features/investigations/case-detail.tsx`

- [ ] **Step 1: Create the tabbed case detail panel**

```tsx
// apps/web/src/features/investigations/case-detail.tsx
"use client";

import { useEffect, useState } from "react";
import { useInvestigationsStore } from "@/stores/investigations-store";
import {
  fetchInvestigationItems,
  fetchInvestigationEvidence,
  fetchInvestigationNotes,
  fetchCustodyLog,
  updateInvestigation,
  attachInvestigationItem,
  attachInvestigationEvidence,
  createInvestigationNote,
  verifyEvidence,
} from "@/lib/workspaces/investigations-client";

const VALID_TRANSITIONS: Record<string, { label: string; target: string }[]> = {
  draft: [{ label: "Submit for Review", target: "under_review" }],
  under_review: [
    { label: "Activate", target: "active" },
    { label: "Put on Hold", target: "on_hold" },
  ],
  active: [
    { label: "Put on Hold", target: "on_hold" },
    { label: "Close", target: "closed" },
  ],
  on_hold: [
    { label: "Resume (Active)", target: "active" },
    { label: "Back to Review", target: "under_review" },
  ],
  closed: [{ label: "Archive", target: "archived" }],
};

const TABS = ["overview", "items", "evidence", "notes", "timeline"] as const;

export function CaseDetail() {
  const {
    cases,
    selectedCaseId,
    activeTab,
    items,
    evidence,
    notes,
    custodyLog,
    isAttachingItem,
    isAttachingEvidence,
    isWritingNote,
    setActiveTab,
    setItems,
    setEvidence,
    setNotes,
    setCustodyLog,
    addItem,
    addEvidence,
    addNote,
    patchCase,
    patchEvidence,
    setIsAttachingItem,
    setIsAttachingEvidence,
    setIsWritingNote,
  } = useInvestigationsStore();

  const selected = cases.find((c) => c.id === selectedCaseId) ?? null;

  // Fetch tab data when selection or tab changes
  useEffect(() => {
    if (!selectedCaseId) return;
    if (activeTab === "items") {
      fetchInvestigationItems(selectedCaseId).then((r) => setItems(r.items));
    } else if (activeTab === "evidence") {
      fetchInvestigationEvidence(selectedCaseId).then((r) => setEvidence(r.items));
    } else if (activeTab === "notes") {
      fetchInvestigationNotes(selectedCaseId).then((r) => setNotes(r.items));
    } else if (activeTab === "timeline") {
      Promise.all([
        fetchInvestigationItems(selectedCaseId),
        fetchInvestigationEvidence(selectedCaseId),
        fetchInvestigationNotes(selectedCaseId),
        fetchCustodyLog(selectedCaseId),
      ]).then(([i, e, n, c]) => {
        setItems(i.items);
        setEvidence(e.items);
        setNotes(n.items);
        setCustodyLog(c.entries);
      });
    }
  }, [selectedCaseId, activeTab, setItems, setEvidence, setNotes, setCustodyLog]);

  if (!selected) {
    return (
      <article className="panel panel--document">
        <p className="text--muted">Select an investigation from the directory.</p>
      </article>
    );
  }

  async function handleStatusTransition(target: string) {
    if (!selectedCaseId) return;
    const updated = await updateInvestigation(selectedCaseId, { status: target });
    patchCase(selectedCaseId, updated);
  }

  return (
    <article className="panel panel--document">
      <div className="tab-bar" style={{ marginBottom: "1rem" }}>
        {TABS.map((tab) => (
          <button
            key={tab}
            className={`pill${activeTab === tab ? " pill--primary" : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <OverviewTab
          selected={selected}
          onTransition={handleStatusTransition}
        />
      )}
      {activeTab === "items" && (
        <ItemsTab
          items={items}
          investigationId={selectedCaseId!}
          isAttaching={isAttachingItem}
          setIsAttaching={setIsAttachingItem}
          addItem={addItem}
        />
      )}
      {activeTab === "evidence" && (
        <EvidenceTab
          evidence={evidence}
          investigationId={selectedCaseId!}
          isAttaching={isAttachingEvidence}
          setIsAttaching={setIsAttachingEvidence}
          addEvidence={addEvidence}
          patchEvidence={patchEvidence}
        />
      )}
      {activeTab === "notes" && (
        <NotesTab
          notes={notes}
          investigationId={selectedCaseId!}
          isWriting={isWritingNote}
          setIsWriting={setIsWritingNote}
          addNote={addNote}
        />
      )}
      {activeTab === "timeline" && (
        <TimelineTab items={items} evidence={evidence} notes={notes} custodyLog={custodyLog} />
      )}
    </article>
  );
}

/* ── Tab sub-components ── */

import type {
  InvestigationSummary,
  InvestigationItem,
  EvidenceRecord,
  InvestigationNote,
  CustodyEntry,
} from "@/lib/workspaces/investigations";

function OverviewTab({
  selected,
  onTransition,
}: {
  selected: InvestigationSummary;
  onTransition: (target: string) => void;
}) {
  const transitions = VALID_TRANSITIONS[selected.status] ?? [];
  return (
    <>
      <h1 className="hero-title">{selected.title}</h1>
      <p className="hero-copy">{selected.description ?? "No description."}</p>
      {selected.hypothesis && (
        <section className="note-card">
          <p className="eyebrow">Hypothesis</p>
          <p>{selected.hypothesis}</p>
        </section>
      )}
      {transitions.length > 0 && (
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
          {transitions.map((t) => (
            <button
              key={t.target}
              className="pill pill--primary"
              onClick={() => onTransition(t.target)}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function ItemsTab({
  items,
  investigationId,
  isAttaching,
  setIsAttaching,
  addItem,
}: {
  items: InvestigationItem[];
  investigationId: string;
  isAttaching: boolean;
  setIsAttaching: (v: boolean) => void;
  addItem: (item: InvestigationItem) => void;
}) {
  const [itemType, setItemType] = useState("event");
  const [itemId, setItemId] = useState("");
  const [role, setRole] = useState("evidence");
  const [itemNotes, setItemNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleAttach() {
    if (!itemId.trim()) return;
    setSaving(true);
    try {
      const created = await attachInvestigationItem(investigationId, {
        itemType,
        itemId: itemId.trim(),
        role,
        notes: itemNotes.trim() || undefined,
      });
      addItem(created);
      setItemId("");
      setItemNotes("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="section-heading section-heading--row">
        <p className="eyebrow">Linked Items ({items.length})</p>
        <button className="pill pill--primary" onClick={() => setIsAttaching(!isAttaching)}>
          {isAttaching ? "Cancel" : "+ Attach"}
        </button>
      </div>

      {isAttaching && (
        <div className="panel panel--glass" style={{ marginBottom: "0.75rem" }}>
          <select className="command-bar__input" value={itemType} onChange={(e) => setItemType(e.target.value)}>
            <option value="event">Event</option>
            <option value="entity">Entity</option>
            <option value="document">Document</option>
            <option value="claim">Claim</option>
          </select>
          <input
            className="command-bar__input"
            placeholder="Item ID (UUID)"
            value={itemId}
            onChange={(e) => setItemId(e.target.value)}
            style={{ marginTop: "0.5rem" }}
          />
          <select
            className="command-bar__input"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            style={{ marginTop: "0.5rem" }}
          >
            <option value="evidence">Evidence</option>
            <option value="key_evidence">Key Evidence</option>
            <option value="supporting">Supporting</option>
            <option value="context">Context</option>
            <option value="lead">Lead</option>
            <option value="exculpatory">Exculpatory</option>
            <option value="disputed">Disputed</option>
          </select>
          <textarea
            className="command-bar__input"
            placeholder="Notes (optional)"
            value={itemNotes}
            onChange={(e) => setItemNotes(e.target.value)}
            rows={2}
            style={{ marginTop: "0.5rem" }}
          />
          <button
            className="pill pill--primary"
            onClick={handleAttach}
            disabled={saving || !itemId.trim()}
            style={{ marginTop: "0.5rem" }}
          >
            {saving ? "Attaching..." : "Attach Item"}
          </button>
        </div>
      )}

      <div className="list-stack">
        {items.map((item) => (
          <div key={item.id} className="feed-card">
            <div className="feed-card__meta">
              <span className="pill">{item.itemType}</span>
              <span className="pill pill--accent">{item.role}</span>
            </div>
            <strong>{item.itemId.slice(0, 8).toUpperCase()}</strong>
            {item.notes && <p>{item.notes}</p>}
            <p className="text--muted">Added by {item.addedByName}</p>
          </div>
        ))}
        {items.length === 0 && <p className="text--muted">No items linked yet.</p>}
      </div>
    </>
  );
}

function EvidenceTab({
  evidence,
  investigationId,
  isAttaching,
  setIsAttaching,
  addEvidence,
  patchEvidence,
}: {
  evidence: EvidenceRecord[];
  investigationId: string;
  isAttaching: boolean;
  setIsAttaching: (v: boolean) => void;
  addEvidence: (e: EvidenceRecord) => void;
  patchEvidence: (id: string, patch: Partial<EvidenceRecord>) => void;
}) {
  const [docId, setDocId] = useState("");
  const [hash, setHash] = useState("");
  const [s3Key, setS3Key] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleAttach() {
    if (!docId.trim() || !hash.trim() || !s3Key.trim()) return;
    setSaving(true);
    try {
      const created = await attachInvestigationEvidence(investigationId, {
        documentId: docId.trim(),
        evidenceHash: hash.trim(),
        s3KeyWorm: s3Key.trim(),
      });
      addEvidence(created);
      setDocId("");
      setHash("");
      setS3Key("");
    } finally {
      setSaving(false);
    }
  }

  async function handleVerify(evidenceId: string, action: "verified" | "challenged") {
    const result = await verifyEvidence(investigationId, evidenceId, action);
    patchEvidence(evidenceId, {
      isVerified: result.isVerified,
      verifiedBy: result.verifiedBy,
      verifiedAt: result.verifiedAt,
    });
  }

  return (
    <>
      <div className="section-heading section-heading--row">
        <p className="eyebrow">Evidence Chain ({evidence.length})</p>
        <button className="pill pill--primary" onClick={() => setIsAttaching(!isAttaching)}>
          {isAttaching ? "Cancel" : "+ Attach"}
        </button>
      </div>

      {isAttaching && (
        <div className="panel panel--glass" style={{ marginBottom: "0.75rem" }}>
          <input className="command-bar__input" placeholder="Document ID (UUID)" value={docId} onChange={(e) => setDocId(e.target.value)} />
          <input className="command-bar__input" placeholder="Evidence hash (SHA-256)" value={hash} onChange={(e) => setHash(e.target.value)} style={{ marginTop: "0.5rem" }} />
          <input className="command-bar__input" placeholder="S3 WORM key" value={s3Key} onChange={(e) => setS3Key(e.target.value)} style={{ marginTop: "0.5rem" }} />
          <button className="pill pill--primary" onClick={handleAttach} disabled={saving || !docId.trim() || !hash.trim() || !s3Key.trim()} style={{ marginTop: "0.5rem" }}>
            {saving ? "Attaching..." : "Attach Evidence"}
          </button>
        </div>
      )}

      <div className="list-stack">
        {evidence.map((e) => (
          <div key={e.id} className="feed-card">
            <div className="feed-card__meta">
              <span className={`pill ${e.isVerified ? "pill--primary" : "pill--warning"}`}>
                {e.isVerified ? "Verified" : "Unverified"}
              </span>
            </div>
            <strong>{e.documentTitle}</strong>
            <p className="text--muted">Hash: {e.evidenceHash.slice(0, 16)}...</p>
            {!e.isVerified && (
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                <button className="pill pill--primary" onClick={() => handleVerify(e.id, "verified")}>Verify</button>
                <button className="pill pill--danger" onClick={() => handleVerify(e.id, "challenged")}>Challenge</button>
              </div>
            )}
            {e.isVerified && e.verifiedByName && (
              <p className="text--muted">Verified by {e.verifiedByName} on {e.verifiedAt}</p>
            )}
          </div>
        ))}
        {evidence.length === 0 && <p className="text--muted">No evidence attached yet.</p>}
      </div>
    </>
  );
}

function NotesTab({
  notes,
  investigationId,
  isWriting,
  setIsWriting,
  addNote,
}: {
  notes: InvestigationNote[];
  investigationId: string;
  isWriting: boolean;
  setIsWriting: (v: boolean) => void;
  addNote: (note: InvestigationNote) => void;
}) {
  const [noteBody, setNoteBody] = useState("");
  const [noteType, setNoteType] = useState("note");
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!noteBody.trim()) return;
    setSaving(true);
    try {
      const created = await createInvestigationNote(investigationId, {
        body: noteBody.trim(),
        noteType,
      });
      addNote(created);
      setNoteBody("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="section-heading section-heading--row">
        <p className="eyebrow">Notes ({notes.length})</p>
        <button className="pill pill--primary" onClick={() => setIsWriting(!isWriting)}>
          {isWriting ? "Cancel" : "+ Add Note"}
        </button>
      </div>

      {isWriting && (
        <div className="panel panel--glass" style={{ marginBottom: "0.75rem" }}>
          <select className="command-bar__input" value={noteType} onChange={(e) => setNoteType(e.target.value)}>
            <option value="note">Note</option>
            <option value="hypothesis">Hypothesis</option>
            <option value="task">Task</option>
            <option value="decision">Decision</option>
          </select>
          <textarea
            className="command-bar__input"
            placeholder="Write your note..."
            value={noteBody}
            onChange={(e) => setNoteBody(e.target.value)}
            rows={4}
            style={{ marginTop: "0.5rem" }}
          />
          <button
            className="pill pill--primary"
            onClick={handleCreate}
            disabled={saving || !noteBody.trim()}
            style={{ marginTop: "0.5rem" }}
          >
            {saving ? "Saving..." : "Save Note"}
          </button>
        </div>
      )}

      <div className="list-stack">
        {notes.map((n) => (
          <div key={n.id} className="feed-card">
            <div className="feed-card__meta">
              <span className="pill">{n.noteType}</span>
              {n.isAiGenerated && <span className="pill pill--accent">AI</span>}
              <span className="pill">{n.verificationStatus}</span>
            </div>
            <p>{n.body}</p>
            <p className="text--muted">{n.authorName} &middot; {n.createdAt}</p>
          </div>
        ))}
        {notes.length === 0 && <p className="text--muted">No notes yet.</p>}
      </div>
    </>
  );
}

function TimelineTab({
  items,
  evidence,
  notes,
  custodyLog,
}: {
  items: InvestigationItem[];
  evidence: EvidenceRecord[];
  notes: InvestigationNote[];
  custodyLog: CustodyEntry[];
}) {
  // Merge all activity into a single timeline, sorted chronologically (newest first)
  type TimelineEntry = { timestamp: string; action: string; detail: string };

  const entries: TimelineEntry[] = [
    ...items.map((i) => ({
      timestamp: i.createdAt,
      action: "Item attached",
      detail: `${i.itemType} (${i.role}) by ${i.addedByName}`,
    })),
    ...evidence.map((e) => ({
      timestamp: e.createdAt,
      action: "Evidence attached",
      detail: e.documentTitle,
    })),
    ...notes.map((n) => ({
      timestamp: n.createdAt,
      action: `${n.noteType} added`,
      detail: n.body.slice(0, 100),
    })),
    ...custodyLog.map((c) => ({
      timestamp: c.createdAt,
      action: `Evidence ${c.action}`,
      detail: `by ${c.userName}`,
    })),
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return (
    <>
      <p className="eyebrow">Activity Timeline ({entries.length})</p>
      <div className="list-stack">
        {entries.map((entry, idx) => (
          <div key={`${entry.timestamp}-${idx}`} className="feed-card">
            <div className="feed-card__meta">
              <span className="pill">{entry.action}</span>
              <span>{entry.timestamp}</span>
            </div>
            <p>{entry.detail}</p>
          </div>
        ))}
        {entries.length === 0 && <p className="text--muted">No activity yet.</p>}
      </div>
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/features/investigations/case-detail.tsx
git commit -m "feat(investigations): add tabbed case detail panel"
```

---

## Task 12: Investigations Interactive Workspace — Integrity Rail & Orchestrator

**Files:**
- Create: `apps/web/src/features/investigations/case-integrity-rail.tsx`
- Create: `apps/web/src/features/investigations/investigations-workspace.tsx`

- [ ] **Step 1: Create the case integrity rail**

```tsx
// apps/web/src/features/investigations/case-integrity-rail.tsx
"use client";

import { useInvestigationsStore } from "@/stores/investigations-store";

export function CaseIntegrityRail() {
  const { cases, selectedCaseId } = useInvestigationsStore();
  const selected = cases.find((c) => c.id === selectedCaseId) ?? null;

  if (!selected) {
    return (
      <aside className="panel">
        <p className="eyebrow">Case Integrity</p>
        <p className="text--muted">Select a case to view details.</p>
      </aside>
    );
  }

  return (
    <aside className="panel">
      <p className="eyebrow">Case Integrity</p>
      <div className="data-grid">
        <div className="data-point">
          <span>Status</span>
          <strong>{selected.status.replace("_", " ")}</strong>
        </div>
        <div className="data-point">
          <span>Classification</span>
          <strong>{selected.classification}</strong>
        </div>
        <div className="data-point">
          <span>Confidence</span>
          <strong>{selected.confidence === null ? "pending" : selected.confidence.toFixed(2)}</strong>
        </div>
        <div className="data-point">
          <span>Owner</span>
          <strong>{selected.ownerName}</strong>
        </div>
        <div className="data-point">
          <span>Items</span>
          <strong>{selected.itemCount}</strong>
        </div>
        <div className="data-point">
          <span>Evidence</span>
          <strong>{selected.evidenceCount}</strong>
        </div>
        <div className="data-point">
          <span>Notes</span>
          <strong>{selected.noteCount}</strong>
        </div>
        <div className="data-point">
          <span>Updated</span>
          <strong>{selected.updatedAt}</strong>
        </div>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Create the interactive workspace orchestrator**

```tsx
// apps/web/src/features/investigations/investigations-workspace.tsx
"use client";

import { useEffect } from "react";
import type { InvestigationsWorkspaceData } from "@/lib/workspaces/investigations";
import { useInvestigationsStore } from "@/stores/investigations-store";
import { fetchInvestigations } from "@/lib/workspaces/investigations-client";
import { CaseDirectoryPanel } from "./case-directory-panel";
import { CaseDetail } from "./case-detail";
import { CaseIntegrityRail } from "./case-integrity-rail";

export function InvestigationsInteractiveWorkspace({ data }: { data: InvestigationsWorkspaceData }) {
  const hydrate = useInvestigationsStore((s) => s.hydrate);

  useEffect(() => {
    // Hydrate from SSR data first
    const initial = data.cases.map((c) => ({
      id: c.investigationId,
      title: c.title,
      description: c.description ?? null,
      status: c.status,
      classification: c.classification,
      confidence: c.confidence,
      hypothesis: null,
      ownerName: c.ownerName,
      ownerId: "",
      itemCount: c.itemCount,
      evidenceCount: c.evidenceCount,
      noteCount: c.noteCount,
      createdAt: c.updatedAt ?? new Date().toISOString(),
      updatedAt: c.updatedAt ?? new Date().toISOString(),
    }));
    hydrate(initial);

    // Then fetch fresh API data
    fetchInvestigations({ limit: 50 }).then((r) => {
      if (r.items.length > 0) hydrate(r.items);
    });
  }, [data.cases, hydrate]);

  return (
    <section className="workspace-screen">
      <div className="workspace-columns workspace-columns--three investigations-layout">
        <CaseDirectoryPanel />
        <CaseDetail />
        <CaseIntegrityRail />
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/investigations/case-integrity-rail.tsx apps/web/src/features/investigations/investigations-workspace.tsx
git commit -m "feat(investigations): add integrity rail and workspace orchestrator"
```

---

## Task 13: Wire Investigations Page to Interactive Workspace

**Files:**
- Modify: `apps/web/src/app/(authenticated)/investigations/page.tsx`

- [ ] **Step 1: Update the page to use the interactive workspace**

Replace the entire contents of `apps/web/src/app/(authenticated)/investigations/page.tsx`:

```tsx
import { InvestigationsInteractiveWorkspace } from "@/features/investigations/investigations-workspace";
import { getServerPrincipal } from "@/lib/server-session";
import { getInvestigationsWorkspaceData } from "@/lib/workspaces/investigations";

export default async function InvestigationsPage() {
  const session = await getServerPrincipal();
  const data = await getInvestigationsWorkspaceData(session.tenantId);

  return <InvestigationsInteractiveWorkspace data={data} />;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd apps/web && npx tsc --noEmit --pretty 2>&1 | head -30`

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/\(authenticated\)/investigations/page.tsx
git commit -m "feat(investigations): wire page to interactive workspace"
```

---

## Task 14: Briefings Data Layer — Types and Query Functions

**Files:**
- Modify: `apps/web/src/lib/workspaces/briefings.ts`

- [ ] **Step 1: Add API response types after existing types**

Add after the existing `BriefingsWorkspaceData` type:

```typescript
/* ── API types (used by route handlers and client SDK) ── */

export type BriefingSummary = {
  id: string;
  title: string;
  audience: string | null;
  status: string;
  currentVersion: number;
  ownerName: string;
  ownerId: string;
  approvedBy: string | null;
  approvedAt: string | null;
  publishedAt: string | null;
  supersedesId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BriefingSection = {
  title: string;
  body: string;
};

export type BriefingDetail = BriefingSummary & {
  sections: BriefingSection[];
  sourceInvestigationIds: string[];
  sourceEventIds: string[];
  sourceWatchlistIds: string[];
};

export type BriefingVersion = {
  id: string;
  versionNumber: number;
  sections: BriefingSection[];
  sourceInvestigationIds: string[];
  sourceEventIds: string[];
  sourceWatchlistIds: string[];
  aiDraftModel: string | null;
  editedBy: string;
  editedByName: string;
  createdAt: string;
};

export type BriefingMetrics = {
  byStatus: Record<string, number>;
  byAudience: Record<string, number>;
  totalVersions: number;
  recentPublications: BriefingSummary[];
};
```

- [ ] **Step 2: Add CRUD query functions**

Add after the existing `getBriefingsWorkspaceData` function:

```typescript
/* ── CRUD query functions (used by API routes) ── */

export async function listBriefings(
  tenantId: string,
  options?: { status?: string; audience?: string; limit?: number; offset?: number },
): Promise<{ items: BriefingSummary[]; total: number }> {
  const limit = options?.limit ?? 20;
  const offset = options?.offset ?? 0;

  const conditions = ["b.tenant_id = $1"];
  const values: unknown[] = [tenantId];
  let paramIdx = 2;

  if (options?.status) {
    conditions.push(`b.status = $${paramIdx}`);
    values.push(options.status);
    paramIdx++;
  }
  if (options?.audience) {
    conditions.push(`b.audience = $${paramIdx}`);
    values.push(options.audience);
    paramIdx++;
  }

  const where = conditions.join(" AND ");

  const countRow = await safeQueryRow<{ count: string }>(
    tenantId,
    `SELECT COUNT(*)::text AS count FROM workflow.briefings AS b WHERE ${where}`,
    values,
  );

  const rows = await safeQueryRows<{
    id: string;
    title: string;
    audience: string | null;
    status: string;
    current_version: number;
    owner_name: string | null;
    owner_id: string;
    approved_by: string | null;
    approved_at: Date | null;
    published_at: Date | null;
    supersedes_id: string | null;
    created_at: Date;
    updated_at: Date;
  }>(
    tenantId,
    `
      SELECT
        b.id::text,
        b.title,
        b.audience,
        b.status,
        b.current_version,
        u.display_name AS owner_name,
        b.owner_id::text,
        ua.display_name AS approved_by,
        b.approved_at,
        b.published_at,
        b.supersedes_id::text,
        b.created_at,
        b.updated_at
      FROM workflow.briefings AS b
      LEFT JOIN core.users AS u ON u.id = b.owner_id
      LEFT JOIN core.users AS ua ON ua.id = b.approved_by
      WHERE ${where}
      ORDER BY COALESCE(b.published_at, b.updated_at) DESC
      LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `,
    [...values, limit, offset],
  );

  return {
    items: rows.map((r) => ({
      id: r.id,
      title: r.title,
      audience: r.audience,
      status: r.status,
      currentVersion: r.current_version,
      ownerName: r.owner_name ?? "Unknown",
      ownerId: r.owner_id,
      approvedBy: r.approved_by,
      approvedAt: r.approved_at?.toISOString() ?? null,
      publishedAt: r.published_at?.toISOString() ?? null,
      supersedesId: r.supersedes_id,
      createdAt: r.created_at.toISOString(),
      updatedAt: r.updated_at.toISOString(),
    })),
    total: Number(countRow?.count ?? 0),
  };
}

export async function getBriefing(
  tenantId: string,
  briefingId: string,
): Promise<BriefingDetail | null> {
  const row = await safeQueryRow<{
    id: string;
    title: string;
    audience: string | null;
    status: string;
    current_version: number;
    owner_name: string | null;
    owner_id: string;
    approved_by: string | null;
    approved_at: Date | null;
    published_at: Date | null;
    supersedes_id: string | null;
    created_at: Date;
    updated_at: Date;
    sections: unknown;
    source_investigation_ids: string[] | null;
    source_event_ids: string[] | null;
    source_watchlist_ids: string[] | null;
  }>(
    tenantId,
    `
      SELECT
        b.id::text,
        b.title,
        b.audience,
        b.status,
        b.current_version,
        u.display_name AS owner_name,
        b.owner_id::text,
        ua.display_name AS approved_by,
        b.approved_at,
        b.published_at,
        b.supersedes_id::text,
        b.created_at,
        b.updated_at,
        bv.sections,
        bv.source_investigation_ids,
        bv.source_event_ids,
        bv.source_watchlist_ids
      FROM workflow.briefings AS b
      LEFT JOIN core.users AS u ON u.id = b.owner_id
      LEFT JOIN core.users AS ua ON ua.id = b.approved_by
      LEFT JOIN workflow.briefing_versions AS bv
        ON bv.briefing_id = b.id AND bv.version_number = b.current_version
      WHERE b.tenant_id = $1 AND b.id = $2::uuid
    `,
    [tenantId, briefingId],
  );

  if (!row) return null;

  const sections = normalizeSections(row.sections);

  return {
    id: row.id,
    title: row.title,
    audience: row.audience,
    status: row.status,
    currentVersion: row.current_version,
    ownerName: row.owner_name ?? "Unknown",
    ownerId: row.owner_id,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at?.toISOString() ?? null,
    publishedAt: row.published_at?.toISOString() ?? null,
    supersedesId: row.supersedes_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    sections,
    sourceInvestigationIds: row.source_investigation_ids ?? [],
    sourceEventIds: row.source_event_ids ?? [],
    sourceWatchlistIds: row.source_watchlist_ids ?? [],
  };
}

export async function listBriefingVersions(
  tenantId: string,
  briefingId: string,
): Promise<BriefingVersion[]> {
  const rows = await safeQueryRows<{
    id: string;
    version_number: number;
    sections: unknown;
    source_investigation_ids: string[] | null;
    source_event_ids: string[] | null;
    source_watchlist_ids: string[] | null;
    ai_draft_model: string | null;
    edited_by: string;
    edited_by_name: string | null;
    created_at: Date;
  }>(
    tenantId,
    `
      SELECT
        bv.id::text,
        bv.version_number,
        bv.sections,
        bv.source_investigation_ids,
        bv.source_event_ids,
        bv.source_watchlist_ids,
        bv.ai_draft_model,
        bv.edited_by::text,
        u.display_name AS edited_by_name,
        bv.created_at
      FROM workflow.briefing_versions AS bv
      LEFT JOIN core.users AS u ON u.id = bv.edited_by
      WHERE bv.briefing_id = $1::uuid
      ORDER BY bv.version_number DESC
    `,
    [briefingId],
  );

  return rows.map((r) => ({
    id: r.id,
    versionNumber: r.version_number,
    sections: normalizeSections(r.sections),
    sourceInvestigationIds: r.source_investigation_ids ?? [],
    sourceEventIds: r.source_event_ids ?? [],
    sourceWatchlistIds: r.source_watchlist_ids ?? [],
    aiDraftModel: r.ai_draft_model,
    editedBy: r.edited_by,
    editedByName: r.edited_by_name ?? "Unknown",
    createdAt: r.created_at.toISOString(),
  }));
}

export async function getBriefingMetrics(tenantId: string): Promise<BriefingMetrics> {
  const statusRows = await safeQueryRows<{ status: string; count: string }>(
    tenantId,
    "SELECT status, COUNT(*)::text AS count FROM workflow.briefings WHERE tenant_id = $1 GROUP BY status",
    [tenantId],
  );

  const audienceRows = await safeQueryRows<{ audience: string; count: string }>(
    tenantId,
    "SELECT COALESCE(audience, 'Unspecified') AS audience, COUNT(*)::text AS count FROM workflow.briefings WHERE tenant_id = $1 GROUP BY audience",
    [tenantId],
  );

  const versionRow = await safeQueryRow<{ count: string }>(
    tenantId,
    `
      SELECT COUNT(*)::text AS count
      FROM workflow.briefing_versions AS bv
      JOIN workflow.briefings AS b ON b.id = bv.briefing_id
      WHERE b.tenant_id = $1
    `,
    [tenantId],
  );

  const recentRows = await safeQueryRows<{
    id: string;
    title: string;
    audience: string | null;
    status: string;
    current_version: number;
    owner_name: string | null;
    owner_id: string;
    published_at: Date | null;
    updated_at: Date;
  }>(
    tenantId,
    `
      SELECT
        b.id::text, b.title, b.audience, b.status, b.current_version,
        u.display_name AS owner_name, b.owner_id::text,
        b.published_at, b.updated_at
      FROM workflow.briefings AS b
      LEFT JOIN core.users AS u ON u.id = b.owner_id
      WHERE b.tenant_id = $1 AND b.status = 'published'
      ORDER BY b.published_at DESC NULLS LAST
      LIMIT 5
    `,
    [tenantId],
  );

  const byStatus: Record<string, number> = {};
  for (const r of statusRows) byStatus[r.status] = Number(r.count);

  const byAudience: Record<string, number> = {};
  for (const r of audienceRows) byAudience[r.audience] = Number(r.count);

  return {
    byStatus,
    byAudience,
    totalVersions: Number(versionRow?.count ?? 0),
    recentPublications: recentRows.map((r) => ({
      id: r.id,
      title: r.title,
      audience: r.audience,
      status: r.status,
      currentVersion: r.current_version,
      ownerName: r.owner_name ?? "Unknown",
      ownerId: r.owner_id,
      approvedBy: null,
      approvedAt: null,
      publishedAt: r.published_at?.toISOString() ?? null,
      supersedesId: null,
      createdAt: r.updated_at.toISOString(),
      updatedAt: r.updated_at.toISOString(),
    })),
  };
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd apps/web && npx tsc --noEmit --pretty 2>&1 | head -30`

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/workspaces/briefings.ts
git commit -m "feat(briefings): add API types and CRUD query functions"
```

---

## Task 15: Briefings Auth Helper & List/Create API

**Files:**
- Create: `apps/web/src/app/api/briefings/_helpers.ts`
- Create: `apps/web/src/app/api/briefings/route.ts`

- [ ] **Step 1: Create auth helper**

```typescript
// apps/web/src/app/api/briefings/_helpers.ts
import { requireSessionFromRequest } from "@/lib/auth";

export async function requireApiSession(request: Request) {
  try {
    return await requireSessionFromRequest(request);
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Create list/create route**

```typescript
// apps/web/src/app/api/briefings/route.ts
import { NextResponse } from "next/server";
import { queryRow } from "@/lib/db";
import { listBriefings } from "@/lib/workspaces/briefings";
import { requireApiSession } from "./_helpers";

export async function GET(request: Request) {
  const session = await requireApiSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? undefined;
  const audience = url.searchParams.get("audience") ?? undefined;
  const limit = Number(url.searchParams.get("limit") ?? 20);
  const offset = Number(url.searchParams.get("offset") ?? 0);

  const result = await listBriefings(session.tenantId, { status, audience, limit, offset });
  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const session = await requireApiSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as { title?: string; audience?: string };
  const title = body.title?.trim();
  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });

  // Create briefing
  const briefingRow = await queryRow<{ id: string; created_at: Date; updated_at: Date }>(
    session.tenantId,
    `
      INSERT INTO workflow.briefings (tenant_id, owner_id, title, audience, current_version)
      VALUES ($1, $2::uuid, $3, $4, 1)
      RETURNING id::text, created_at, updated_at
    `,
    [session.tenantId, session.sub, title, body.audience?.trim() || null],
  );

  // Create initial version with empty sections
  await queryRow(
    session.tenantId,
    `
      INSERT INTO workflow.briefing_versions (briefing_id, version_number, sections, edited_by)
      VALUES ($1::uuid, 1, $2, $3::uuid)
    `,
    [briefingRow!.id, JSON.stringify([]), session.sub],
  );

  return NextResponse.json(
    {
      id: briefingRow!.id,
      title,
      audience: body.audience?.trim() || null,
      status: "draft",
      currentVersion: 1,
      ownerName: session.sub,
      ownerId: session.sub,
      approvedBy: null,
      approvedAt: null,
      publishedAt: null,
      supersedesId: null,
      createdAt: briefingRow!.created_at.toISOString(),
      updatedAt: briefingRow!.updated_at.toISOString(),
    },
    { status: 201 },
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/briefings/_helpers.ts apps/web/src/app/api/briefings/route.ts
git commit -m "feat(briefings): add auth helper and list/create API"
```

---

## Task 16: Briefing Detail, Update & Status Transition

**Files:**
- Create: `apps/web/src/app/api/briefings/[briefingId]/route.ts`

- [ ] **Step 1: Create detail/update route with state machine**

```typescript
// apps/web/src/app/api/briefings/[briefingId]/route.ts
import { NextResponse } from "next/server";
import { queryRow } from "@/lib/db";
import { getBriefing } from "@/lib/workspaces/briefings";
import { requireApiSession } from "../_helpers";

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ["under_review"],
  under_review: ["draft"],
  approved: ["draft"],
  published: ["superseded", "withdrawn"],
  superseded: [],
  withdrawn: [],
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ briefingId: string }> },
) {
  const session = await requireApiSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { briefingId } = await params;
  const briefing = await getBriefing(session.tenantId, briefingId);
  if (!briefing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(briefing);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ briefingId: string }> },
) {
  const session = await requireApiSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { briefingId } = await params;
  const body = (await request.json()) as {
    title?: string;
    audience?: string;
    status?: string;
  };

  if (body.status) {
    const current = await queryRow<{ status: string }>(
      session.tenantId,
      "SELECT status FROM workflow.briefings WHERE tenant_id = $1 AND id = $2::uuid",
      [session.tenantId, briefingId],
    );
    if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const allowed = VALID_TRANSITIONS[current.status] ?? [];
    if (!allowed.includes(body.status)) {
      return NextResponse.json(
        { error: `Cannot transition from '${current.status}' to '${body.status}'` },
        { status: 422 },
      );
    }
  }

  const setClauses: string[] = ["updated_at = now()"];
  const values: unknown[] = [session.tenantId, briefingId];
  let paramIdx = 3;

  if (body.title !== undefined) {
    setClauses.push(`title = $${paramIdx}`);
    values.push(body.title.trim());
    paramIdx++;
  }
  if (body.audience !== undefined) {
    setClauses.push(`audience = $${paramIdx}`);
    values.push(body.audience.trim() || null);
    paramIdx++;
  }
  if (body.status) {
    setClauses.push(`status = $${paramIdx}`);
    values.push(body.status);
    paramIdx++;
  }

  await queryRow(
    session.tenantId,
    `
      UPDATE workflow.briefings
      SET ${setClauses.join(", ")}
      WHERE tenant_id = $1 AND id = $2::uuid
    `,
    values,
  );

  const updated = await getBriefing(session.tenantId, briefingId);
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(updated);
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/api/briefings/[briefingId]/route.ts
git commit -m "feat(briefings): add detail, update, and status transition API"
```

---

## Task 17: Briefing Versions API

**Files:**
- Create: `apps/web/src/app/api/briefings/[briefingId]/versions/route.ts`

- [ ] **Step 1: Create versions route**

```typescript
// apps/web/src/app/api/briefings/[briefingId]/versions/route.ts
import { NextResponse } from "next/server";
import { queryRow } from "@/lib/db";
import { listBriefingVersions } from "@/lib/workspaces/briefings";
import { requireApiSession } from "../../_helpers";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ briefingId: string }> },
) {
  const session = await requireApiSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { briefingId } = await params;
  const items = await listBriefingVersions(session.tenantId, briefingId);
  return NextResponse.json({ items });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ briefingId: string }> },
) {
  const session = await requireApiSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { briefingId } = await params;
  const body = (await request.json()) as {
    sections?: Array<{ title: string; body: string }>;
    sourceInvestigationIds?: string[];
    sourceEventIds?: string[];
    sourceWatchlistIds?: string[];
    aiDraftModel?: string;
  };

  if (!body.sections || !Array.isArray(body.sections)) {
    return NextResponse.json({ error: "sections is required and must be an array" }, { status: 400 });
  }

  // Get current version number
  const current = await queryRow<{ current_version: number }>(
    session.tenantId,
    "SELECT current_version FROM workflow.briefings WHERE tenant_id = $1 AND id = $2::uuid",
    [session.tenantId, briefingId],
  );
  if (!current) return NextResponse.json({ error: "Briefing not found" }, { status: 404 });

  const nextVersion = current.current_version + 1;

  // Create new version
  const row = await queryRow<{ id: string; created_at: Date }>(
    session.tenantId,
    `
      INSERT INTO workflow.briefing_versions (
        briefing_id, version_number, sections,
        source_investigation_ids, source_event_ids, source_watchlist_ids,
        ai_draft_model, edited_by
      )
      VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8::uuid)
      RETURNING id::text, created_at
    `,
    [
      briefingId,
      nextVersion,
      JSON.stringify(body.sections),
      body.sourceInvestigationIds ?? [],
      body.sourceEventIds ?? [],
      body.sourceWatchlistIds ?? [],
      body.aiDraftModel?.trim() || null,
      session.sub,
    ],
  );

  // Bump current_version on briefing
  await queryRow(
    session.tenantId,
    "UPDATE workflow.briefings SET current_version = $3, updated_at = now() WHERE tenant_id = $1 AND id = $2::uuid",
    [session.tenantId, briefingId, nextVersion],
  );

  return NextResponse.json(
    {
      id: row!.id,
      versionNumber: nextVersion,
      sections: body.sections,
      sourceInvestigationIds: body.sourceInvestigationIds ?? [],
      sourceEventIds: body.sourceEventIds ?? [],
      sourceWatchlistIds: body.sourceWatchlistIds ?? [],
      aiDraftModel: body.aiDraftModel?.trim() || null,
      editedBy: session.sub,
      editedByName: session.sub,
      createdAt: row!.created_at.toISOString(),
    },
    { status: 201 },
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/api/briefings/[briefingId]/versions/route.ts
git commit -m "feat(briefings): add versions list and create API"
```

---

## Task 18: Briefing Approve, Publish & Supersede APIs

**Files:**
- Create: `apps/web/src/app/api/briefings/[briefingId]/approve/route.ts`
- Create: `apps/web/src/app/api/briefings/[briefingId]/publish/route.ts`
- Create: `apps/web/src/app/api/briefings/[briefingId]/supersede/route.ts`

- [ ] **Step 1: Create approve route**

```typescript
// apps/web/src/app/api/briefings/[briefingId]/approve/route.ts
import { NextResponse } from "next/server";
import { queryRow } from "@/lib/db";
import { getBriefing } from "@/lib/workspaces/briefings";
import { requireApiSession } from "../../_helpers";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ briefingId: string }> },
) {
  const session = await requireApiSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { briefingId } = await params;

  const current = await queryRow<{ status: string }>(
    session.tenantId,
    "SELECT status FROM workflow.briefings WHERE tenant_id = $1 AND id = $2::uuid",
    [session.tenantId, briefingId],
  );
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (current.status !== "under_review") {
    return NextResponse.json(
      { error: `Cannot approve: briefing status is '${current.status}', expected 'under_review'` },
      { status: 422 },
    );
  }

  await queryRow(
    session.tenantId,
    `
      UPDATE workflow.briefings
      SET status = 'approved', approved_by = $3::uuid, approved_at = now(), updated_at = now()
      WHERE tenant_id = $1 AND id = $2::uuid
    `,
    [session.tenantId, briefingId, session.sub],
  );

  const updated = await getBriefing(session.tenantId, briefingId);
  return NextResponse.json(updated);
}
```

- [ ] **Step 2: Create publish route**

```typescript
// apps/web/src/app/api/briefings/[briefingId]/publish/route.ts
import { NextResponse } from "next/server";
import { queryRow } from "@/lib/db";
import { getBriefing } from "@/lib/workspaces/briefings";
import { requireApiSession } from "../../_helpers";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ briefingId: string }> },
) {
  const session = await requireApiSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { briefingId } = await params;

  const current = await queryRow<{ status: string }>(
    session.tenantId,
    "SELECT status FROM workflow.briefings WHERE tenant_id = $1 AND id = $2::uuid",
    [session.tenantId, briefingId],
  );
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (current.status !== "approved") {
    return NextResponse.json(
      { error: `Cannot publish: briefing status is '${current.status}', expected 'approved'` },
      { status: 422 },
    );
  }

  await queryRow(
    session.tenantId,
    `
      UPDATE workflow.briefings
      SET status = 'published', published_at = now(), updated_at = now()
      WHERE tenant_id = $1 AND id = $2::uuid
    `,
    [session.tenantId, briefingId],
  );

  const updated = await getBriefing(session.tenantId, briefingId);
  return NextResponse.json(updated);
}
```

- [ ] **Step 3: Create supersede route**

```typescript
// apps/web/src/app/api/briefings/[briefingId]/supersede/route.ts
import { NextResponse } from "next/server";
import { queryRow } from "@/lib/db";
import { getBriefing } from "@/lib/workspaces/briefings";
import { requireApiSession } from "../../_helpers";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ briefingId: string }> },
) {
  const session = await requireApiSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { briefingId } = await params;

  const current = await queryRow<{ status: string; current_version: number }>(
    session.tenantId,
    "SELECT status, current_version FROM workflow.briefings WHERE tenant_id = $1 AND id = $2::uuid",
    [session.tenantId, briefingId],
  );
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (current.status !== "published") {
    return NextResponse.json(
      { error: `Cannot supersede: briefing status is '${current.status}', expected 'published'` },
      { status: 422 },
    );
  }

  // Get current version sections to copy
  const currentVersion = await queryRow<{ sections: unknown }>(
    session.tenantId,
    "SELECT sections FROM workflow.briefing_versions WHERE briefing_id = $1::uuid AND version_number = $2",
    [briefingId, current.current_version],
  );

  // Mark old briefing as superseded
  await queryRow(
    session.tenantId,
    "UPDATE workflow.briefings SET status = 'superseded', updated_at = now() WHERE tenant_id = $1 AND id = $2::uuid",
    [session.tenantId, briefingId],
  );

  // Get old briefing details for copying
  const oldBriefing = await getBriefing(session.tenantId, briefingId);

  // Create new briefing as draft
  const newRow = await queryRow<{ id: string; created_at: Date; updated_at: Date }>(
    session.tenantId,
    `
      INSERT INTO workflow.briefings (tenant_id, owner_id, title, audience, current_version, supersedes_id)
      VALUES ($1, $2::uuid, $3, $4, 1, $5::uuid)
      RETURNING id::text, created_at, updated_at
    `,
    [session.tenantId, session.sub, oldBriefing?.title ?? "Untitled", oldBriefing?.audience ?? null, briefingId],
  );

  // Copy sections into version 1 of the new briefing
  await queryRow(
    session.tenantId,
    `
      INSERT INTO workflow.briefing_versions (briefing_id, version_number, sections, edited_by)
      VALUES ($1::uuid, 1, $2, $3::uuid)
    `,
    [newRow!.id, JSON.stringify(currentVersion?.sections ?? []), session.sub],
  );

  return NextResponse.json(
    {
      id: newRow!.id,
      title: oldBriefing?.title ?? "Untitled",
      audience: oldBriefing?.audience ?? null,
      status: "draft",
      currentVersion: 1,
      ownerName: session.sub,
      ownerId: session.sub,
      approvedBy: null,
      approvedAt: null,
      publishedAt: null,
      supersedesId: briefingId,
      createdAt: newRow!.created_at.toISOString(),
      updatedAt: newRow!.updated_at.toISOString(),
    },
    { status: 201 },
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/api/briefings/[briefingId]/approve/ apps/web/src/app/api/briefings/[briefingId]/publish/ apps/web/src/app/api/briefings/[briefingId]/supersede/
git commit -m "feat(briefings): add approve, publish, and supersede APIs"
```

---

## Task 19: Briefing Metrics API

**Files:**
- Create: `apps/web/src/app/api/briefings/metrics/route.ts`

- [ ] **Step 1: Create metrics route**

```typescript
// apps/web/src/app/api/briefings/metrics/route.ts
import { NextResponse } from "next/server";
import { getBriefingMetrics } from "@/lib/workspaces/briefings";
import { requireApiSession } from "../_helpers";

export async function GET(request: Request) {
  const session = await requireApiSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const metrics = await getBriefingMetrics(session.tenantId);
  return NextResponse.json(metrics);
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/api/briefings/metrics/route.ts
git commit -m "feat(briefings): add metrics API route"
```

---

## Task 20: Briefings Client SDK

**Files:**
- Create: `apps/web/src/lib/workspaces/briefings-client.ts`

- [ ] **Step 1: Create the typed fetch client**

```typescript
// apps/web/src/lib/workspaces/briefings-client.ts
"use client";

import type {
  BriefingSummary,
  BriefingDetail,
  BriefingVersion,
  BriefingMetrics,
  BriefingSection,
} from "./briefings";

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, credentials: "include" });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function fetchBriefings(options?: { status?: string; audience?: string; limit?: number; offset?: number }) {
  const params = new URLSearchParams();
  if (options?.status) params.set("status", options.status);
  if (options?.audience) params.set("audience", options.audience);
  if (options?.limit) params.set("limit", String(options.limit));
  if (options?.offset) params.set("offset", String(options.offset));
  const qs = params.toString();
  return apiFetch<{ items: BriefingSummary[]; total: number }>(`/api/briefings${qs ? `?${qs}` : ""}`);
}

export async function fetchBriefing(id: string) {
  return apiFetch<BriefingDetail>(`/api/briefings/${id}`);
}

export async function createBriefing(body: { title: string; audience?: string }) {
  return apiFetch<BriefingSummary>("/api/briefings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function updateBriefing(id: string, body: { title?: string; audience?: string; status?: string }) {
  return apiFetch<BriefingDetail>(`/api/briefings/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function fetchBriefingVersions(id: string) {
  return apiFetch<{ items: BriefingVersion[] }>(`/api/briefings/${id}/versions`);
}

export async function createBriefingVersion(
  id: string,
  body: {
    sections: BriefingSection[];
    sourceInvestigationIds?: string[];
    sourceEventIds?: string[];
    sourceWatchlistIds?: string[];
    aiDraftModel?: string;
  },
) {
  return apiFetch<BriefingVersion>(`/api/briefings/${id}/versions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function approveBriefing(id: string) {
  return apiFetch<BriefingDetail>(`/api/briefings/${id}/approve`, { method: "POST" });
}

export async function publishBriefing(id: string) {
  return apiFetch<BriefingDetail>(`/api/briefings/${id}/publish`, { method: "POST" });
}

export async function supersedeBriefing(id: string) {
  return apiFetch<BriefingSummary>(`/api/briefings/${id}/supersede`, { method: "POST" });
}

export async function fetchBriefingMetrics() {
  return apiFetch<BriefingMetrics>("/api/briefings/metrics");
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/lib/workspaces/briefings-client.ts
git commit -m "feat(briefings): add typed client SDK"
```

---

## Task 21: Briefings Zustand Store

**Files:**
- Create: `apps/web/src/stores/briefings-store.ts`

- [ ] **Step 1: Create the store**

```typescript
// apps/web/src/stores/briefings-store.ts
"use client";

import { create } from "zustand";
import type {
  BriefingSummary,
  BriefingVersion,
  BriefingSection,
} from "@/lib/workspaces/briefings";

type ActiveTab = "editorial" | "versions" | "lineage";

type BriefingsState = {
  briefings: BriefingSummary[];
  selectedBriefingId: string | null;
  activeTab: ActiveTab;
  versions: BriefingVersion[];
  editingSections: BriefingSection[];
  isDirty: boolean;
  statusFilter: string | null;
  isCreatingBriefing: boolean;
  isSavingVersion: boolean;

  hydrate: (briefings: BriefingSummary[]) => void;
  selectBriefing: (briefingId: string | null) => void;
  setActiveTab: (tab: ActiveTab) => void;
  setVersions: (versions: BriefingVersion[]) => void;
  setEditingSections: (sections: BriefingSection[]) => void;
  markDirty: () => void;
  markClean: () => void;
  setStatusFilter: (status: string | null) => void;
  addBriefing: (briefing: BriefingSummary) => void;
  addVersion: (version: BriefingVersion) => void;
  patchBriefing: (briefingId: string, patch: Partial<BriefingSummary>) => void;
  setIsCreatingBriefing: (v: boolean) => void;
  setIsSavingVersion: (v: boolean) => void;
};

export const useBriefingsStore = create<BriefingsState>((set) => ({
  briefings: [],
  selectedBriefingId: null,
  activeTab: "editorial",
  versions: [],
  editingSections: [],
  isDirty: false,
  statusFilter: null,
  isCreatingBriefing: false,
  isSavingVersion: false,

  hydrate: (briefings) =>
    set({
      briefings,
      selectedBriefingId: briefings[0]?.id ?? null,
    }),

  selectBriefing: (selectedBriefingId) =>
    set({ selectedBriefingId, activeTab: "editorial", versions: [], editingSections: [], isDirty: false }),

  setActiveTab: (activeTab) => set({ activeTab }),
  setVersions: (versions) => set({ versions }),

  setEditingSections: (editingSections) => set({ editingSections, isDirty: true }),

  markDirty: () => set({ isDirty: true }),
  markClean: () => set({ isDirty: false }),
  setStatusFilter: (statusFilter) => set({ statusFilter }),

  addBriefing: (briefing) =>
    set((state) => ({
      briefings: [briefing, ...state.briefings],
      selectedBriefingId: briefing.id,
      isCreatingBriefing: false,
    })),

  addVersion: (version) =>
    set((state) => ({
      versions: [version, ...state.versions],
      isDirty: false,
      isSavingVersion: false,
    })),

  patchBriefing: (briefingId, patch) =>
    set((state) => ({
      briefings: state.briefings.map((b) => (b.id === briefingId ? { ...b, ...patch } : b)),
    })),

  setIsCreatingBriefing: (isCreatingBriefing) => set({ isCreatingBriefing }),
  setIsSavingVersion: (isSavingVersion) => set({ isSavingVersion }),
}));
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/stores/briefings-store.ts
git commit -m "feat(briefings): add Zustand store"
```

---

## Task 22: Briefings Interactive Workspace — Library Panel

**Files:**
- Create: `apps/web/src/features/briefings/library-panel.tsx`

- [ ] **Step 1: Create the library panel**

```tsx
// apps/web/src/features/briefings/library-panel.tsx
"use client";

import { useState } from "react";
import { useBriefingsStore } from "@/stores/briefings-store";
import { createBriefing } from "@/lib/workspaces/briefings-client";

const STATUS_OPTIONS = ["all", "draft", "under_review", "approved", "published", "superseded", "withdrawn"] as const;

export function LibraryPanel() {
  const {
    briefings,
    selectedBriefingId,
    statusFilter,
    isCreatingBriefing,
    selectBriefing,
    setStatusFilter,
    setIsCreatingBriefing,
    addBriefing,
  } = useBriefingsStore();

  const [newTitle, setNewTitle] = useState("");
  const [newAudience, setNewAudience] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!newTitle.trim()) return;
    setSaving(true);
    try {
      const created = await createBriefing({
        title: newTitle.trim(),
        audience: newAudience.trim() || undefined,
      });
      addBriefing(created);
      setNewTitle("");
      setNewAudience("");
    } finally {
      setSaving(false);
    }
  }

  const filtered = statusFilter
    ? briefings.filter((b) => b.status === statusFilter)
    : briefings;

  return (
    <aside className="panel panel--muted">
      <div className="section-heading section-heading--row">
        <p className="eyebrow">Library</p>
        <button
          className="pill pill--primary"
          onClick={() => setIsCreatingBriefing(!isCreatingBriefing)}
        >
          {isCreatingBriefing ? "Cancel" : "+ New"}
        </button>
      </div>

      <select
        className="command-bar__input"
        value={statusFilter ?? "all"}
        onChange={(e) => setStatusFilter(e.target.value === "all" ? null : e.target.value)}
        style={{ marginBottom: "0.75rem" }}
      >
        {STATUS_OPTIONS.map((s) => (
          <option key={s} value={s}>
            {s === "all" ? "All statuses" : s.replace("_", " ")}
          </option>
        ))}
      </select>

      {isCreatingBriefing && (
        <div className="panel panel--glass" style={{ marginBottom: "0.75rem" }}>
          <input
            className="command-bar__input"
            placeholder="Briefing title"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
          <input
            className="command-bar__input"
            placeholder="Audience (optional)"
            value={newAudience}
            onChange={(e) => setNewAudience(e.target.value)}
            style={{ marginTop: "0.5rem" }}
          />
          <button
            className="pill pill--primary"
            onClick={handleCreate}
            disabled={saving || !newTitle.trim()}
            style={{ marginTop: "0.5rem" }}
          >
            {saving ? "Creating..." : "Create"}
          </button>
        </div>
      )}

      <div className="list-stack">
        {filtered.map((b) => (
          <div
            key={b.id}
            className={`feed-card${b.id === selectedBriefingId ? " is-active" : ""}`}
            onClick={() => selectBriefing(b.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && selectBriefing(b.id)}
          >
            <div className="feed-card__meta">
              <span className="pill">{b.status.replace("_", " ")}</span>
              {b.audience && <span className="pill pill--accent">{b.audience}</span>}
            </div>
            <strong>{b.title}</strong>
            <p className="text--muted">v{b.currentVersion} &middot; {b.updatedAt}</p>
          </div>
        ))}
        {filtered.length === 0 && <p className="text--muted">No briefings found.</p>}
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/features/briefings/library-panel.tsx
git commit -m "feat(briefings): add library panel component"
```

---

## Task 23: Briefings Interactive Workspace — Editorial Surface

**Files:**
- Create: `apps/web/src/features/briefings/editorial-surface.tsx`

- [ ] **Step 1: Create the tabbed editorial surface**

```tsx
// apps/web/src/features/briefings/editorial-surface.tsx
"use client";

import { useEffect, useState } from "react";
import { useBriefingsStore } from "@/stores/briefings-store";
import {
  fetchBriefing,
  fetchBriefingVersions,
  createBriefingVersion,
  updateBriefing,
  approveBriefing,
  publishBriefing,
  supersedeBriefing,
} from "@/lib/workspaces/briefings-client";
import type { BriefingSection, BriefingVersion } from "@/lib/workspaces/briefings";

const TABS = ["editorial", "versions", "lineage"] as const;

const STATUS_ACTIONS: Record<string, { label: string; handler: string }[]> = {
  draft: [{ label: "Submit for Review", handler: "under_review" }],
  under_review: [{ label: "Approve", handler: "approve" }],
  approved: [{ label: "Publish", handler: "publish" }],
  published: [{ label: "Supersede", handler: "supersede" }],
};

export function EditorialSurface() {
  const {
    briefings,
    selectedBriefingId,
    activeTab,
    versions,
    editingSections,
    isDirty,
    isSavingVersion,
    setActiveTab,
    setVersions,
    setEditingSections,
    addVersion,
    patchBriefing,
    addBriefing,
    setIsSavingVersion,
  } = useBriefingsStore();

  const selected = briefings.find((b) => b.id === selectedBriefingId) ?? null;

  // Load sections and versions when selection changes
  useEffect(() => {
    if (!selectedBriefingId) return;
    fetchBriefing(selectedBriefingId).then((detail) => {
      setEditingSections(detail.sections);
      // Mark clean since we just loaded
      useBriefingsStore.setState({ isDirty: false });
    });
    fetchBriefingVersions(selectedBriefingId).then((r) => setVersions(r.items));
  }, [selectedBriefingId, setEditingSections, setVersions]);

  if (!selected) {
    return (
      <article className="panel panel--document">
        <p className="text--muted">Select a briefing from the library.</p>
      </article>
    );
  }

  async function handleStatusAction(handler: string) {
    if (!selectedBriefingId) return;
    if (handler === "approve") {
      const updated = await approveBriefing(selectedBriefingId);
      patchBriefing(selectedBriefingId, updated);
    } else if (handler === "publish") {
      const updated = await publishBriefing(selectedBriefingId);
      patchBriefing(selectedBriefingId, updated);
    } else if (handler === "supersede") {
      const newBriefing = await supersedeBriefing(selectedBriefingId);
      patchBriefing(selectedBriefingId, { status: "superseded" });
      addBriefing(newBriefing);
    } else {
      const updated = await updateBriefing(selectedBriefingId, { status: handler });
      patchBriefing(selectedBriefingId, updated);
    }
  }

  async function handleSaveVersion() {
    if (!selectedBriefingId) return;
    setIsSavingVersion(true);
    try {
      const version = await createBriefingVersion(selectedBriefingId, { sections: editingSections });
      addVersion(version);
      patchBriefing(selectedBriefingId, { currentVersion: version.versionNumber });
    } finally {
      setIsSavingVersion(false);
    }
  }

  const actions = STATUS_ACTIONS[selected.status] ?? [];

  return (
    <article className="panel panel--document editorial-surface">
      <div className="tab-bar" style={{ marginBottom: "1rem" }}>
        {TABS.map((tab) => (
          <button
            key={tab}
            className={`pill${activeTab === tab ? " pill--primary" : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "editorial" && (
        <>
          <h1 className="hero-title">{selected.title}</h1>
          {actions.length > 0 && (
            <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
              {actions.map((a) => (
                <button key={a.handler} className="pill pill--primary" onClick={() => handleStatusAction(a.handler)}>
                  {a.label}
                </button>
              ))}
            </div>
          )}

          <SectionEditor sections={editingSections} onChange={setEditingSections} />

          <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem", alignItems: "center" }}>
            <button
              className="pill pill--primary"
              onClick={handleSaveVersion}
              disabled={isSavingVersion || !isDirty}
            >
              {isSavingVersion ? "Saving..." : "Save Version"}
            </button>
            {isDirty && <span className="text--muted">Unsaved changes</span>}
          </div>
        </>
      )}

      {activeTab === "versions" && <VersionsTab versions={versions} />}
      {activeTab === "lineage" && <LineageTab briefingId={selectedBriefingId!} />}
    </article>
  );
}

function SectionEditor({
  sections,
  onChange,
}: {
  sections: BriefingSection[];
  onChange: (sections: BriefingSection[]) => void;
}) {
  function updateSection(idx: number, field: "title" | "body", value: string) {
    const updated = sections.map((s, i) => (i === idx ? { ...s, [field]: value } : s));
    onChange(updated);
  }

  function addSection() {
    onChange([...sections, { title: "", body: "" }]);
  }

  function removeSection(idx: number) {
    onChange(sections.filter((_, i) => i !== idx));
  }

  function moveSection(idx: number, direction: -1 | 1) {
    const target = idx + direction;
    if (target < 0 || target >= sections.length) return;
    const updated = [...sections];
    [updated[idx], updated[target]] = [updated[target], updated[idx]];
    onChange(updated);
  }

  return (
    <div className="story-sections">
      {sections.map((section, idx) => (
        <div key={idx} className="panel panel--muted" style={{ marginBottom: "0.75rem" }}>
          <div className="section-heading section-heading--row">
            <span className="eyebrow">Section {idx + 1}</span>
            <div style={{ display: "flex", gap: "0.25rem" }}>
              <button className="pill" onClick={() => moveSection(idx, -1)} disabled={idx === 0}>Up</button>
              <button className="pill" onClick={() => moveSection(idx, 1)} disabled={idx === sections.length - 1}>Down</button>
              <button className="pill pill--danger" onClick={() => removeSection(idx)}>Remove</button>
            </div>
          </div>
          <input
            className="command-bar__input"
            placeholder="Section title"
            value={section.title}
            onChange={(e) => updateSection(idx, "title", e.target.value)}
          />
          <textarea
            className="command-bar__input"
            placeholder="Section body"
            value={section.body}
            onChange={(e) => updateSection(idx, "body", e.target.value)}
            rows={4}
            style={{ marginTop: "0.5rem" }}
          />
        </div>
      ))}
      <button className="pill pill--primary" onClick={addSection}>+ Add Section</button>
    </div>
  );
}

function VersionsTab({ versions }: { versions: BriefingVersion[] }) {
  const [viewing, setViewing] = useState<BriefingVersion | null>(null);

  return (
    <>
      <p className="eyebrow">Version History ({versions.length})</p>
      {viewing && (
        <div className="panel panel--glass" style={{ marginBottom: "1rem" }}>
          <div className="section-heading section-heading--row">
            <p className="eyebrow">Version {viewing.versionNumber}</p>
            <button className="pill" onClick={() => setViewing(null)}>Close</button>
          </div>
          {viewing.sections.map((s, idx) => (
            <div key={idx} className="note-card" style={{ marginBottom: "0.5rem" }}>
              <strong>{s.title}</strong>
              <p>{s.body}</p>
            </div>
          ))}
        </div>
      )}
      <div className="list-stack">
        {versions.map((v) => (
          <div
            key={v.id}
            className="feed-card"
            onClick={() => setViewing(v)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && setViewing(v)}
          >
            <div className="feed-card__meta">
              <span className="pill pill--primary">v{v.versionNumber}</span>
              <span>{v.sections.length} sections</span>
            </div>
            <p>Edited by {v.editedByName} &middot; {v.createdAt}</p>
          </div>
        ))}
        {versions.length === 0 && <p className="text--muted">No versions yet.</p>}
      </div>
    </>
  );
}

function LineageTab({ briefingId }: { briefingId: string }) {
  const [detail, setDetail] = useState<{
    sourceInvestigationIds: string[];
    sourceEventIds: string[];
    sourceWatchlistIds: string[];
  } | null>(null);

  useEffect(() => {
    fetchBriefing(briefingId).then((d) =>
      setDetail({
        sourceInvestigationIds: d.sourceInvestigationIds,
        sourceEventIds: d.sourceEventIds,
        sourceWatchlistIds: d.sourceWatchlistIds,
      }),
    );
  }, [briefingId]);

  if (!detail) return <p className="text--muted">Loading lineage...</p>;

  return (
    <>
      <p className="eyebrow">Source Lineage</p>

      <section className="panel panel--muted" style={{ marginBottom: "0.75rem" }}>
        <p className="eyebrow">Investigations ({detail.sourceInvestigationIds.length})</p>
        {detail.sourceInvestigationIds.length > 0 ? (
          <ul className="timeline-list">
            {detail.sourceInvestigationIds.map((id) => (
              <li key={id}><a href={`/investigations?case=${id}`}>{id.slice(0, 8).toUpperCase()}</a></li>
            ))}
          </ul>
        ) : (
          <p className="text--muted">No linked investigations.</p>
        )}
      </section>

      <section className="panel panel--muted" style={{ marginBottom: "0.75rem" }}>
        <p className="eyebrow">Events ({detail.sourceEventIds.length})</p>
        {detail.sourceEventIds.length > 0 ? (
          <ul className="timeline-list">
            {detail.sourceEventIds.map((id) => (
              <li key={id}><a href={`/pulseboard?event=${id}`}>{id.slice(0, 8).toUpperCase()}</a></li>
            ))}
          </ul>
        ) : (
          <p className="text--muted">No linked events.</p>
        )}
      </section>

      <section className="panel panel--muted">
        <p className="eyebrow">Watchlists ({detail.sourceWatchlistIds.length})</p>
        {detail.sourceWatchlistIds.length > 0 ? (
          <ul className="timeline-list">
            {detail.sourceWatchlistIds.map((id) => (
              <li key={id}><a href={`/watchlists?list=${id}`}>{id.slice(0, 8).toUpperCase()}</a></li>
            ))}
          </ul>
        ) : (
          <p className="text--muted">No linked watchlists.</p>
        )}
      </section>
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/features/briefings/editorial-surface.tsx
git commit -m "feat(briefings): add editorial surface with section editor, versions, and lineage"
```

---

## Task 24: Briefings Interactive Workspace — AI Rail & Orchestrator

**Files:**
- Create: `apps/web/src/features/briefings/briefing-ai-rail.tsx`
- Create: `apps/web/src/features/briefings/briefings-workspace.tsx`

- [ ] **Step 1: Create the briefing AI rail**

```tsx
// apps/web/src/features/briefings/briefing-ai-rail.tsx
"use client";

import { useBriefingsStore } from "@/stores/briefings-store";

export function BriefingAiRail() {
  const { briefings, selectedBriefingId } = useBriefingsStore();
  const selected = briefings.find((b) => b.id === selectedBriefingId) ?? null;

  if (!selected) {
    return (
      <aside className="panel">
        <p className="eyebrow">Briefing AI Rail</p>
        <p className="text--muted">Select a briefing to view signals.</p>
      </aside>
    );
  }

  const signals: string[] = [];

  // Approval status
  if (selected.approvedBy) {
    signals.push(`Approved by ${selected.approvedBy} on ${selected.approvedAt}`);
  } else if (selected.status === "under_review") {
    signals.push("Pending approval — awaiting reviewer action.");
  } else {
    signals.push("Not yet submitted for approval.");
  }

  // Publication status
  if (selected.publishedAt) {
    signals.push(`Published on ${selected.publishedAt}`);
  } else {
    signals.push("Unpublished.");
  }

  // Supersedence warning
  if (selected.status === "published") {
    signals.push("Published briefings should be reviewed for supersedence on the next editorial cycle.");
  }

  return (
    <aside className="panel">
      <p className="eyebrow">Briefing AI Rail</p>

      <div className="data-grid">
        <div className="data-point">
          <span>Status</span>
          <strong>{selected.status.replace("_", " ")}</strong>
        </div>
        <div className="data-point">
          <span>Version</span>
          <strong>v{selected.currentVersion}</strong>
        </div>
        <div className="data-point">
          <span>Audience</span>
          <strong>{selected.audience ?? "Unspecified"}</strong>
        </div>
        <div className="data-point">
          <span>Owner</span>
          <strong>{selected.ownerName}</strong>
        </div>
        <div className="data-point">
          <span>Updated</span>
          <strong>{selected.updatedAt}</strong>
        </div>
      </div>

      <div className="list-stack" style={{ marginTop: "1rem" }}>
        {signals.map((note) => (
          <div key={note} className="feed-card">
            <strong>Editorial signal</strong>
            <p>{note}</p>
          </div>
        ))}
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Create the interactive workspace orchestrator**

```tsx
// apps/web/src/features/briefings/briefings-workspace.tsx
"use client";

import { useEffect } from "react";
import type { BriefingsWorkspaceData } from "@/lib/workspaces/briefings";
import { useBriefingsStore } from "@/stores/briefings-store";
import { fetchBriefings } from "@/lib/workspaces/briefings-client";
import { LibraryPanel } from "./library-panel";
import { EditorialSurface } from "./editorial-surface";
import { BriefingAiRail } from "./briefing-ai-rail";

export function BriefingsInteractiveWorkspace({ data }: { data: BriefingsWorkspaceData }) {
  const hydrate = useBriefingsStore((s) => s.hydrate);

  useEffect(() => {
    // Hydrate from SSR data first
    const initial = data.briefings.map((b) => ({
      id: b.briefingId,
      title: b.title,
      audience: b.audience,
      status: b.status,
      currentVersion: b.currentVersion,
      ownerName: b.ownerName,
      ownerId: "",
      approvedBy: null,
      approvedAt: null,
      publishedAt: b.publishedAt,
      supersedesId: null,
      createdAt: b.updatedAt ?? new Date().toISOString(),
      updatedAt: b.updatedAt ?? new Date().toISOString(),
    }));
    hydrate(initial);

    // Then fetch fresh API data
    fetchBriefings({ limit: 50 }).then((r) => {
      if (r.items.length > 0) hydrate(r.items);
    });
  }, [data.briefings, hydrate]);

  return (
    <section className="workspace-screen">
      <div className="workspace-columns workspace-columns--three briefings-layout">
        <LibraryPanel />
        <EditorialSurface />
        <BriefingAiRail />
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/briefings/briefing-ai-rail.tsx apps/web/src/features/briefings/briefings-workspace.tsx
git commit -m "feat(briefings): add AI rail and workspace orchestrator"
```

---

## Task 25: Wire Briefings Page to Interactive Workspace

**Files:**
- Modify: `apps/web/src/app/(authenticated)/briefings/page.tsx`

- [ ] **Step 1: Update the page to use the interactive workspace**

Replace the entire contents of `apps/web/src/app/(authenticated)/briefings/page.tsx`:

```tsx
import { BriefingsInteractiveWorkspace } from "@/features/briefings/briefings-workspace";
import { getServerPrincipal } from "@/lib/server-session";
import { getBriefingsWorkspaceData } from "@/lib/workspaces/briefings";

export default async function BriefingsPage() {
  const session = await getServerPrincipal();
  const data = await getBriefingsWorkspaceData(session.tenantId);

  return <BriefingsInteractiveWorkspace data={data} />;
}
```

- [ ] **Step 2: Verify full TypeScript compilation**

Run: `cd apps/web && npx tsc --noEmit --pretty 2>&1 | head -50`

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/\(authenticated\)/briefings/page.tsx
git commit -m "feat(briefings): wire page to interactive workspace"
```

---

## Task 26: Final Build Verification & Phase 4A+4B Commit

- [ ] **Step 1: Run full Next.js build**

Run: `cd apps/web && npx next build 2>&1 | tail -30`

Fix any TypeScript or build errors that appear.

- [ ] **Step 2: Verify all new routes are recognized**

Run: `find apps/web/src/app/api/investigations apps/web/src/app/api/briefings -name 'route.ts' | sort`

Expected output:
```
apps/web/src/app/api/briefings/[briefingId]/approve/route.ts
apps/web/src/app/api/briefings/[briefingId]/publish/route.ts
apps/web/src/app/api/briefings/[briefingId]/route.ts
apps/web/src/app/api/briefings/[briefingId]/supersede/route.ts
apps/web/src/app/api/briefings/[briefingId]/versions/route.ts
apps/web/src/app/api/briefings/metrics/route.ts
apps/web/src/app/api/briefings/route.ts
apps/web/src/app/api/investigations/[investigationId]/custody/route.ts
apps/web/src/app/api/investigations/[investigationId]/evidence/[evidenceId]/route.ts
apps/web/src/app/api/investigations/[investigationId]/evidence/route.ts
apps/web/src/app/api/investigations/[investigationId]/items/route.ts
apps/web/src/app/api/investigations/[investigationId]/notes/route.ts
apps/web/src/app/api/investigations/[investigationId]/route.ts
apps/web/src/app/api/investigations/metrics/route.ts
apps/web/src/app/api/investigations/route.ts
```

- [ ] **Step 3: Create Phase 4A+4B completion document**

Create `PHASE_4AB_COMPLETE.md` at the project root summarizing what was built.

- [ ] **Step 4: Final commit**

```bash
git add PHASE_4AB_COMPLETE.md
git commit -m "feat: complete Phase 4A+4B — interactive Investigations & Briefings workspaces"
```
