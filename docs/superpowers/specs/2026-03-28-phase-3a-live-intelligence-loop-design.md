# NARAD V2 — Phase 3A Design Spec
## Live Intelligence Loop

**Date:** 2026-03-28
**Session:** 3A of Phase 3
**Status:** Draft — pending approval
**Depends on:** Phase 2 Complete (Data Plane + Intelligence Plane + Presentation Plane)
**Builds on:** `docs/architecture/canonical_ontology.md` (Sections 8, 9, 10, 11)

---

## 1. Scope

Phase 3A proves the complete intelligence loop end-to-end:

```
Source API → Adapter → Document Ingest → Claim Extraction → Entity Resolution
→ Event Canonicalization → Story Capsule Generation → Projection Rebuild
→ Redis Publish → WebSocket Gateway → Browser Update
```

**In scope:**
- Activate 8 Tier 1 source adapters against real APIs
- Build the LLM enrichment pipeline (Gemini-backed claim extraction, story capsules)
- Build entity resolution (deterministic + probabilistic matching)
- Build event deduplication and clustering
- Build embedding generation pipeline
- Wire the full pipeline so PulseBoard and GeoStrat consume real data
- Observability: structured logging, error tracking, dead-letter queue

**Out of scope for 3A:**
- CorpWatch / LexPulse / Watchlists workspace UI deepening (Phase 3B/3C)
- Tier 2/3 source activation (Phase 3C)
- RAG query interface (Phase 3B)
- Watchlist rule evaluation engine (Phase 3C)
- Bhashini translation integration (Phase 3B, needed for Hindi sources)

---

## 2. Why This First

Phase 3A is the riskiest technical work in the entire project:
- LLM calls are non-deterministic and can fail, timeout, or produce garbage
- Entity resolution involves fuzzy matching across sources with different naming conventions
- Event deduplication requires semantic similarity, spatial proximity, and temporal windowing
- Government RSS feeds are unreliable (downtime, format changes, encoding issues)
- The pipeline must be idempotent — re-running the same source must not create duplicates

Every subsequent phase depends on this pipeline producing clean, canonical data. If entity resolution is wrong, CorpWatch shows duplicates. If event dedup fails, PulseBoard floods with noise. If story capsules are hallucinated, analysts lose trust.

---

## 3. Source Activation Plan

### Tier 1 Sources for Phase 3A

| # | Source | Access Method | Cadence | Primary Workspace |
|---|---|---|---|---|
| 1 | PIB (Press Information Bureau) | RSS feed | 5 min | PulseBoard |
| 2 | SEBI (Securities Board) | RSS feed | 15 min | PulseBoard, CorpWatch |
| 3 | eGazette (Gazette of India) | Portal scrape / RSS | 30 min | LexPulse |
| 4 | IMD (India Met Department) | Web advisories / CAP | 10 min | GeoStrat, PulseBoard |
| 5 | CWC (Central Water Commission) | Portal / bulletins | 15 min | GeoStrat |
| 6 | BSE (Bombay Stock Exchange) | RSS feed | 10 min | CorpWatch |
| 7 | NSE (National Stock Exchange) | RSS feed | 10 min | CorpWatch |
| 8 | India Code / Legislative Dept | Web portal | 1 hour | LexPulse |

### Why These 8

- **PIB** is the highest-volume government source and already has a working adapter — it validates the full pipeline immediately
- **SEBI + BSE + NSE** feed CorpWatch entity data and produce regulatory events for PulseBoard
- **eGazette + India Code** feed LexPulse regulatory intelligence
- **IMD + CWC** produce geolocated weather/flood events that appear on GeoStrat maps
- All 8 are public, no API keys required (except data.gov.in which is excluded for now)
- RSS/web scraping is the lowest-friction access method — proves the pipeline before adding OAuth/SFTP sources

### Adapter Contract

Every adapter must implement:

```python
class BaseSourceAdapter(ABC):
    source_slug: str              # e.g., "pib", "sebi-rss"
    source_name: str              # e.g., "Press Information Bureau"
    trust_tier: int               # 1, 2, or 3
    default_poll_interval: int    # seconds

    async def fetch_documents(self, since: datetime | None) -> list[RawDocument]:
        """Fetch new documents since last successful poll."""
        ...

    async def health_check(self) -> bool:
        """Return True if the source is reachable."""
        ...
```

`RawDocument` is the adapter output contract:

```python
@dataclass
class RawDocument:
    external_id: str           # Source's own ID (e.g., RSS GUID)
    title: str
    body_text: str
    doc_type: str              # article, bulletin, filing, etc.
    original_language: str     # ISO 639-1
    published_at: datetime | None
    fetch_url: str | None
    metadata: dict             # Source-specific fields
    geometry: tuple[float, float] | None  # (lon, lat) if geolocated
```

---

## 4. Ingestion Pipeline

### 4.1 Document Ingestion

The ingestion pipeline runs per-source as a Celery task:

```
poll_source(source_id)
  → adapter.fetch_documents(since=last_success)
  → for each RawDocument:
      → compute content_hash = SHA-256(body_text)
      → check core.documents for (tenant_id, source_id, content_hash) uniqueness
      → if duplicate: skip
      → INSERT into core.documents
      → enqueue enrichment task
  → update source.last_polled_at
```

**Idempotency rule:** The `UNIQUE (tenant_id, source_id, content_hash)` index prevents duplicate documents. If a source returns the same content twice, the second insert is a no-op.

**Error handling:**
- If the source is unreachable: log warning, increment `consecutive_failures`, skip this cycle
- If `consecutive_failures` >= 5: mark source as `degraded`, extend poll interval to 4x normal
- If a single document fails parsing: log error, skip that document, continue with others
- Dead-letter queue: failed documents are published to Redis `narad:dlq:ingest` with error context

### 4.2 Claim Extraction

Claims are factual assertions extracted from documents. Phase 3A implements two extraction modes:

**Mode 1: Deterministic extraction (fast, no LLM)**
- Title → always becomes a claim with confidence 1.0
- First sentence of body → claim with confidence 0.9
- Named entities detected by regex patterns (CIN numbers, SEBI order numbers, gazette notification numbers)

**Mode 2: LLM extraction (Gemini 2.5 Flash)**
- Prompt: structured extraction requesting claims as JSON array
- Each claim: `{ "text": "...", "confidence": 0.7-0.95, "entities_mentioned": [...], "event_type_hint": "..." }`
- Model: `gemini-2.5-flash` for cost/speed (not Pro)
- Timeout: 10 seconds per document
- Fallback: if LLM fails or times out, use deterministic extraction only
- Rate limit: max 60 documents/minute to stay within free tier

**Claim storage:**
```sql
INSERT INTO core.claims (
  tenant_id, document_id, claim_text, confidence,
  extraction_model, lineage_hash, metadata
)
```

`lineage_hash = SHA-256(document.content_hash + extraction_model + claim_text)` ensures duplicate claims from the same source are never inserted twice.

### 4.3 Entity Resolution

Entity resolution matches references in claims/documents to canonical entity records.

**Step 1: Entity Mention Extraction**

From each claim, extract entity mentions:
- Regex patterns for structured IDs: CIN (`[A-Z]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}`), ISIN, SEBI registration numbers
- Title-case multi-word sequences (heuristic for organization/person names)
- LLM extraction when deterministic methods return no entities (same Gemini call as claim extraction)

**Step 2: Deterministic Matching (confidence = 1.0)**

Per the canonical ontology Section 8.1:
- Match on any unique external ID (`external_ids` JSONB field):
  - CIN/LLPIN (companies)
  - ISIN (securities)
  - ICAO24 (aircraft)
  - IMO (vessels)
  - ULPIN (land parcels)
- Match on exact `canonical_name` within same `entity_type` and `tenant_id`

**Step 3: Probabilistic Matching (confidence = 0.60–0.95)**

Per the canonical ontology Section 8.2:
1. **Name similarity:** pg_trgm `similarity(canonical_name, mention) > 0.7`
2. **Alias match:** Any alias in `aliases[]` matches with `similarity > 0.8`
3. **Type agreement:** Same `entity_type`
4. **Source overlap:** Entities from same high-trust source boost probability
5. **Temporal co-occurrence:** Entities in same event context boost probability

Composite score calculated as weighted average. Pairs scoring >= 0.85 are auto-merged. Pairs scoring 0.60–0.85 are logged for future human review (Phase 4).

**Step 4: Merge Strategy**

Per the canonical ontology Section 8.3:
- Canonical name: highest trust-tier source wins
- Aliases: union of all aliases
- External IDs: union (conflict = flag for review)
- Geometry: highest trust-tier source wins
- Risk score: recalculated after merge
- `resolved_from[]`: stores all merged entity UUIDs
- All FK references updated to surviving entity ID
- PostgreSQL advisory locks prevent concurrent merges on same entity

**Step 5: New Entity Creation**

If no match found:
- Create new entity in `core.entities`
- Set `is_resolved = FALSE` (unconfirmed)
- Link to originating document/claim via `core.event_entity_links`

### 4.4 Event Canonicalization

Events are deduplicated, normalized real-world incidents.

**Event creation trigger:** When a document is ingested, the pipeline determines if it describes a new event or corroborates an existing one.

**Deduplication criteria (canonical ontology Section 9.1):**

Two events are candidate duplicates if ALL of:
1. **Temporal proximity:** `occurred_at` within 24 hours
2. **Spatial proximity:** geometries < 50km apart (configurable per event_type)
3. **Type match:** same `event_type`
4. **Tenant match:** same `tenant_id`
5. **Entity overlap:** share at least one linked entity
6. **Title similarity:** `pg_trgm similarity > 0.7`

**Canonical event selection (Section 9.2):**
- Within a cluster, the event from the highest trust-tier source becomes canonical
- Other events become corroborating sources (`link_type = 'corroboration'`)
- `source_count` incremented on canonical event
- All events in cluster share `cluster_id`

**Contradiction handling (Section 9.3):**
- If a new source contradicts an existing canonical event: link with `link_type = 'contradiction'`
- Lower canonical event confidence
- Flag for analyst review

**Event type classification:**

Phase 3A implements a simple classification based on source + document metadata:
- PIB → `government_action`
- SEBI → `regulatory_action`
- eGazette → `legislative`
- IMD → `weather_disaster`
- CWC → `flood_risk`
- BSE/NSE → `corporate_announcement`
- India Code → `legislative`

Richer LLM-based classification is a Phase 3B enhancement.

### 4.5 Story Capsule Generation

Story capsules provide analyst-readable explanations for events.

**Structure:**
```python
class StoryCapsule:
    event_id: UUID
    headline: str       # ≤ 120 chars
    explanation: str    # 2-4 sentences
    evidence_summary: str  # Source attribution
    confidence: float
    generated_by: str   # "gemini-2.5-flash" or "deterministic"
```

**Generation modes:**

**Deterministic (immediate, for every event):**
- Headline: document title (truncated to 120 chars)
- Explanation: first 2 sentences of body text
- Evidence: "Based on {source_name}, published {published_at}"
- Confidence: inherits from source trust tier

**LLM-enhanced (async, batched):**
- Prompt: given the event, its linked claims, and source documents, generate a capsule
- Model: `gemini-2.5-flash`
- Batch size: 10 events per LLM call (context window allows it)
- Timeout: 15 seconds
- Fallback: keep deterministic capsule if LLM fails
- Output flagged as `ai_generated = true, human_verified = false`

**Update rule:** LLM capsule overwrites deterministic capsule only if confidence >= 0.7.

### 4.6 Embedding Generation

Embeddings enable semantic search and similarity-based dedup.

**Model:** Google `text-embedding-004` (768 dimensions, matches pgvector column)

**Targets:**
- `core.documents.embedding` — document-level semantic search
- `core.entities.embedding` — entity similarity for resolution
- `core.events.embedding` — event similarity for dedup clustering

**Batch processing:**
- Celery task processes batches of 50 items (configurable `EMBED_BATCH_SIZE`)
- Single SQL update: `UPDATE ... WHERE id = ANY($1::uuid[]) SET embedding = ...`
- Rate limit: 1500 embeddings/minute (API limit)
- Queue: `enrichment` queue, separate from ingestion

**Fallback:** If embedding API is unavailable, items remain with `embedding = NULL`. All queries that use embeddings must handle NULL gracefully (fall back to text search).

---

## 5. Projection Rebuild Triggers

When the pipeline produces new data, projections must be refreshed:

| Pipeline Event | Projection Affected | Trigger |
|---|---|---|
| New event canonicalized | `projections.pulseboard_feed` | Immediate task |
| Event updated (new corroboration) | `projections.pulseboard_feed` | Immediate task |
| New entity created/merged | `projections.entity_summaries` | Immediate task |
| New regulatory event | `projections.regulatory_digest` | Immediate task |
| Watchlist alert created | `projections.watchlist_deltas` | Immediate task |

After projection upsert, the projection worker publishes a delta envelope to the appropriate Redis channel:

```python
await redis.publish(f"narad:{channel}", json.dumps({
    "channel": f"narad:{channel}",
    "tenant_id": str(tenant_id),
    "entity_type": entity_type,
    "entity_id": str(entity_id),
    "changes": {"action": "upsert"},
    "timestamp": datetime.now(UTC).isoformat(),
}))
```

This triggers the WebSocket gateway to push to connected browsers, which invalidate React Query caches and update Zustand stores.

---

## 6. Error Handling and Observability

### 6.1 Dead-Letter Queue

Failed pipeline stages publish to Redis lists:

| DLQ Key | Contents |
|---|---|
| `narad:dlq:ingest` | Documents that failed parsing/storage |
| `narad:dlq:enrichment` | Documents that failed claim extraction or embedding |
| `narad:dlq:entity` | Entity resolution failures |
| `narad:dlq:event` | Event canonicalization failures |

Each DLQ entry includes:
```json
{
  "task_id": "...",
  "source_slug": "pib",
  "document_id": "...",
  "error": "Gemini API timeout after 10s",
  "timestamp": "2026-03-29T10:00:00Z",
  "retry_count": 3
}
```

Admin API endpoint `GET /api/admin/dlq` lists pending failures.
Admin API endpoint `POST /api/admin/dlq/{key}/retry` requeues items.

### 6.2 Source Health Dashboard

Each source tracks:
- `last_polled_at` — when the adapter last ran
- `last_success_at` — when it last returned documents
- `consecutive_failures` — resets on success
- `status` — `active`, `degraded`, `disabled`
- `documents_fetched_total` — lifetime counter
- `events_produced_total` — lifetime counter

Admin API endpoint `GET /api/admin/sources` returns health for all sources.

### 6.3 Structured Logging

All pipeline stages log with consistent fields:
```python
logger.info(
    "document_ingested",
    source_slug=source.slug,
    document_id=str(doc.id),
    content_hash=doc.content_hash,
    claims_extracted=claim_count,
    duration_ms=duration,
)
```

Log format: JSON lines (machine-parseable).

### 6.4 Circuit Breaker

Implemented in `BaseSourceAdapter`:
- After 5 consecutive failures: open circuit, stop polling
- After 5 minutes: half-open, try one request
- On success: close circuit, resume normal polling
- On failure: re-open circuit, double backoff (max 30 minutes)

---

## 7. Configuration

New environment variables for Phase 3A:

```env
# LLM
GEMINI_API_KEY=                     # Google AI API key
GEMINI_MODEL=gemini-2.5-flash       # Model for extraction/capsules
GEMINI_EMBEDDING_MODEL=text-embedding-004
GEMINI_MAX_RPM=60                   # Requests per minute limit
GEMINI_TIMEOUT_SECONDS=10           # Per-request timeout

# Ingestion
INGEST_BATCH_SIZE=20                # Documents per poll cycle
INGEST_MAX_CONCURRENT_SOURCES=4     # Parallel source polling
EMBED_BATCH_SIZE=50                 # Embeddings per batch

# Entity Resolution
ENTITY_TRGM_THRESHOLD=0.7          # pg_trgm similarity cutoff
ENTITY_AUTO_MERGE_THRESHOLD=0.85    # Auto-merge score cutoff
ENTITY_REVIEW_THRESHOLD=0.60       # Human review score cutoff

# Event Dedup
EVENT_TEMPORAL_WINDOW_HOURS=24      # Dedup time window
EVENT_SPATIAL_PROXIMITY_KM=50       # Dedup distance
EVENT_TITLE_SIMILARITY_THRESHOLD=0.7

# Circuit Breaker
SOURCE_CIRCUIT_BREAKER_THRESHOLD=5  # Failures before open
SOURCE_CIRCUIT_BREAKER_TIMEOUT=300  # Seconds before half-open
SOURCE_MAX_BACKOFF_SECONDS=1800     # Max backoff (30 min)
```

---

## 8. Database Changes

### 8.1 New Migration: `012_phase_3a_pipeline.sql`

```sql
-- Source health tracking columns
ALTER TABLE core.sources ADD COLUMN IF NOT EXISTS last_polled_at TIMESTAMPTZ;
ALTER TABLE core.sources ADD COLUMN IF NOT EXISTS last_success_at TIMESTAMPTZ;
ALTER TABLE core.sources ADD COLUMN IF NOT EXISTS consecutive_failures INTEGER NOT NULL DEFAULT 0;
ALTER TABLE core.sources ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'degraded', 'disabled'));
ALTER TABLE core.sources ADD COLUMN IF NOT EXISTS documents_fetched_total BIGINT NOT NULL DEFAULT 0;
ALTER TABLE core.sources ADD COLUMN IF NOT EXISTS events_produced_total BIGINT NOT NULL DEFAULT 0;

-- Entity resolution tracking
ALTER TABLE core.entities ADD COLUMN IF NOT EXISTS last_resolved_at TIMESTAMPTZ;
ALTER TABLE core.entities ADD COLUMN IF NOT EXISTS resolution_confidence NUMERIC(3,2);

-- Event clustering support index
CREATE INDEX IF NOT EXISTS idx_events_dedup_candidates
    ON core.events (tenant_id, event_type, occurred_at DESC)
    WHERE status != 'invalidated' AND occurred_at IS NOT NULL;

-- Entity name similarity index (pg_trgm)
CREATE INDEX IF NOT EXISTS idx_entities_name_trgm
    ON core.entities USING gin (canonical_name gin_trgm_ops);

-- Dead-letter tracking table
CREATE TABLE IF NOT EXISTS core.dead_letter_queue (
    id UUID NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
    tenant_id UUID NOT NULL,
    queue_name TEXT NOT NULL,
    task_name TEXT NOT NULL,
    payload JSONB NOT NULL,
    error_message TEXT NOT NULL,
    retry_count INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 3,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ
);

CREATE INDEX ON core.dead_letter_queue (queue_name, resolved_at)
    WHERE resolved_at IS NULL;

-- Source seed data for the 8 Tier 1 sources
INSERT INTO core.sources (id, tenant_id, name, slug, trust_tier, source_type, base_url, poll_interval_seconds, is_active, metadata)
SELECT
    uuid_generate_v7(),
    t.id,
    s.name,
    s.slug,
    1,
    s.source_type,
    s.base_url,
    s.poll_interval,
    TRUE,
    s.metadata::jsonb
FROM core.tenants t
CROSS JOIN (VALUES
    ('Press Information Bureau', 'pib', 'rss', 'https://pib.gov.in/RssMain.aspx', 300, '{}'),
    ('SEBI RSS', 'sebi-rss', 'rss', 'https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListingAll=yes&type=rss', 900, '{}'),
    ('Gazette of India', 'egazette', 'web_scrape', 'https://egazette.gov.in', 1800, '{}'),
    ('India Meteorological Department', 'imd', 'web_scrape', 'https://mausam.imd.gov.in', 600, '{}'),
    ('Central Water Commission', 'cwc', 'web_scrape', 'https://ffs.india-water.gov.in', 900, '{}'),
    ('BSE India', 'bse-rss', 'rss', 'https://www.bseindia.com/markets/rss.aspx', 600, '{}'),
    ('NSE India', 'nse-rss', 'rss', 'https://www.nseindia.com/api/rss', 600, '{}'),
    ('India Code', 'india-code', 'web_scrape', 'https://www.indiacode.nic.in', 3600, '{}')
) AS s(name, slug, source_type, base_url, poll_interval, metadata)
WHERE NOT EXISTS (SELECT 1 FROM core.sources WHERE slug = s.slug AND tenant_id = t.id);

-- Grants for worker role
GRANT SELECT, INSERT, UPDATE ON core.dead_letter_queue TO narad_ingest_writer;
```

---

## 9. Testing Strategy

### Unit Tests
- Adapter parsing: feed each adapter known RSS/HTML fixtures, verify `RawDocument` output
- Claim extraction: test deterministic mode with known inputs
- Entity matching: test similarity scoring with known name pairs
- Event dedup: test temporal/spatial/title matching with synthetic events

### Integration Tests
- Full pipeline: ingest a PIB RSS fixture → verify document, claims, entities, events, projections all created correctly
- Dedup: ingest the same document twice → verify no duplicates
- Entity merge: ingest two documents referencing the same company by CIN → verify single entity

### Smoke Tests
- Poll PIB RSS feed → verify at least 1 document ingested
- Verify PulseBoard API returns real events after ingestion
- Verify GeoStrat events endpoint returns geolocated items (from IMD/CWC)

---

## 10. Success Criteria

Phase 3A is complete when:
1. All 8 Tier 1 sources are polling successfully with `status = 'active'`
2. Documents are deduplicated (same content never stored twice)
3. Entities are resolved (deterministic matching works for structured IDs)
4. Events are canonicalized with proper dedup clustering
5. Story capsules are generated (at least deterministic mode)
6. Projections are rebuilt and PulseBoard shows real government intelligence
7. GeoStrat shows real weather/flood events from IMD/CWC
8. Redis pub/sub publishes deltas and the gateway delivers them to browsers
9. Dead-letter queue captures pipeline failures without crashing workers
10. Source health endpoint reports correct status for all 8 sources

---

## 11. Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                        Celery Beat (scheduler)                       │
│  poll-active-sources (60s) │ flush-embeddings (30s) │ maintenance    │
└──────────┬───────────────────────────┬───────────────────────────────┘
           │                           │
           ▼                           ▼
┌─────────────────────┐    ┌─────────────────────────┐
│   Ingest Queue      │    │   Enrichment Queue       │
│                     │    │                           │
│  poll_source(id)    │    │  extract_claims(doc_id)   │
│  └→ adapter.fetch() │    │  resolve_entities(doc_id) │
│  └→ dedup check     │    │  generate_embeddings()    │
│  └→ INSERT document  │    │  generate_capsule(evt_id) │
│  └→ enqueue enrich  │    │  canonicalize_event()     │
└─────────┬───────────┘    └──────────┬────────────────┘
          │                            │
          ▼                            ▼
┌─────────────────────┐    ┌─────────────────────────┐
│   PostgreSQL        │    │   Projection Queue       │
│                     │    │                           │
│  core.documents     │    │  rebuild_pulseboard()     │
│  core.claims        │    │  rebuild_entity_summary() │
│  core.entities      │    │  rebuild_regulatory()     │
│  core.events        │    │  rebuild_watchlist()      │
│  core.story_capsules│    └──────────┬────────────────┘
└─────────────────────┘               │
                                      ▼
                           ┌─────────────────────────┐
                           │   Redis Pub/Sub          │
                           │                           │
                           │  narad:pulseboard:event   │
                           │  narad:entity:updated     │
                           │  narad:regulatory:*       │
                           └──────────┬────────────────┘
                                      │
                                      ▼
                           ┌─────────────────────────┐
                           │   WebSocket Gateway      │
                           │   → Browser (PulseBoard)  │
                           │   → Browser (GeoStrat)    │
                           └───────────────────────────┘
```

---

## 12. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Gemini API rate limits exceeded | Medium | Pipeline stalls | Rate limiter + deterministic fallback for all LLM-dependent stages |
| Government RSS feeds change format | Medium | Adapter breaks | Defensive parsing with fallback, health checks, DLQ |
| Entity resolution false positives (wrong merge) | Low | Data corruption | Conservative auto-merge threshold (0.85), advisory locks, `resolved_from[]` for undo |
| Embedding API unavailable | Low | No semantic search | All embedding-dependent queries fall back to pg_trgm text search |
| Pipeline creates too many events (no dedup) | Medium | PulseBoard noise | Title similarity + temporal + spatial dedup gates, source_count tracking |
| Celery workers crash under load | Low | Data loss | Task retry (3x), DLQ capture, idempotent operations |
