# NARAD V2 — Phase 3A Implementation Plan
## Live Intelligence Loop

**Date:** 2026-03-28
**Design Spec:** `docs/superpowers/specs/2026-03-28-phase-3a-live-intelligence-loop-design.md`
**Estimated Tasks:** 15 implementation steps

---

## Task Sequence

### Task 1: Database Migration `012_phase_3a_pipeline.sql`

**What:** Add source health tracking columns, entity resolution indexes, dead-letter queue table, and seed the 8 Tier 1 source records.

**Files:**
- Create `migrations/012_phase_3a_pipeline.sql`

**Details:**
- ALTER TABLE `core.sources` — add `last_polled_at`, `last_success_at`, `consecutive_failures`, `status`, `documents_fetched_total`, `events_produced_total`
- ALTER TABLE `core.entities` — add `last_resolved_at`, `resolution_confidence`
- CREATE INDEX `idx_events_dedup_candidates` on `core.events` for temporal/type dedup queries
- CREATE INDEX `idx_entities_name_trgm` using GIN pg_trgm on `core.entities.canonical_name`
- CREATE TABLE `core.dead_letter_queue` with queue_name, payload, error tracking
- INSERT seed source records for all 8 Tier 1 sources (PIB, SEBI, eGazette, IMD, CWC, BSE, NSE, India Code)
- GRANT permissions to `narad_ingest_writer`

**Depends on:** Nothing (first task)

---

### Task 2: Configuration — New Environment Variables

**What:** Add Phase 3A config variables to the Pydantic settings class and `.env.example`.

**Files:**
- Edit `apps/intelligence/src/narad/config.py`
- Edit `.env.example`

**Details:**
- Add Gemini config: `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_EMBEDDING_MODEL`, `GEMINI_MAX_RPM`, `GEMINI_TIMEOUT_SECONDS`
- Add ingestion config: `INGEST_BATCH_SIZE`, `INGEST_MAX_CONCURRENT_SOURCES`, `EMBED_BATCH_SIZE`
- Add entity resolution config: `ENTITY_TRGM_THRESHOLD`, `ENTITY_AUTO_MERGE_THRESHOLD`, `ENTITY_REVIEW_THRESHOLD`
- Add event dedup config: `EVENT_TEMPORAL_WINDOW_HOURS`, `EVENT_SPATIAL_PROXIMITY_KM`, `EVENT_TITLE_SIMILARITY_THRESHOLD`
- Add circuit breaker config: `SOURCE_CIRCUIT_BREAKER_THRESHOLD`, `SOURCE_CIRCUIT_BREAKER_TIMEOUT`, `SOURCE_MAX_BACKOFF_SECONDS`

**Depends on:** Nothing

---

### Task 3: Circuit Breaker in BaseSourceAdapter

**What:** Implement the circuit breaker pattern in the base adapter class so that failing sources automatically back off.

**Files:**
- Edit `apps/intelligence/src/narad/adapters/base.py`

**Details:**
- Add circuit breaker state: `CLOSED`, `OPEN`, `HALF_OPEN`
- Track `consecutive_failures` and `last_failure_at`
- On failure: increment counter, if >= threshold → open circuit
- On open: reject calls until `timeout` elapsed, then transition to half-open
- On half-open: allow one request, if success → close, if fail → re-open with doubled backoff (max 30 min)
- On success: reset counter, close circuit
- Persist state to `core.sources.consecutive_failures` and `core.sources.status`

**Depends on:** Task 2

---

### Task 4: Activate 4 RSS-Based Adapters (PIB, SEBI, BSE, NSE)

**What:** Make the PIB adapter production-ready and implement SEBI, BSE, and NSE RSS adapters following the same pattern.

**Files:**
- Edit `apps/intelligence/src/narad/adapters/tier1/pib.py` (harden existing)
- Create/edit `apps/intelligence/src/narad/adapters/tier1/sebi.py`
- Create/edit `apps/intelligence/src/narad/adapters/tier1/bse.py`
- Create/edit `apps/intelligence/src/narad/adapters/tier1/nse.py`

**Details:**
- Each adapter: parse RSS XML, extract title/body/published_at/link
- Handle encoding issues (UTF-8, ISO-8859-1)
- Handle missing fields gracefully
- Set `doc_type` appropriately (press_release, circular, filing)
- Extract `metadata` with source-specific fields (ministry for PIB, circular number for SEBI)
- Register each adapter in the registry

**Depends on:** Task 3

---

### Task 5: Activate 4 Web-Scrape Adapters (eGazette, IMD, CWC, India Code)

**What:** Implement web scraping adapters for the 4 non-RSS Tier 1 sources.

**Files:**
- Create/edit `apps/intelligence/src/narad/adapters/tier1/egazette.py`
- Create/edit `apps/intelligence/src/narad/adapters/tier1/imd.py`
- Create/edit `apps/intelligence/src/narad/adapters/tier1/cwc.py`
- Create/edit `apps/intelligence/src/narad/adapters/tier1/india_code.py`

**Details:**
- eGazette: fetch recent gazette notifications, extract title/body/gazette part/section/notification number
- IMD: fetch district-wise weather warnings, extract hazard type/state/district/severity/geometry
- CWC: fetch flood forecast bulletins, extract station/river/state/water_level/forecast_level/severity/geometry
- India Code: fetch recent acts/amendments, extract act title/year/section text
- IMD and CWC adapters must extract lat/lon geometry from station/district metadata for GeoStrat
- All adapters use httpx with retry and respect robots.txt

**Depends on:** Task 3

---

### Task 6: Document Ingestion Pipeline

**What:** Build the core ingestion orchestration that coordinates adapter polling, dedup checking, and document storage.

**Files:**
- Edit `apps/intelligence/src/narad/workers/ingest_tasks.py`
- Edit `apps/intelligence/src/narad/services/` (add ingestion service)

**Details:**
- `poll_source(source_id)` task:
  1. Load source config from DB
  2. Check circuit breaker state
  3. Call `adapter.fetch_documents(since=source.last_success_at)`
  4. For each RawDocument: compute `content_hash`, check uniqueness, INSERT to `core.documents`
  5. Update `source.last_polled_at`, `last_success_at`, `documents_fetched_total`
  6. Enqueue `enrich_document(document_id)` for each new document
  7. On error: increment `consecutive_failures`, publish to DLQ
- `poll_all_active_sources()` periodic task:
  1. SELECT sources WHERE `status != 'disabled'` AND `last_polled_at` + `poll_interval_seconds` < now()
  2. Enqueue `poll_source(source_id)` for each, up to `INGEST_MAX_CONCURRENT_SOURCES`

**Depends on:** Tasks 4, 5

---

### Task 7: Claim Extraction Service

**What:** Build the claim extraction pipeline with deterministic and LLM modes.

**Files:**
- Edit `apps/intelligence/src/narad/services/` (add claim extraction service)
- Edit `apps/intelligence/src/narad/workers/enrichment_tasks.py`

**Details:**
- Deterministic extraction:
  - Title → claim with confidence 1.0
  - First sentence → claim with confidence 0.9
  - Regex for structured IDs (CIN, SEBI order numbers, gazette notification numbers)
- LLM extraction (Gemini 2.5 Flash):
  - Structured prompt requesting JSON array of claims
  - Each claim: text, confidence, entities_mentioned, event_type_hint
  - Timeout: 10 seconds, fallback to deterministic on failure
  - Rate limiting: respect `GEMINI_MAX_RPM`
- Store claims in `core.claims` with `lineage_hash` dedup
- Enqueue `resolve_entities(document_id)` after extraction

**Depends on:** Task 6

---

### Task 8: Entity Resolution Service

**What:** Build deterministic and probabilistic entity matching with merge logic.

**Files:**
- Create `apps/intelligence/src/narad/services/entity_resolution.py`
- Edit `apps/intelligence/src/narad/workers/enrichment_tasks.py`

**Details:**
- Extract entity mentions from claims (regex for structured IDs + title-case heuristic)
- Deterministic match: query `core.entities` by `external_ids` JSONB containment
- Probabilistic match: pg_trgm `similarity()` on `canonical_name`, weighted scoring
- Auto-merge if score >= 0.85:
  - Acquire PostgreSQL advisory lock on entity ID
  - Update canonical name (highest trust tier wins)
  - Union aliases and external_ids
  - Update `resolved_from[]`
  - Repoint all FK references
  - Release lock
- Score 0.60–0.85: log as candidate pair, skip merge (Phase 4 human review)
- Score < 0.60: create new entity
- Link entities to events via `core.event_entity_links`

**Depends on:** Task 7

---

### Task 9: Event Canonicalization and Dedup

**What:** Build event creation with deduplication clustering.

**Files:**
- Create `apps/intelligence/src/narad/services/event_canonicalization.py`
- Edit `apps/intelligence/src/narad/workers/enrichment_tasks.py`

**Details:**
- After claims and entities are resolved, determine if document describes a new event
- Search for dedup candidates:
  ```sql
  SELECT * FROM core.events
  WHERE tenant_id = $1
    AND event_type = $2
    AND occurred_at BETWEEN $3 - interval '24 hours' AND $3 + interval '24 hours'
    AND status != 'invalidated'
    AND (
      ST_DWithin(geometry, $4, 50000)  -- 50km
      OR geometry IS NULL
    )
  ```
- For each candidate: compute title similarity using `similarity(title, $5)`
- Check entity overlap via `core.event_entity_links`
- If match found: update existing event (increment `source_count`, add corroboration link)
- If no match: INSERT new event, set `status = 'canonicalized'`
- Assign `cluster_id` for related events
- Enqueue `generate_story_capsule(event_id)` and `rebuild_pulseboard(event_id)`

**Depends on:** Task 8

---

### Task 10: Story Capsule Generation

**What:** Build the story capsule generation pipeline with deterministic and LLM modes.

**Files:**
- Create `apps/intelligence/src/narad/services/story_capsules.py`
- Edit `apps/intelligence/src/narad/workers/enrichment_tasks.py`

**Details:**
- Deterministic mode (always runs first):
  - headline = document title (truncated to 120 chars)
  - explanation = first 2 sentences of body
  - evidence_summary = "Based on {source}, published {date}"
  - INSERT into `core.story_capsules`
  - Link to event via `events.story_capsule_id`
- LLM-enhanced mode (async batch):
  - Collect up to 10 events with deterministic-only capsules
  - Send batch prompt to Gemini with event context
  - Parse structured output
  - UPDATE existing capsule if LLM confidence >= 0.7
  - Mark `generated_by = 'gemini-2.5-flash'`
- Fallback: keep deterministic capsule on LLM failure

**Depends on:** Task 9

---

### Task 11: Embedding Generation Pipeline

**What:** Build batch embedding generation for documents, entities, and events.

**Files:**
- Edit `apps/intelligence/src/narad/services/` (embedding service)
- Edit `apps/intelligence/src/narad/workers/enrichment_tasks.py`

**Details:**
- `flush_embedding_batch()` periodic task (runs every 30s):
  1. SELECT items with `embedding IS NULL`, LIMIT `EMBED_BATCH_SIZE`
  2. Prioritize: events first, then entities, then documents
  3. Call Google Embeddings API with batch of text inputs
  4. UPDATE embedding column in batch: `UPDATE ... WHERE id = ANY($1)`
- Rate limiting: max 1500 embeddings/minute
- Error handling: if API fails, skip batch, retry next cycle
- NULL handling: all queries using embeddings must have `WHERE embedding IS NOT NULL` guard

**Depends on:** Task 2

---

### Task 12: Dead-Letter Queue and Admin API

**What:** Build the DLQ system and admin endpoints for monitoring pipeline health.

**Files:**
- Create `apps/intelligence/src/narad/services/dead_letter.py`
- Edit `apps/intelligence/src/narad/api/admin.py`

**Details:**
- DLQ service: `publish_to_dlq(queue_name, task_name, payload, error_message)`
  - INSERT into `core.dead_letter_queue`
  - Also publish to Redis `narad:dlq:{queue_name}` for real-time monitoring
- Admin API endpoints:
  - `GET /api/admin/sources` — health status for all sources
  - `GET /api/admin/dlq` — list unresolved DLQ entries (paginated)
  - `POST /api/admin/dlq/{id}/retry` — requeue a DLQ entry
  - `POST /api/admin/dlq/{id}/resolve` — mark as resolved (manual)
  - `GET /api/admin/pipeline/stats` — ingestion/enrichment counts and rates

**Depends on:** Task 1

---

### Task 13: Projection Rebuild Wiring

**What:** Wire projection rebuilds to pipeline events so PulseBoard and GeoStrat show real data.

**Files:**
- Edit `apps/intelligence/src/narad/workers/projection_tasks.py`
- Edit `apps/intelligence/src/narad/projections/pulseboard.py`
- Edit `apps/intelligence/src/narad/projections/entity_summaries.py`
- Edit `apps/intelligence/src/narad/projections/regulatory_digest.py`

**Details:**
- After event canonicalization: enqueue `rebuild_pulseboard_projection(event_id)`
- After entity resolution: enqueue `rebuild_entity_summary(entity_id)`
- After regulatory event: enqueue `rebuild_regulatory_digest(event_id)`
- Each projection task: upsert projection row, then publish delta envelope to Redis
- Verify: PulseBoard feed API returns real events, GeoStrat events API returns geolocated events
- Ensure projection tasks are idempotent (upsert, not insert)

**Depends on:** Tasks 9, 10

---

### Task 14: Integration Tests

**What:** Build test fixtures and integration tests for the full pipeline.

**Files:**
- Create `apps/intelligence/tests/fixtures/` (RSS XML fixtures, HTML fixtures)
- Create `apps/intelligence/tests/test_ingestion.py`
- Create `apps/intelligence/tests/test_entity_resolution.py`
- Create `apps/intelligence/tests/test_event_dedup.py`
- Create `apps/intelligence/tests/test_pipeline_e2e.py`

**Details:**
- RSS fixtures: sample PIB, SEBI, BSE, NSE feed XML
- HTML fixtures: sample eGazette, IMD, CWC pages
- `test_ingestion.py`: adapter → document creation, dedup on second run
- `test_entity_resolution.py`: deterministic match by CIN, probabilistic match by name similarity, merge logic
- `test_event_dedup.py`: temporal/spatial/title matching, cluster assignment
- `test_pipeline_e2e.py`: full flow from RSS fixture → PulseBoard projection exists

**Depends on:** Tasks 6–13

---

### Task 15: End-to-End Verification

**What:** Run the complete pipeline against live government APIs and verify data flows to the browser.

**Steps:**
1. Run `migrations/migrate.sh` to apply `012_phase_3a_pipeline.sql`
2. Start all Docker services: `docker compose up -d`
3. Verify source health: `curl http://localhost:8000/api/admin/sources` shows 8 active sources
4. Wait for 2 poll cycles (~2 minutes)
5. Verify PulseBoard: `curl http://localhost:3000/api/pulseboard` returns real events
6. Verify GeoStrat: `curl http://localhost:3000/api/geostrat/events` returns geolocated events from IMD/CWC
7. Verify entities: `curl http://localhost:8000/api/admin/pipeline/stats` shows entity count > 0
8. Verify DLQ: check for any pipeline failures
9. Verify WebSocket: connect to gateway, subscribe to `narad:pulseboard:event`, wait for delta
10. Document results and any issues

**Depends on:** Task 14

---

## Dependency Graph

```
Task 1 (migration) ─────────────────────────────────────┐
Task 2 (config) ──────┬──────────────────────────────────┤
                      ▼                                   │
Task 3 (circuit breaker) ──┬──────────────────────────── │
                           ▼                              │
Task 4 (RSS adapters) ────┬                               │
Task 5 (scrape adapters) ─┤                               │
                           ▼                              │
Task 6 (ingestion pipeline) ──┐                           │
                              ▼                           │
Task 7 (claim extraction) ───┐                            │
                             ▼                            │
Task 8 (entity resolution) ─┐                             │
                            ▼                             │
Task 9 (event canonicalization) ──┐                       │
                                  ▼                       │
Task 10 (story capsules) ────────┤                        │
                                 │                        │
Task 11 (embeddings) ────────────┤ (parallel, from T2)    │
                                 │                        │
Task 12 (DLQ + admin) ──────────┤ (parallel, from T1)    │
                                 ▼                        │
Task 13 (projection wiring) ────┤                        │
                                 ▼                        │
Task 14 (integration tests) ────┤                        │
                                 ▼                        │
Task 15 (e2e verification) ─────┘                        │
```

**Parallelizable:** Tasks 4+5 (adapters), Tasks 11+12 (embeddings + DLQ), all independent of main pipeline chain.

---

## Estimated Scope

| Category | New/Modified Files | Approximate Lines |
|---|---|---|
| Migration | 1 new | ~80 |
| Config | 2 modified | ~60 |
| Adapters | 7 new/modified | ~700 |
| Services | 5 new | ~800 |
| Workers | 3 modified | ~300 |
| Projections | 3 modified | ~100 |
| Admin API | 1 modified | ~150 |
| Tests | 5 new | ~600 |
| **Total** | **~27 files** | **~2,800 lines** |
