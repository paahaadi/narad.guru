# Phase 4A+4B Design Specification — Investigations & Briefings Workspaces

**Date:** 2026-04-01
**Scope:** Interactive Investigations workspace (4A) + Interactive Briefings workspace (4B)
**Depends on:** Phases 1–3C complete. All database tables already exist.
**Deliverable:** All 7 NARAD V2 workspaces fully interactive with CRUD APIs, client stores, and status workflows.

---

## 1. Overview

Phases 4A and 4B complete the two remaining read-only workspaces — Investigations and Briefings — by adding REST APIs, Zustand stores, and interactive UI components. The existing database schema (5 investigation tables, 2 briefing tables) requires no migration changes. The implementation follows the Watchlists workspace pattern exactly: `requireApiSession` auth, state machine status transitions, typed SDK clients, and three-column interactive layouts.

### Architecture Approach

1. **API routes** — RESTful Next.js route handlers with JWT session auth
2. **Zustand stores** — Client-side state for selection, tabs, optimistic updates
3. **Interactive components** — Replace current read-only components with interactive versions
4. **State machines** — Status transitions enforced server-side with `VALID_TRANSITIONS` maps
5. **Analyst-driven workflow** — Manual evidence attachment and note creation with clean interfaces (`addEvidence`, `linkEntity`, `attachDocument`) that a future AI assistant (Phase 4D) can call

### Out of Scope

- LLM-powered draft generation for briefings (Phase 4D)
- Auto-suggested items for investigations (Phase 4D)
- Tier 3 source adapters (Phase 4C)
- Performance hardening, CDN, read replicas (Phase 4E)
- DPDPA compliance audit (Phase 4E)

---

## 2. File Structure

```
apps/web/src/
├── app/api/
│   ├── _shared/
│   │   └── auth.ts                          (extracted requireApiSession helper)
│   ├── investigations/
│   │   ├── route.ts                         (GET list, POST create)
│   │   ├── metrics/route.ts                 (GET workspace-level metrics)
│   │   └── [investigationId]/
│   │       ├── route.ts                     (GET detail, PATCH update/transition)
│   │       ├── items/route.ts               (GET list, POST attach)
│   │       ├── evidence/
│   │       │   ├── route.ts                 (GET list, POST attach)
│   │       │   └── [evidenceId]/route.ts    (PATCH verify)
│   │       ├── notes/route.ts               (GET list, POST create)
│   │       └── custody/route.ts             (GET custody log — read-only)
│   └── briefings/
│       ├── route.ts                         (GET list, POST create)
│       ├── metrics/route.ts                 (GET workspace-level metrics)
│       └── [briefingId]/
│           ├── route.ts                     (GET detail, PATCH update/transition)
│           ├── versions/route.ts            (GET list, POST create version)
│           ├── approve/route.ts             (POST approve)
│           ├── publish/route.ts             (POST publish)
│           └── supersede/route.ts           (POST supersede)
├── features/
│   ├── investigations/
│   │   ├── investigations-workspace.tsx     (interactive 3-column layout)
│   │   ├── investigations-store.ts          (Zustand store)
│   │   └── investigations-sdk.ts            (typed fetch client)
│   └── briefings/
│       ├── briefings-workspace.tsx           (interactive 3-column layout)
│       ├── briefings-store.ts               (Zustand store)
│       └── briefings-sdk.ts                 (typed fetch client)
```

---

## 3. Existing Database Schema (No Migrations Needed)

### 3.1 Investigation Tables (from `005_workflow_schema.sql`)

**workflow.investigations**

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, uuid_generate_v7() |
| tenant_id | UUID | FK → core.tenants, NOT NULL |
| owner_id | UUID | FK → core.users, NOT NULL |
| title | TEXT | NOT NULL |
| description | TEXT | |
| status | TEXT | DEFAULT 'draft', CHECK IN (draft, under_review, active, on_hold, closed, archived) |
| classification | TEXT | DEFAULT 'unclassified', CHECK IN (unclassified, restricted, confidential, secret) |
| confidence | NUMERIC(3,2) | |
| hypothesis | TEXT | |
| created_at | TIMESTAMPTZ | DEFAULT now() |
| updated_at | TIMESTAMPTZ | DEFAULT now() |

**workflow.investigation_items**

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| investigation_id | UUID | FK → investigations, CASCADE |
| item_type | TEXT | CHECK IN (event, entity, document, claim) |
| item_id | UUID | NOT NULL |
| role | TEXT | DEFAULT 'evidence', CHECK IN (key_evidence, supporting, context, lead, exculpatory, disputed) |
| added_by | UUID | FK → core.users |
| notes | TEXT | |
| created_at | TIMESTAMPTZ | |

**workflow.investigation_evidence**

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| investigation_id | UUID | FK → investigations, CASCADE |
| document_id | UUID | FK → core.documents |
| evidence_hash | TEXT | NOT NULL |
| s3_key_worm | TEXT | NOT NULL |
| is_verified | BOOLEAN | DEFAULT FALSE |
| verified_by | UUID | FK → core.users |
| verified_at | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ | |

**workflow.evidence_custody_log** (INSERT-only, trigger-enforced)

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| evidence_id | UUID | FK → investigation_evidence |
| user_id | UUID | FK → core.users |
| action | TEXT | CHECK IN (ingested, viewed, exported, verified, challenged, transferred) |
| evidence_hash_at_action | TEXT | NOT NULL |
| ip_address | INET | |
| created_at | TIMESTAMPTZ | |

**workflow.investigation_notes**

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| investigation_id | UUID | FK → investigations, CASCADE |
| author_id | UUID | FK → core.users |
| note_type | TEXT | DEFAULT 'note', CHECK IN (note, hypothesis, task, decision) |
| body | TEXT | NOT NULL |
| is_ai_generated | BOOLEAN | DEFAULT FALSE |
| verification_status | TEXT | DEFAULT 'unverified', CHECK IN (unverified, pending_review, accepted, rejected) |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### 3.2 Briefing Tables (from `005_workflow_schema.sql`)

**workflow.briefings**

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → core.tenants |
| owner_id | UUID | FK → core.users |
| title | TEXT | NOT NULL |
| audience | TEXT | |
| status | TEXT | DEFAULT 'draft', CHECK IN (draft, under_review, approved, published, superseded, withdrawn) |
| current_version | INTEGER | DEFAULT 1 |
| supersedes_id | UUID | FK → briefings (self-ref) |
| approved_by | UUID | FK → core.users |
| approved_at | TIMESTAMPTZ | |
| published_at | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

**workflow.briefing_versions**

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| briefing_id | UUID | FK → briefings, CASCADE |
| version_number | INTEGER | NOT NULL |
| sections | JSONB | NOT NULL |
| source_investigation_ids | UUID[] | DEFAULT '{}' |
| source_event_ids | UUID[] | DEFAULT '{}' |
| source_watchlist_ids | UUID[] | DEFAULT '{}' |
| ai_draft_model | TEXT | |
| edited_by | UUID | FK → core.users |
| created_at | TIMESTAMPTZ | |

---

## 4. Investigations Workspace (Phase 4A)

### 4.1 Status State Machine

```
draft → under_review → active → closed → archived
                  ↘      ↗
                on_hold
```

```typescript
const VALID_TRANSITIONS: Record<string, string[]> = {
  draft:        ["under_review"],
  under_review: ["active", "on_hold"],
  active:       ["on_hold", "closed"],
  on_hold:      ["active", "under_review"],
  closed:       ["archived"],
};
```

### 4.2 API Endpoints

#### GET `/api/investigations`

List investigations for tenant. Query params: `status` (filter), `limit` (default 20), `offset`.

Response: `{ items: InvestigationSummary[], total: number }`

#### POST `/api/investigations`

Create investigation. Body: `{ title, description?, classification?, hypothesis? }`. Owner set to current session user.

Response: `201` with created investigation.

#### GET `/api/investigations/:id`

Full case detail including counts (items, evidence, notes).

Response: `InvestigationDetail` with all fields plus aggregated counts.

#### PATCH `/api/investigations/:id`

Update fields or transition status. Body: `{ title?, description?, confidence?, hypothesis?, status? }`.

If `status` is provided, validates against `VALID_TRANSITIONS[current.status]`. Returns 422 on invalid transition.

#### GET `/api/investigations/:id/items`

List linked items. Query params: `item_type` (filter), `role` (filter).

Response: `{ items: InvestigationItem[] }`

#### POST `/api/investigations/:id/items`

Attach item. Body: `{ item_type, item_id, role?, notes? }`.

Validates: `item_type` is one of (event, entity, document, claim). `role` defaults to 'evidence'. `added_by` set from session.

#### GET `/api/investigations/:id/evidence`

List evidence documents with verification status.

Response: `{ items: EvidenceRecord[] }` where each record includes `is_verified`, `verified_by`, `verified_at`.

#### POST `/api/investigations/:id/evidence`

Attach evidence. Body: `{ document_id, evidence_hash, s3_key_worm }`.

After INSERT, logs `ingested` action to `evidence_custody_log` with evidence hash and client IP.

#### PATCH `/api/investigations/:id/evidence/:evidenceId`

Verify evidence. Body: `{ action: "verified" | "challenged" }`.

Sets `is_verified = true`, `verified_by`, `verified_at` (for verified action). Logs action to custody log.

#### GET `/api/investigations/:id/notes`

List notes. Query params: `note_type` (filter).

Response: `{ items: InvestigationNote[] }` ordered by `created_at DESC`.

#### POST `/api/investigations/:id/notes`

Create note. Body: `{ body, note_type? }`. Defaults to 'note'. `author_id` from session. `is_ai_generated` defaults to false (Phase 4D will set true).

#### GET `/api/investigations/:id/custody`

Read-only custody log for all evidence in the investigation. Joins through `investigation_evidence` to `evidence_custody_log`.

Response: `{ entries: CustodyEntry[] }` ordered by `created_at ASC` (chronological chain).

#### GET `/api/investigations/metrics`

Workspace-level stats.

Response: `{ byStatus: Record<string, number>, byClassification: Record<string, number>, totalEvidence: number, recentActivity: ActivityEntry[] }`

### 4.3 Evidence Chain-of-Custody

Every evidence interaction logs to `workflow.evidence_custody_log` automatically:

| Action | Trigger |
|--------|---------|
| `ingested` | POST evidence (attach document) |
| `viewed` | GET evidence detail (when individual evidence is fetched) |
| `verified` | PATCH evidence with action "verified" |
| `challenged` | PATCH evidence with action "challenged" |
| `exported` | Future: when evidence is exported |
| `transferred` | Future: when investigation ownership changes |

The custody log is **append-only** — no UPDATE/DELETE permitted. This is enforced by the dark archive protocol (role `narad_ingest_writer` has no DELETE on workflow tables).

### 4.4 Zustand Store

```typescript
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
```

### 4.5 SDK Client

```typescript
// investigations-sdk.ts — typed fetch wrappers
export const investigationsApi = {
  list:           (params?) => fetchJson<{ items: InvestigationSummary[]; total: number }>("/api/investigations", { params }),
  create:         (body)    => fetchJson<InvestigationSummary>("/api/investigations", { method: "POST", body }),
  get:            (id)      => fetchJson<InvestigationDetail>(`/api/investigations/${id}`),
  update:         (id, body)=> fetchJson<InvestigationDetail>(`/api/investigations/${id}`, { method: "PATCH", body }),
  listItems:      (id, params?) => fetchJson<{ items: InvestigationItem[] }>(`/api/investigations/${id}/items`, { params }),
  attachItem:     (id, body)    => fetchJson<InvestigationItem>(`/api/investigations/${id}/items`, { method: "POST", body }),
  listEvidence:   (id)          => fetchJson<{ items: EvidenceRecord[] }>(`/api/investigations/${id}/evidence`),
  attachEvidence: (id, body)    => fetchJson<EvidenceRecord>(`/api/investigations/${id}/evidence`, { method: "POST", body }),
  verifyEvidence: (id, eid, body) => fetchJson<EvidenceRecord>(`/api/investigations/${id}/evidence/${eid}`, { method: "PATCH", body }),
  listNotes:      (id, params?) => fetchJson<{ items: InvestigationNote[] }>(`/api/investigations/${id}/notes`, { params }),
  createNote:     (id, body)    => fetchJson<InvestigationNote>(`/api/investigations/${id}/notes`, { method: "POST", body }),
  getCustodyLog:  (id)          => fetchJson<{ entries: CustodyEntry[] }>(`/api/investigations/${id}/custody`),
  getMetrics:     ()            => fetchJson<InvestigationMetrics>("/api/investigations/metrics"),
};
```

### 4.6 Interactive UI Layout

**Left Panel — Case Directory**
- Status filter dropdown (all, draft, active, under_review, on_hold, closed, archived)
- Scrollable list of cases showing: 8-char ID prefix, title, status pill, classification badge, confidence indicator, updated date
- Click to select → loads detail in center
- "New Investigation" button opens inline creation form (title + classification)

**Center Panel — Case Detail (tabbed)**

- **Overview tab:** Hero display of title, description, hypothesis. Status workflow buttons (e.g., "Submit for Review" when draft, "Activate" when under_review). Editable fields: title, description, hypothesis, confidence (inline edit pattern).
- **Items tab:** Table of linked items grouped by type (events, entities, documents, claims). Each row shows: item type icon, item_id (truncated), role tag, notes, added_by, date. "Attach Item" form: item_type dropdown, item_id input, role selector, notes textarea.
- **Evidence tab:** List of evidence documents showing: document title, evidence_hash (truncated), verification status badge, verified_by, date. "Verify" / "Challenge" buttons per evidence. "Attach Evidence" form. Clicking an evidence row expands to show its custody chain inline.
- **Notes tab:** Chronological feed (newest first) of notes. Each note shows: type badge (note/hypothesis/task/decision), body, author, timestamp, verification_status for AI-generated notes. "Add Note" form: type selector, body textarea.
- **Timeline tab:** Merged chronological view pulling from items (attached), evidence (ingested/verified), notes (created), and status changes. Read-only. Rendered as a vertical timeline with timestamps and action descriptions.

**Right Panel — Case Integrity Rail**
- Status with colored indicator
- Classification badge
- Confidence (numeric or "pending")
- Owner name
- Item count, evidence count, note count
- Created date, last updated date
- All read-only, refreshes when case data changes

---

## 5. Briefings Workspace (Phase 4B)

### 5.1 Status State Machine

```
draft → under_review → approved → published → superseded
              ↓                               ↘ withdrawn
            draft (bounce back)
```

```typescript
const VALID_TRANSITIONS: Record<string, string[]> = {
  draft:        ["under_review"],
  under_review: ["approved", "draft"],
  approved:     ["published", "draft"],
  published:    ["superseded", "withdrawn"],
  superseded:   [],
  withdrawn:    [],
};
```

### 5.2 API Endpoints

#### GET `/api/briefings`

List briefings. Query params: `status` (filter), `audience` (filter), `limit` (default 20), `offset`.

Response: `{ items: BriefingSummary[], total: number }`

#### POST `/api/briefings`

Create briefing. Body: `{ title, audience? }`. Owner from session. Creates initial version (version 1) with empty sections.

Response: `201` with created briefing including version 1.

#### GET `/api/briefings/:id`

Full briefing detail with current version content (sections, source IDs).

Response: `BriefingDetail` including current version's sections and lineage.

#### PATCH `/api/briefings/:id`

Update fields or transition status. Body: `{ title?, audience?, status? }`.

Status transitions validated against `VALID_TRANSITIONS`. Returns 422 on invalid transition.

Special: transitioning to `approved` requires going through the `/approve` endpoint instead.

#### GET `/api/briefings/:id/versions`

List all versions. Ordered by `version_number DESC`.

Response: `{ items: BriefingVersion[] }`

#### POST `/api/briefings/:id/versions`

Create new version. Body: `{ sections, sourceInvestigationIds?, sourceEventIds?, sourceWatchlistIds?, aiDraftModel? }`.

Increments `current_version` on the briefing. Validates source IDs exist and belong to tenant.

Response: `201` with new version.

#### POST `/api/briefings/:id/approve`

Approve briefing. Requires current status = `under_review`. Sets `approved_by` to session user, `approved_at` to now, transitions status to `approved`.

Response: updated briefing.

#### POST `/api/briefings/:id/publish`

Publish briefing. Requires current status = `approved`. Sets `published_at` to now, transitions status to `published`.

Response: updated briefing.

#### POST `/api/briefings/:id/supersede`

Supersede a published briefing. Creates a new briefing as `draft` with `supersedes_id` pointing to the original. Copies current version's sections into the new briefing's version 1. Transitions the original to `superseded`.

Response: `201` with new draft briefing.

#### GET `/api/briefings/metrics`

Workspace stats.

Response: `{ byStatus: Record<string, number>, byAudience: Record<string, number>, totalVersions: number, recentPublications: BriefingSummary[] }`

### 5.3 Version Model

Each version is an **immutable snapshot**. Editing creates a new version rather than mutating:

```typescript
type BriefingSection = {
  title: string;
  body: string;
};

type BriefingVersion = {
  id: string;
  versionNumber: number;
  sections: BriefingSection[];
  sourceInvestigationIds: string[];
  sourceEventIds: string[];
  sourceWatchlistIds: string[];
  aiDraftModel: string | null;
  editedBy: string;
  createdAt: string;
};
```

The existing `normalizeSections` helper handles both array and record formats for backward compatibility. New versions always use the array format.

### 5.4 Source Lineage

Briefings track provenance through three UUID arrays per version:

- `source_investigation_ids` → links to `workflow.investigations`
- `source_event_ids` → links to `core.events`
- `source_watchlist_ids` → links to `workflow.watchlists`

The UI renders these as clickable cross-workspace links. The POST versions endpoint validates that referenced IDs exist and belong to the same tenant before accepting.

### 5.5 Zustand Store

```typescript
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
```

### 5.6 SDK Client

```typescript
// briefings-sdk.ts — typed fetch wrappers
export const briefingsApi = {
  list:          (params?) => fetchJson<{ items: BriefingSummary[]; total: number }>("/api/briefings", { params }),
  create:        (body)    => fetchJson<BriefingSummary>("/api/briefings", { method: "POST", body }),
  get:           (id)      => fetchJson<BriefingDetail>(`/api/briefings/${id}`),
  update:        (id, body)=> fetchJson<BriefingDetail>(`/api/briefings/${id}`, { method: "PATCH", body }),
  listVersions:  (id)      => fetchJson<{ items: BriefingVersion[] }>(`/api/briefings/${id}/versions`),
  createVersion: (id, body)=> fetchJson<BriefingVersion>(`/api/briefings/${id}/versions`, { method: "POST", body }),
  approve:       (id)      => fetchJson<BriefingDetail>(`/api/briefings/${id}/approve`, { method: "POST" }),
  publish:       (id)      => fetchJson<BriefingDetail>(`/api/briefings/${id}/publish`, { method: "POST" }),
  supersede:     (id)      => fetchJson<BriefingSummary>(`/api/briefings/${id}/supersede`, { method: "POST" }),
  getMetrics:    ()        => fetchJson<BriefingMetrics>("/api/briefings/metrics"),
};
```

### 5.7 Interactive UI Layout

**Left Panel — Library Rail**
- Status filter dropdown (all, draft, under_review, approved, published, superseded, withdrawn)
- Scrollable list of briefings showing: title, status pill, audience tag, version number, publication/updated date
- Click to select → loads detail in center
- "New Briefing" button opens inline creation form (title + audience)

**Center Panel — Editorial Surface (tabbed)**

- **Editorial tab:** Section editor displaying current version's sections. Each section: title input + body textarea. Add section / remove section / reorder (drag or up/down buttons). "Save Version" button creates a new immutable version snapshot. Status workflow buttons at top: "Submit for Review" (draft), "Approve" (under_review), "Publish" (approved). Change indicator showing section count delta from previous version.
- **Versions tab:** Version history list showing: version number, edited_by name, timestamp, section count, source counts. Click any version to view its sections read-only in the center panel. Side-by-side comparison not in initial scope — deferred to future enhancement.
- **Lineage tab:** Three grouped lists: linked investigations, linked events, linked watchlists. Each shows ID, title (fetched), and a cross-workspace navigation link. "Attach Source" picker: type selector (investigation/event/watchlist) + ID input with validation.

**Right Panel — Briefing AI Rail**
- Approval status: approved_by name, approved_at date (or "Pending approval")
- Publication status: published_at date (or "Unpublished")
- Version count
- Audience
- Owner name
- Editorial signals (same logic as current implementation):
  - Investigation lineage status
  - Watchlist source status
  - Publication/supersedence warnings
- All read-only, refreshes when briefing data changes

---

## 6. Shared Infrastructure

### 6.1 Auth Helper Extraction

The `requireApiSession` helper currently lives in `app/api/watchlists/_helpers.ts`. It will be extracted to `app/api/_shared/auth.ts` and imported by investigations, briefings, and watchlists routes. The function signature and behavior remain identical:

```typescript
export async function requireApiSession(request: Request): Promise<SessionPrincipal | null>
```

Returns the session principal (with `tenantId`, `userId`, `role`, `clearanceLevel`) or null if unauthorized.

### 6.2 Cross-Workspace Navigation

Briefings link to investigations via `source_investigation_ids`. Investigations link to events/entities via `investigation_items`. These render as clickable links:

- Investigation item with `item_type: "event"` → navigates to `/pulseboard?event={item_id}`
- Investigation item with `item_type: "entity"` → navigates to `/corpwatch/{item_id}`
- Briefing lineage investigation → navigates to `/investigations?case={investigation_id}`
- Briefing lineage event → navigates to `/pulseboard?event={event_id}`
- Briefing lineage watchlist → navigates to `/watchlists?list={watchlist_id}`

Navigation uses Next.js `router.push` — no full page reload.

### 6.3 Real-Time Updates via Gateway

When investigation or briefing state changes, a Redis pub/sub event is emitted following the existing pattern from watchlist alerts. The WebSocket gateway pushes updates to connected clients subscribed to the relevant tenant channel. No new gateway infrastructure is needed — only new event type registrations:

- `investigation:status_changed` — when investigation status transitions
- `investigation:item_attached` — when evidence/items are added
- `briefing:version_created` — when a new version is saved
- `briefing:published` — when a briefing is published

### 6.4 Testing Strategy

**Integration tests for each API route:**
- CRUD operations (create, read, update, list)
- Status transition validation (valid transitions succeed, invalid return 422)
- Auth enforcement (missing/invalid session returns 401)
- Input validation (missing required fields return 400)
- Tenant isolation (cannot access other tenant's data)

**State machine tests:**
- All valid transitions from each state
- All rejected transitions from each state
- Terminal states (superseded, withdrawn, archived) reject all transitions

**Custody log verification:**
- POST evidence → custody log contains `ingested` entry
- PATCH evidence (verify) → custody log contains `verified` entry
- PATCH evidence (challenge) → custody log contains `challenged` entry
- Custody log entries are immutable (no update/delete)

**Component tests:**
- Store hydration and mutation functions
- Tab switching and selection state
- Form validation in create/attach flows

---

## 7. Type Definitions

### 7.1 Investigation Types

```typescript
export type InvestigationSummary = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  classification: string;
  confidence: number | null;
  ownerName: string;
  itemCount: number;
  evidenceCount: number;
  noteCount: number;
  createdAt: string;
  updatedAt: string;
};

export type InvestigationDetail = InvestigationSummary & {
  hypothesis: string | null;
  ownerId: string;
};

export type InvestigationItem = {
  id: string;
  itemType: "event" | "entity" | "document" | "claim";
  itemId: string;
  role: "key_evidence" | "supporting" | "context" | "lead" | "exculpatory" | "disputed";
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
  action: "ingested" | "viewed" | "exported" | "verified" | "challenged" | "transferred";
  evidenceHashAtAction: string;
  ipAddress: string | null;
  createdAt: string;
};

export type InvestigationNote = {
  id: string;
  noteType: "note" | "hypothesis" | "task" | "decision";
  body: string;
  authorId: string;
  authorName: string;
  isAiGenerated: boolean;
  verificationStatus: "unverified" | "pending_review" | "accepted" | "rejected";
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

### 7.2 Briefing Types

```typescript
export type BriefingSummary = {
  id: string;
  title: string;
  audience: string | null;
  status: string;
  currentVersion: number;
  ownerName: string;
  approvedBy: string | null;
  approvedAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BriefingDetail = BriefingSummary & {
  ownerId: string;
  supersedesId: string | null;
  sections: BriefingSection[];
  sourceInvestigationIds: string[];
  sourceEventIds: string[];
  sourceWatchlistIds: string[];
};

export type BriefingSection = {
  title: string;
  body: string;
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

---

## 8. Summary

| Metric | Investigations (4A) | Briefings (4B) | Total |
|--------|---------------------|----------------|-------|
| API endpoints | 13 | 10 | 23 |
| New files | 6 | 6 | 12 + 1 shared |
| Database migrations | 0 | 0 | 0 |
| State machine states | 6 | 6 | 12 |
| Zustand store actions | 16 | 13 | 29 |
| Integration test areas | 5 | 5 | 10 |

After Phase 4A+4B, all 7 NARAD V2 workspaces will be fully interactive with CRUD APIs, client state management, and status workflows.
