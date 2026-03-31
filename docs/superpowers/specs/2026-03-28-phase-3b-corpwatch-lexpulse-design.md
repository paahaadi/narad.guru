# NARAD V2 — Phase 3B Design Spec
## CorpWatch + LexPulse Workspace Deepening

**Date:** 2026-03-28
**Session:** 3B of Phase 3
**Status:** Draft — pending approval
**Depends on:** Phase 3A (Live Intelligence Loop — sources must be producing real data)
**Builds on:** `narad/corpwatch_intelligence_desk/code.html`, `narad/lexpulse_intelligence_terminal/code.html`

---

## 1. Scope

Phase 3B takes the two most data-rich workspaces from staged adapters to full interactive implementations:

**CorpWatch Intelligence Desk:**
- Entity search and profile pages
- Ownership/relationship graph visualization
- Executive data and financial metrics
- AI synthesis narratives
- Tabbed intelligence panels (Overview, Filings, Events, Geography)
- Monitoring integration

**LexPulse Intelligence Terminal:**
- Interactive RAG query interface with Gemini
- Active watchlist sidebar with status badges
- Full evidence panel with trust scores
- What Changed / Why It Matters sections
- Affected sector tagging
- Suggested query pills
- Export and feedback mechanisms

**Also in scope:**
- Bhashini translation integration (Hindi → English for government sources)
- New API routes for both workspaces
- Database additions for workspace-specific features
- Source deepening: MCA21, Parliament Digital Library, BSE/NSE corporate data

**Out of scope for 3B:**
- Watchlist rule builder UI (Phase 3C)
- Investigations / Briefings workspace deepening (Phase 4)
- Full 32-source activation (Phase 4)

---

## 2. CorpWatch Intelligence Desk

### 2.1 Entity Search

CorpWatch needs a search surface to find entities before viewing profiles.

**Search modes:**
1. **Text search:** pg_trgm + tsvector on `core.entities.canonical_name` and `aliases`
2. **Structured ID search:** exact match on `external_ids` JSONB (CIN, ISIN, LLPIN)
3. **Semantic search:** pgvector cosine similarity on `entities.embedding` (requires Phase 3A embeddings)

**API route:** `GET /api/corpwatch/search?q=reliance&type=company&limit=20`

Returns ranked results with: name, entity_type, risk_score, location_label, aliases, match_type.

### 2.2 Entity Profile Page

**Route:** `/corpwatch/[entityId]`

This is a new dynamic route under the authenticated layout. It replaces the current static CorpWatch page with a full entity detail view.

**Layout (matching prototype):**

```
┌─────────────────────────────────────────────────────────────┐
│ ENTITY HERO (full width)                                     │
│ Name | CIN | Location | Risk Score (0-100) | AI Synthesis    │
├──────────────┬────────────────────────┬─────────────────────┤
│ NETWORK      │ TABBED INTELLIGENCE    │ MONITORING RAIL     │
│ GRAPH        │                        │                     │
│ (4 cols)     │ [Overview] [Filings]   │ Watchlist status    │
│              │ [Events] [Geography]   │ Alert controls      │
│ Interactive  │                        │ AI Predictive       │
│ D3/force     │ Executives | Financials│ Insight card        │
│ graph        │ Timeline | Map         │                     │
└──────────────┴────────────────────────┴─────────────────────┘
```

### 2.3 Entity Hero Panel

**Data source:** `projections.entity_summaries` + `core.entities`

| Element | Source | Notes |
|---|---|---|
| Company name | `entities.canonical_name` | |
| Verification badge | `entities.is_resolved` | Green check if resolved |
| CIN / External IDs | `entities.external_ids` | Display primary ID prominently |
| Location | `entity_summaries.summary.location` | City, State, Country |
| Strategic Risk Score | `entities.risk_score` | 0-100, color-coded band (Green <30, Amber 30-70, Red >70) |
| AI Synthesis | `corp_watch.entity_narratives.narrative` | 2-3 sentence LLM-generated summary |

### 2.4 AI Synthesis Narrative

A new Gemini-powered feature that generates contextual entity summaries.

**Generation trigger:** When entity profile is first viewed AND narrative is stale (>24 hours) or missing.

**Prompt context:**
- Entity canonical name, type, sector
- Key relationships (top 10 by weight)
- Recent events (last 30 days)
- Risk score and inputs
- Financial data (if available from corp_watch)

**Output:** 2-3 sentence narrative describing the entity's current posture, key risks, and notable activity.

**Storage:** New table `corp_watch.entity_narratives`:
```sql
CREATE TABLE corp_watch.entity_narratives (
    entity_id UUID PRIMARY KEY REFERENCES core.entities(id),
    tenant_id UUID NOT NULL,
    narrative TEXT NOT NULL,
    confidence NUMERIC(3,2) NOT NULL,
    generated_by TEXT NOT NULL,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
);
```

**Cache policy:** Narratives expire after 24 hours. Regenerated on next view if expired.

### 2.5 Network Graph

Replace the current styled-div placeholder with a real interactive graph.

**Library:** React Force Graph (lightweight, works with React 19) or D3 force-directed layout rendered in a canvas.

**Data source:** `core.relationships` joined with `core.entities`

**Graph structure:**
- Central node: the profiled entity
- Connected nodes: entities with relationships (subsidiaries, directors, parent companies, key persons)
- Edge types: parent/subsidiary (solid), director (dashed), regulatory (dotted)
- Edge labels: relationship_type
- Node size: proportional to event count or risk score
- Node color: by entity_type (company=blue, person=green, government=orange)

**Interactions:**
- Click node: open entity mini-profile popover
- Double-click: navigate to that entity's profile
- Zoom/pan via scroll/drag
- Filter by relationship_type

**API route:** `GET /api/corpwatch/[entityId]/graph`

Returns: `{ nodes: [...], edges: [...] }` with position hints for force layout.

### 2.6 Tabbed Intelligence Panels

**Tab 1: Overview (default)**
- Key Executives: from `corp_watch.entity_profiles.directors` JSONB
  - Cards with initials avatar, name, role (Managing Director, CFO, etc.)
- Financial Footprint: from `corp_watch.entity_profiles.financials` JSONB
  - Revenue (₹ Cr), Net Profit (₹ Cr), YoY growth %
  - Fiscal year label

**Tab 2: Filings & Compliance**
- Timeline of regulatory filings from `core.documents` linked to entity
- Filtered by doc_type IN ('filing', 'circular', 'order')
- Each entry: date, filing type, regulator (SEBI/MCA/BSE), summary, link

**Tab 3: Related Events**
- Events linked to this entity via `core.event_entity_links`
- Sorted by occurred_at DESC
- Each entry: severity badge, title, date, source

**Tab 4: Geography**
- Mini MapLibre map showing entity's registered location + event locations
- Cluster markers for event density

### 2.7 Monitoring Rail

- **Watchlist status:** Is this entity on any active watchlist? Show watchlist name + status badge
- **Add to Watchlist:** Button to add entity to existing or new watchlist
- **AI Predictive Insight:** Cached narrative about entity behavior trends

### 2.8 CorpWatch API Routes

New routes under `/api/corpwatch/`:

| Route | Method | Description |
|---|---|---|
| `/api/corpwatch/search` | GET | Entity search (text, structured, semantic) |
| `/api/corpwatch/[entityId]` | GET | Full entity profile data |
| `/api/corpwatch/[entityId]/graph` | GET | Relationship graph nodes + edges |
| `/api/corpwatch/[entityId]/filings` | GET | Filing history (paginated) |
| `/api/corpwatch/[entityId]/events` | GET | Related events (paginated) |
| `/api/corpwatch/[entityId]/narrative` | GET | AI synthesis (cached or regenerated) |

---

## 3. LexPulse Intelligence Terminal

### 3.1 RAG Query Interface

The centerpiece of LexPulse: analysts type regulatory questions and receive cited answers.

**Architecture:**
```
User Query → Embed Query (text-embedding-004) → pgvector similarity search
  → Retrieve top-K regulatory documents
  → Rerank with BM25 (Reciprocal Rank Fusion)
  → Construct prompt with retrieved context
  → Gemini 2.5 Pro generates answer with citations
  → Return answer + evidence pack
```

**Implementation details:**

1. **Query embedding:** Embed user query using `text-embedding-004`
2. **Vector search:** `SELECT ... ORDER BY embedding <=> $1 LIMIT 20` on `core.documents` WHERE `doc_type IN ('gazette', 'circular', 'order', 'bill', 'debate')`
3. **BM25 rerank:** Also run `ts_rank(tsv, plainto_tsquery($1))` and fuse scores using RRF: `score = Σ 1/(k + rank_i)` where k=60
4. **Top-K selection:** Take top 5 documents after fusion
5. **Prompt construction:** Include document titles, bodies (truncated), and source metadata
6. **LLM generation:** Gemini 2.5 Pro (not Flash — regulatory answers need higher quality)
7. **Citation extraction:** LLM instructed to cite sources as `[Source N]` references
8. **Confidence scoring:** Based on retrieval similarity scores and source trust tiers

**Semantic cache:** Before calling the LLM, check if a similar query was answered recently:
```sql
SELECT answer, citations FROM lex_pulse.query_cache
WHERE embedding <=> $1 < 0.15  -- very similar query
  AND created_at > now() - interval '6 hours'
ORDER BY embedding <=> $1 LIMIT 1
```

If cache hit: return cached answer. If miss: generate new answer and cache it.

**API route:** `POST /api/lexpulse/query` with `{ query: "...", tenantId: "..." }`

Returns:
```json
{
  "answer": {
    "title": "Regulatory Shift: Civil Aviation Protocols",
    "directAnswer": "The 2.5% SAF blending requirement...",
    "whatChanged": [...],
    "whyItMatters": "...",
    "affectedSectors": ["Commercial Airlines", "Refinery Operations"],
    "confidence": 0.87
  },
  "evidence": [
    { "documentId": "...", "title": "G.S.R. 202", "docType": "gazette", "trustScore": 0.98, "excerpt": "..." }
  ],
  "generatedAt": "2026-03-29T10:00:00Z",
  "cached": false
}
```

### 3.2 Active Watchlists Sidebar

**Left panel (3 columns):** Shows watchlists relevant to regulatory monitoring.

**Data source:** `workflow.watchlists` filtered by `tenant_id` and `scope = 'regulatory'` (or tagged as LexPulse-relevant)

Each watchlist card shows:
- Name (e.g., "Min. of Civil Aviation")
- Description
- Status badge: Active (green pulse), Idle (gray), Alert (orange)
- NEW count: unresolved alerts from `workflow.watchlist_alerts` WHERE `status = 'new'`

**API route:** `GET /api/lexpulse/watchlists`

### 3.3 Evidence Panel with Trust Scores

**Right panel (3 columns):** Documents supporting the current answer/digest.

Each evidence card shows:
- Document icon (differentiated by doc_type: gavel for gazette, mic for hansard, scroll for circular)
- Title
- Trust score: computed as `source.trust_tier * 0.3 + document_age_recency * 0.3 + citation_count * 0.2 + confidence * 0.2`
- Open button: link to original source URL

### 3.4 Suggested Query Pills

Static + dynamic query suggestions:

**Static:** Hardcoded domain-relevant examples
- "Maritime Law Updates"
- "Aviation Regulatory Changes"
- "Digital Services Compliance"

**Dynamic:** Based on recent regulatory events:
- Extract top 3 event_types from last 7 days of regulatory digests
- Generate short query templates: "Recent {event_type} notifications"

### 3.5 Sector Forecast Card

AI-generated regulatory friction forecast by sector.

**Data:** Aggregated from `projections.regulatory_digest` over rolling 90-day windows:
- Count regulatory events per sector
- Compare to previous 90-day window
- Generate percentage change narrative

**Storage:** New projection `lex_pulse.sector_forecasts`:
```sql
CREATE TABLE lex_pulse.sector_forecasts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    tenant_id UUID NOT NULL,
    sector_name TEXT NOT NULL,
    friction_change_pct NUMERIC(5,2) NOT NULL,
    period_label TEXT NOT NULL,
    confidence NUMERIC(3,2) NOT NULL,
    narrative TEXT,
    computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Rebuilt daily by a Celery Beat task.

### 3.6 Export and Feedback

**Export Brief:** Generate a PDF/Markdown summary of the current answer + evidence
- Uses server-side rendering of the answer structure
- Stores reference in `lex_pulse.exported_briefs`

**Feedback:** Thumbs up/down on answer accuracy
- Stores in `lex_pulse.answer_feedback` (digest_id, user_id, rating, timestamp)
- Used to improve RAG quality over time (flag low-rated answers for review)

### 3.7 LexPulse API Routes

| Route | Method | Description |
|---|---|---|
| `/api/lexpulse/query` | POST | RAG query with cited answer |
| `/api/lexpulse/watchlists` | GET | Active regulatory watchlists |
| `/api/lexpulse/digests` | GET | Recent regulatory digests (paginated) |
| `/api/lexpulse/digests/[digestId]` | GET | Full digest detail with evidence |
| `/api/lexpulse/sectors` | GET | Sector forecast cards |
| `/api/lexpulse/feedback` | POST | Answer accuracy feedback |

---

## 4. Bhashini Translation Integration

Many Tier 1 sources publish in Hindi or regional languages. Phase 3B integrates Bhashini for translation.

**Integration point:** After document ingestion, before claim extraction.

**Flow:**
1. Check `document.original_language` — if not 'en', enqueue translation
2. Call Bhashini API: `POST /services/inference/pipeline` with source text
3. Store translated text in `document.translated_text`, set `translated_language = 'en'`
4. Claim extraction runs on `translated_text` when available, `body_text` otherwise

**Rate limiting:** Max 30 translations/minute (Bhashini free tier)
**Fallback:** If Bhashini unavailable, use `body_text` directly (Hindi claims will have lower extraction quality)

**Configuration:**
```env
BHASHINI_API_URL=https://dhruva-api.bhashini.gov.in
BHASHINI_API_KEY=
BHASHINI_SOURCE_LANGUAGES=hi,mr,ta,te,bn,gu,kn,ml
BHASHINI_TARGET_LANGUAGE=en
BHASHINI_MAX_RPM=30
```

---

## 5. Database Changes

### Migration: `013_phase_3b_workspaces.sql`

```sql
-- CorpWatch: entity narratives
CREATE TABLE corp_watch.entity_narratives (
    entity_id UUID PRIMARY KEY REFERENCES core.entities(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    narrative TEXT NOT NULL,
    confidence NUMERIC(3,2) NOT NULL,
    generated_by TEXT NOT NULL DEFAULT 'deterministic',
    generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '24 hours'
);
CREATE INDEX ON corp_watch.entity_narratives (tenant_id);

-- LexPulse: query cache for RAG
CREATE TABLE lex_pulse.query_cache (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    tenant_id UUID NOT NULL,
    query_text TEXT NOT NULL,
    embedding vector(768),
    answer JSONB NOT NULL,
    citations JSONB NOT NULL DEFAULT '[]',
    confidence NUMERIC(3,2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '6 hours'
);
CREATE INDEX ON lex_pulse.query_cache USING hnsw (embedding vector_cosine_ops);
CREATE INDEX ON lex_pulse.query_cache (tenant_id, created_at DESC);

-- LexPulse: sector forecasts
CREATE TABLE lex_pulse.sector_forecasts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    tenant_id UUID NOT NULL,
    sector_name TEXT NOT NULL,
    friction_change_pct NUMERIC(5,2) NOT NULL,
    period_label TEXT NOT NULL,
    confidence NUMERIC(3,2) NOT NULL,
    narrative TEXT,
    computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON lex_pulse.sector_forecasts (tenant_id, computed_at DESC);

-- LexPulse: answer feedback
CREATE TABLE lex_pulse.answer_feedback (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    tenant_id UUID NOT NULL,
    query_cache_id UUID REFERENCES lex_pulse.query_cache(id),
    user_id UUID NOT NULL,
    rating TEXT NOT NULL CHECK (rating IN ('up', 'down')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON lex_pulse.answer_feedback (tenant_id, query_cache_id);

-- Grants
GRANT SELECT, INSERT, UPDATE ON corp_watch.entity_narratives TO narad_ingest_writer;
GRANT SELECT, INSERT, UPDATE ON lex_pulse.query_cache TO narad_ingest_writer;
GRANT SELECT, INSERT ON lex_pulse.sector_forecasts TO narad_ingest_writer;
GRANT SELECT, INSERT ON lex_pulse.answer_feedback TO narad_ingest_writer;
GRANT SELECT ON corp_watch.entity_narratives TO narad_app;
GRANT SELECT ON lex_pulse.query_cache TO narad_app;
GRANT SELECT ON lex_pulse.sector_forecasts TO narad_app;
GRANT SELECT, INSERT ON lex_pulse.answer_feedback TO narad_app;
```

---

## 6. Frontend Dependencies

New packages for Phase 3B:

| Package | Purpose | Used By |
|---|---|---|
| `react-force-graph-2d` | Entity relationship graph | CorpWatch |
| `@iconify/react` | Document type icons | LexPulse evidence panel |

No heavy additions — the existing stack (Next.js 15, React 19, Zustand, React Query, MapLibre) handles everything else.

---

## 7. Success Criteria

Phase 3B is complete when:

**CorpWatch:**
1. Entity search returns results from real ingested data (from Phase 3A sources)
2. Entity profile page renders with hero, graph, tabs, and monitoring rail
3. Network graph shows real relationships with interactive nodes
4. AI synthesis narrative generates and caches for viewed entities
5. Filings tab shows real regulatory documents linked to the entity
6. Events tab shows real events linked to the entity

**LexPulse:**
1. RAG query returns cited answers from real regulatory documents
2. Evidence panel shows source documents with trust scores
3. Semantic cache prevents redundant LLM calls for similar queries
4. Active watchlists sidebar shows real watchlist data
5. Suggested query pills update based on recent regulatory activity
6. Feedback mechanism stores analyst ratings

**Translation:**
1. Hindi PIB articles are translated via Bhashini before claim extraction
2. Translated text stored in `core.documents.translated_text`
3. Claims extracted from translated text have reasonable quality

---

## 8. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Gemini Pro costs exceed budget for RAG | Medium | High query cost | Semantic cache with 6-hour TTL, limit to 50 queries/day initially |
| Network graph performance with many nodes | Low | Slow rendering | Limit to top 50 relationships, lazy-load on zoom |
| Bhashini API unreliable | Medium | Hindi sources not translated | Fallback to raw text, deterministic extraction still works |
| Entity profiles lack data (no MCA21 deep feed) | Medium | Sparse profiles | Show available data gracefully, don't show empty sections |
| RAG hallucination in regulatory answers | Medium | Analyst trust erosion | Always show evidence, confidence scores, feedback mechanism |
