# NARAD V2 — Phase 3B Implementation Plan
## CorpWatch + LexPulse Workspace Deepening

**Date:** 2026-03-28
**Design Spec:** `docs/superpowers/specs/2026-03-28-phase-3b-corpwatch-lexpulse-design.md`
**Estimated Tasks:** 18 implementation steps

---

## Task Sequence

### Task 1: Database Migration `013_phase_3b_workspaces.sql`

**What:** Add workspace-specific tables for CorpWatch narratives, LexPulse RAG cache, sector forecasts, and answer feedback.

**Files:**
- Create `migrations/013_phase_3b_workspaces.sql`

**Details:**
- CREATE TABLE `corp_watch.entity_narratives` (entity_id PK, narrative, confidence, generated_by, expires_at)
- CREATE TABLE `lex_pulse.query_cache` (embedding vector(768), answer JSONB, citations, confidence, expires_at)
- CREATE TABLE `lex_pulse.sector_forecasts` (sector_name, friction_change_pct, period_label, narrative)
- CREATE TABLE `lex_pulse.answer_feedback` (query_cache_id FK, user_id, rating up/down)
- HNSW index on `lex_pulse.query_cache.embedding` for semantic cache lookups
- GRANT permissions to `narad_ingest_writer` and `narad_app`

**Depends on:** Phase 3A complete

---

### Task 2: Bhashini Translation Service

**What:** Build the translation service that converts Hindi/regional language documents to English.

**Files:**
- Create `apps/intelligence/src/narad/services/translation.py`
- Edit `apps/intelligence/src/narad/config.py` (add Bhashini config)
- Edit `.env.example`

**Details:**
- Implement `TranslationService.translate(text, source_lang, target_lang)` using Bhashini API
- Rate limiter: max `BHASHINI_MAX_RPM` requests/minute
- Retry with backoff on API failure (3 attempts)
- Fallback: return None on failure (caller uses original text)
- Wire into ingestion pipeline: after document INSERT, if `original_language != 'en'`, enqueue translation task
- On completion: UPDATE `core.documents SET translated_text = ..., translated_language = 'en'`

**Depends on:** Task 1

---

### Task 3: Entity Narrative Generation Service

**What:** Build the LLM-powered entity narrative generator for CorpWatch AI Synthesis.

**Files:**
- Create `apps/intelligence/src/narad/services/entity_narratives.py`

**Details:**
- `generate_entity_narrative(entity_id, tenant_id)`:
  1. Fetch entity profile: canonical_name, type, sector, risk_score, external_ids
  2. Fetch top 10 relationships from `core.relationships`
  3. Fetch last 30 days of events from `core.event_entity_links` → `core.events`
  4. Fetch financial data from `corp_watch.entity_profiles` (if exists)
  5. Construct Gemini prompt requesting 2-3 sentence contextual narrative
  6. Parse response, validate, compute confidence
  7. UPSERT into `corp_watch.entity_narratives`
  8. Set `expires_at = now() + 24 hours`
- Fallback: if LLM fails, generate deterministic narrative from available data
- Model: `gemini-2.5-flash` (narratives don't need Pro quality)

**Depends on:** Task 1

---

### Task 4: RAG Query Service for LexPulse

**What:** Build the retrieval-augmented generation pipeline for regulatory questions.

**Files:**
- Create `apps/intelligence/src/narad/services/rag_query.py`

**Details:**
- `answer_regulatory_query(query_text, tenant_id)`:
  1. Embed query using `text-embedding-004`
  2. Check semantic cache: `SELECT FROM lex_pulse.query_cache WHERE embedding <=> $1 < 0.15 AND expires_at > now()`
  3. If cache hit: return cached answer
  4. Vector search: top 20 from `core.documents WHERE doc_type IN ('gazette','circular','order','bill','debate')`
  5. BM25 rerank: `ts_rank(tsv, plainto_tsquery($1))` on same documents
  6. Reciprocal Rank Fusion: merge vector and BM25 ranks, take top 5
  7. Construct prompt with retrieved documents as context
  8. Call Gemini 2.5 Pro for answer generation (regulatory needs higher quality)
  9. Parse structured output: title, directAnswer, whatChanged[], whyItMatters, affectedSectors[]
  10. Extract citation references ([Source N] → document IDs)
  11. Cache result in `lex_pulse.query_cache`
  12. Return answer + evidence pack
- Timeout: 20 seconds total (embedding + retrieval + generation)
- Fallback: if LLM fails, return top 5 documents with excerpts, no synthesis

**Depends on:** Task 1

---

### Task 5: Sector Forecast Projection

**What:** Build the daily sector forecast computation for LexPulse sidebar.

**Files:**
- Create `apps/intelligence/src/narad/projections/sector_forecasts.py`
- Edit `apps/intelligence/src/narad/workers/celery_app.py` (add beat schedule)

**Details:**
- Daily Celery Beat task: `rebuild_sector_forecasts`
  1. Query `projections.regulatory_digest` for last 90 days, grouped by sector
  2. Query previous 90-day window for comparison
  3. Compute percentage change per sector
  4. Generate narrative for top 3 most-changed sectors (Gemini Flash)
  5. UPSERT into `lex_pulse.sector_forecasts`
- Sectors extracted from `regulatory_digest.digest.lex_pulse.affected_sectors` or event metadata

**Depends on:** Task 1

---

### Task 6: CorpWatch API Routes (Backend)

**What:** Create Next.js API routes for CorpWatch entity search and profiles.

**Files:**
- Create `apps/web/src/app/api/corpwatch/search/route.ts`
- Create `apps/web/src/app/api/corpwatch/[entityId]/route.ts`
- Create `apps/web/src/app/api/corpwatch/[entityId]/graph/route.ts`
- Create `apps/web/src/app/api/corpwatch/[entityId]/filings/route.ts`
- Create `apps/web/src/app/api/corpwatch/[entityId]/events/route.ts`
- Create `apps/web/src/app/api/corpwatch/[entityId]/narrative/route.ts`

**Details:**
- Search route: text, structured ID, and semantic search across `core.entities`
- Profile route: join entity_summaries + entities + corp_watch.entity_profiles
- Graph route: fetch relationships + connected entities, return nodes/edges JSON
- Filings route: paginated documents linked to entity, filtered by filing types
- Events route: paginated events linked to entity via event_entity_links
- Narrative route: fetch from cache or trigger generation via intelligence service
- All routes: require auth, scope by tenant_id

**Depends on:** Tasks 3, 4 (for narrative), Phase 3A (for data)

---

### Task 7: CorpWatch Data Layer (Frontend)

**What:** Rewrite the CorpWatch data adapter to support full entity profiles.

**Files:**
- Rewrite `apps/web/src/lib/workspaces/corpwatch.ts`
- Create `apps/web/src/lib/workspaces/corpwatch-types.ts`

**Details:**
- Types: `EntityProfile`, `EntityGraphData`, `EntityFiling`, `EntityEvent`, `EntityNarrative`
- Fetch functions: `searchEntities()`, `getEntityProfile()`, `getEntityGraph()`, `getEntityFilings()`, `getEntityEvents()`, `getEntityNarrative()`
- React Query integration: cache entity profiles for 5 minutes, graph for 10 minutes

**Depends on:** Task 6

---

### Task 8: CorpWatch Entity Search UI

**What:** Build the entity search interface as the CorpWatch landing page.

**Files:**
- Rewrite `apps/web/src/app/(authenticated)/corpwatch/page.tsx`
- Create `apps/web/src/features/corpwatch/entity-search.tsx`

**Details:**
- Search input with debounced query (300ms)
- Result cards: entity name, type, risk score badge, location, aliases
- Click result → navigate to `/corpwatch/[entityId]`
- Empty state: show recent entities from entity_summaries
- Loading skeleton matching Sovereign Midnight design

**Depends on:** Task 7

---

### Task 9: CorpWatch Entity Profile Page

**What:** Build the full entity profile page with hero, graph, tabs, and monitoring rail.

**Files:**
- Create `apps/web/src/app/(authenticated)/corpwatch/[entityId]/page.tsx`
- Create `apps/web/src/features/corpwatch/entity-profile.tsx`
- Create `apps/web/src/features/corpwatch/entity-hero.tsx`
- Create `apps/web/src/features/corpwatch/entity-tabs.tsx`
- Create `apps/web/src/features/corpwatch/monitoring-rail.tsx`

**Details:**
- Dynamic route `[entityId]` under authenticated layout
- Hero panel: name, CIN, location, risk score with color band, AI synthesis
- Tab panels: Overview (executives + financials), Filings, Events, Geography
- Monitoring rail: watchlist status, AI predictive insight
- React Query for data fetching with stale-while-revalidate
- Zustand store for tab state, selected filing, etc.

**Depends on:** Tasks 7, 8

---

### Task 10: CorpWatch Network Graph Component

**What:** Build the interactive entity relationship graph.

**Files:**
- Create `apps/web/src/features/corpwatch/entity-graph.tsx`
- Edit `apps/web/package.json` (add `react-force-graph-2d`)

**Details:**
- Force-directed graph using react-force-graph-2d
- Nodes: entities with type-based coloring and size by risk_score
- Edges: relationships with type-based styling (solid/dashed/dotted)
- Interactions: click node for popover, double-click to navigate, zoom/pan
- Limit: top 50 relationships for performance
- Canvas rendering for smooth performance
- Sovereign Midnight color scheme

**Depends on:** Task 7

---

### Task 11: LexPulse API Routes (Backend)

**What:** Create Next.js API routes for LexPulse queries and data.

**Files:**
- Create `apps/web/src/app/api/lexpulse/query/route.ts`
- Create `apps/web/src/app/api/lexpulse/watchlists/route.ts`
- Create `apps/web/src/app/api/lexpulse/digests/route.ts`
- Create `apps/web/src/app/api/lexpulse/digests/[digestId]/route.ts`
- Create `apps/web/src/app/api/lexpulse/sectors/route.ts`
- Create `apps/web/src/app/api/lexpulse/feedback/route.ts`

**Details:**
- Query route: POST, forwards to intelligence service RAG pipeline, returns answer + evidence
- Watchlists route: GET, fetches regulatory watchlists with alert counts
- Digests route: GET, paginated recent regulatory digests
- Digest detail: GET, full digest with evidence documents
- Sectors route: GET, sector forecast cards
- Feedback route: POST, stores analyst rating
- All routes: require auth, scope by tenant_id

**Depends on:** Tasks 4, 5

---

### Task 12: LexPulse Data Layer (Frontend)

**What:** Rewrite the LexPulse data adapter for full functionality.

**Files:**
- Rewrite `apps/web/src/lib/workspaces/lexpulse.ts`
- Create `apps/web/src/lib/workspaces/lexpulse-types.ts`

**Details:**
- Types: `RagAnswer`, `EvidenceDocument`, `RegulatoryWatchlist`, `SectorForecast`, `RegulatoryDigest`
- Fetch functions: `queryRegulatory()`, `getWatchlists()`, `getDigests()`, `getSectorForecasts()`, `submitFeedback()`
- React Query: cache digests for 5 min, watchlists for 2 min, sector forecasts for 1 hour

**Depends on:** Task 11

---

### Task 13: LexPulse Query Interface UI

**What:** Build the interactive RAG query bar and answer display.

**Files:**
- Create `apps/web/src/features/lexpulse/query-bar.tsx`
- Create `apps/web/src/features/lexpulse/answer-panel.tsx`
- Create `apps/web/src/features/lexpulse/evidence-rail.tsx`

**Details:**
- Query bar: text input with send button, loading state during RAG
- Suggested query pills below input (static + dynamic)
- Answer panel: title, direct answer, What Changed grid, Why It Matters, Affected Sectors pills
- Evidence rail: document cards with type icons, trust score badges, open links
- Feedback: thumbs up/down after answer display
- Export Brief button (generates downloadable summary)

**Depends on:** Task 12

---

### Task 14: LexPulse Workspace Page Rewrite

**What:** Rewrite the LexPulse page to compose all new components.

**Files:**
- Rewrite `apps/web/src/app/(authenticated)/lexpulse/page.tsx`
- Create `apps/web/src/features/lexpulse/lexpulse-workspace.tsx`
- Create `apps/web/src/features/lexpulse/watchlist-sidebar.tsx`
- Create `apps/web/src/features/lexpulse/sector-forecast-card.tsx`

**Details:**
- 3-column layout matching prototype:
  - Left (3 cols): Active Watchlists sidebar + Sector Forecast card
  - Center (6 cols): Query bar + Answer panel
  - Right (3 cols): Evidence rail
- Zustand store for query state, selected digest, answer history
- Loading skeletons during RAG query (can take 5-15 seconds)
- Empty state when no query submitted: show recent digests

**Depends on:** Tasks 12, 13

---

### Task 15: Middleware Updates for New Routes

**What:** Add new CorpWatch and LexPulse API routes to the auth middleware.

**Files:**
- Edit `apps/web/src/middleware.ts`

**Details:**
- Add `/api/corpwatch` and `/api/lexpulse` to `PROTECTED_PREFIXES`
- Verify JWT protection works for all new routes

**Depends on:** Tasks 6, 11

---

### Task 16: Intelligence Service — RAG and Narrative Endpoints

**What:** Add FastAPI endpoints that the Next.js API routes call for LLM-powered features.

**Files:**
- Create `apps/intelligence/src/narad/api/corpwatch.py`
- Create `apps/intelligence/src/narad/api/lexpulse.py`
- Edit `apps/intelligence/src/narad/main.py` (register routers)

**Details:**
- `POST /api/corpwatch/narrative` — generate entity narrative, called by Next.js API route
- `POST /api/lexpulse/query` — RAG query pipeline, called by Next.js API route
- Both endpoints: validate tenant_id, rate limit, return structured JSON
- The Next.js app doesn't call Gemini directly — it delegates to the intelligence service

**Depends on:** Tasks 3, 4

---

### Task 17: Integration Tests

**What:** Test the full CorpWatch and LexPulse flows.

**Files:**
- Create `apps/intelligence/tests/test_entity_narrative.py`
- Create `apps/intelligence/tests/test_rag_query.py`
- Create `apps/intelligence/tests/test_translation.py`

**Details:**
- Entity narrative: mock Gemini, verify narrative generation and caching
- RAG query: mock Gemini, verify retrieval, fusion, and answer structure
- Translation: mock Bhashini, verify document update flow
- Semantic cache: verify cache hit prevents LLM call

**Depends on:** Tasks 2, 3, 4

---

### Task 18: End-to-End Verification

**What:** Verify both workspaces work with real data from Phase 3A sources.

**Steps:**
1. Ensure Phase 3A sources have been ingesting for at least 1 hour (need real documents/entities)
2. Navigate to `/corpwatch` → search for an entity from SEBI/BSE filings
3. Verify entity profile renders with hero, graph, and at least one tab with data
4. Verify AI narrative generates on first profile view
5. Navigate to `/lexpulse` → submit a regulatory query
6. Verify RAG answer returns with citations and evidence documents
7. Verify semantic cache works (same query returns cached result)
8. Verify watchlist sidebar shows real watchlist data
9. Submit feedback rating, verify stored
10. Type check all new code: `npm run typecheck` (0 errors)
11. Build: `npm run build` (0 warnings)

**Depends on:** Tasks 6–16

---

## Dependency Graph

```
Task 1 (migration) ──────────────────────────┐
                                              │
Task 2 (Bhashini) ──────────────────────────── │ (parallel)
Task 3 (entity narrative service) ──────────── │ (parallel)
Task 4 (RAG query service) ─────────────────── │ (parallel)
Task 5 (sector forecast projection) ────────── │ (parallel)
                                              │
Task 6 (CorpWatch API routes) ←── T3          │
Task 7 (CorpWatch data layer) ←── T6          │
Task 8 (CorpWatch search UI) ←── T7           │
Task 9 (CorpWatch profile page) ←── T7, T8    │
Task 10 (CorpWatch graph) ←── T7              │
                                              │
Task 11 (LexPulse API routes) ←── T4, T5      │
Task 12 (LexPulse data layer) ←── T11         │
Task 13 (LexPulse query UI) ←── T12           │
Task 14 (LexPulse workspace page) ←── T12, T13│
                                              │
Task 15 (middleware) ←── T6, T11              │
Task 16 (intelligence endpoints) ←── T3, T4   │
Task 17 (integration tests) ←── T2, T3, T4    │
Task 18 (e2e verification) ←── all            │
```

**High parallelism:** Tasks 2-5 can all run in parallel after Task 1. Tasks 6-10 (CorpWatch) and 11-14 (LexPulse) are independent tracks that can be developed simultaneously.

---

## Estimated Scope

| Category | New/Modified Files | Approximate Lines |
|---|---|---|
| Migration | 1 new | ~60 |
| Backend services | 4 new | ~600 |
| Backend API routes | 2 new | ~200 |
| Frontend API routes | 12 new | ~600 |
| Frontend data layers | 4 new/modified | ~400 |
| Frontend components | 12 new | ~1,800 |
| Frontend pages | 3 new/modified | ~300 |
| Tests | 3 new | ~400 |
| Config | 2 modified | ~30 |
| **Total** | **~43 files** | **~4,390 lines** |
