# NARAD V2 — Phase 1 Complete: Canonical Intelligence Model

**Phase:** 1 of 7
**Session:** Session 1
**Status:** ✅ Complete
**Completed:** 2026-03-27
**Deliverable:** `docs/architecture/canonical_ontology.md` (1,174 lines, Draft v2)

---

## Table of Contents

1. [What is NARAD V2?](#1-what-is-narad-v2)
2. [Why Phase 1 Came First](#2-why-phase-1-came-first)
3. [What Phase 1 Produced](#3-what-phase-1-produced)
4. [Technology Stack and Why](#4-technology-stack-and-why)
5. [Schema Architecture — The 7 PostgreSQL Schemas](#5-schema-architecture--the-7-postgresql-schemas)
6. [Core Schema — The Canonical Write Model](#6-core-schema--the-canonical-write-model)
7. [Workflow Schema — Analyst Tools](#7-workflow-schema--analyst-tools)
8. [CQRS Architecture — Commands, Queries, and Projections](#8-cqrs-architecture--commands-queries-and-projections)
9. [Domain-Driven Design Layer](#9-domain-driven-design-layer)
10. [Postgres Engineering Decisions](#10-postgres-engineering-decisions)
11. [Entity Resolution System](#11-entity-resolution-system)
12. [Event Deduplication and Clustering](#12-event-deduplication-and-clustering)
13. [Dark Archive — DPDPA Compliance](#13-dark-archive--dpdpa-compliance)
14. [TimescaleDB Hypertables](#14-timescaledb-hypertables)
15. [Security — RBAC and Row-Level Security](#15-security--rbac-and-row-level-security)
16. [Open Questions and Suggested Defaults](#16-open-questions-and-suggested-defaults)
17. [What Phase 2 Will Build](#17-what-phase-2-will-build)

---

## 1. What is NARAD V2?

NARAD V2 is a **sovereign intelligence operating system** designed for India — a platform that ingests, processes, correlates, and presents intelligence from 32 data sources across government, regulatory, corporate, geospatial, and open-source domains. It is built for analysts, investigators, and decision-makers who need a unified intelligence picture of what is happening across India in real time.

### The 7 Workspaces

| Workspace | Purpose |
|---|---|
| **GeoStrat** | Real-time geospatial intelligence — aircraft, vessels, fires, infrastructure on a 3D map |
| **PulseBoard** | Live event feed — breaking news, incidents, regulatory actions ranked by severity and trust |
| **CorpWatch** | Corporate intelligence — company profiles, ownership graphs, compliance status, risk scores |
| **LexPulse** | Regulatory intelligence — bills, gazette notifications, court orders, legislative changes |
| **Watchlists** | Persistent monitoring — analyst-defined alerts on entities, events, or geographies |
| **Investigations** | Case management — evidence chain-of-custody, hypothesis tracking, collaborative case files |
| **Briefings** | Intelligence products — formatted, versioned intelligence reports with approval workflows |

### Core Principles

- **One canonical data model** — 32 sources all write to the same object types. No per-source tables.
- **No LLM in the hot path** — all AI processing happens asynchronously. UI always reads from pre-computed projections.
- **Sovereign design** — Indian data law (DPDPA) compliance built into the schema from day one.
- **CQRS architecture** — writes go through the intelligence pipeline (Python/Celery), reads come from precomputed projections (Next.js).

---

## 2. Why Phase 1 Came First

Before writing a single line of application code, NARAD V2 needed a **canonical ontology** — a complete, validated definition of every object the system would store, how they relate, how they are queried, and what business rules govern them.

### The Problem with Scaffolding First

If we scaffolded the backend (FastAPI + Celery + Postgres) before defining the data model, we would face:

1. **Schema churn** — every table would be rewritten as requirements became clear
2. **Divergence** — frontend, backend, and ingestion would develop conflicting assumptions about what an "event" or "entity" is
3. **Wasted migrations** — dozens of ALTER TABLE statements before any real data arrives
4. **No shared language** — team members using different terminology for the same concepts

### Why the Ontology is the Foundation

Every component downstream depends on the canonical ontology:
- **SQL DDL migrations** are generated directly from it
- **API contract design** is derived from the read projections it defines
- **Frontend state management** (Zustand slices) mirrors the projection schemas
- **Ingestion pipeline** writes conform to the aggregate invariants it specifies
- **Test data** is structured to match its object model

Establishing the ontology first means all of Session 2–7 can proceed without architectural rework.

---

## 3. What Phase 1 Produced

A single file: `docs/architecture/canonical_ontology.md` — **1,174 lines** covering:

| Section | Content |
|---|---|
| Schema Boundaries | 7 PostgreSQL schemas with ownership rules |
| DDD Strategic Model | Subdomain classification, aggregate boundaries, ubiquitous language |
| Shared Conventions | IDs, timestamps, tenancy, connection management, indexes |
| Core Schema (12 objects) | tenants, users, sources, documents, entities, events, claims, relationships, links, impacts, story_capsules |
| Workflow Schema (11 objects) | watchlists, watchlist_items, watchlist_rules, watchlist_alerts, investigations, investigation_items, investigation_evidence, evidence_custody_log, investigation_notes, briefings, briefing_versions |
| Domain-Specific Schemas | corp_watch.entity_profiles, lex_pulse.regulatory_events, lex_pulse.semantic_cache, geo_intelligence.layer_configs |
| Audit Schema | audit_log, state_transitions, evidence_access |
| CQRS Projections | pulseboard_feed, watchlist_deltas, entity_summaries, regulatory_digest |
| CQRS Command/Query Spec | 7 write commands, 6 read queries |
| Projection Rebuild Protocol | 5-step zero-downtime rebuild |
| Data Access Patterns | Batch INSERTs, UPSERTs, cursor pagination, SKIP LOCKED, short transactions |
| Entity Resolution Rules | Deterministic + probabilistic matching, merge strategy |
| Event Deduplication | Clustering criteria, canonical selection, contradiction handling |
| Dark Archive Protocol | DPDPA erasure compliance with referential integrity |
| TimescaleDB Setup | Hypertable for telemetry, retention, compression |
| Monitoring | Extensions, pg_stat_statements, autovacuum tuning |
| Open Questions | 12 architectural decisions documented with suggested defaults |

The document went through two revision cycles:

1. **Draft v1** — initial comprehensive schema design
2. **Draft v2** — revised after validation against: `postgres-best-practices`, `database-design`, `domain-driven-design`, `cqrs-implementation`, `architecture-patterns`, `backend-dev-guidelines`

---

## 4. Technology Stack and Why

### PostgreSQL 16 (Primary Database)

**Why:** PostgreSQL is the only open-source database that natively supports all of NARAD's requirements in a single engine: JSONB for flexible metadata, PostGIS for geospatial queries, pgvector for semantic search, full-text search via tsvector, Row-Level Security for multi-tenancy, and LISTEN/NOTIFY for event propagation.

**Key extensions required:**
```sql
CREATE EXTENSION pg_uuidv7;       -- Time-ordered UUID v7 primary keys
CREATE EXTENSION postgis;         -- Spatial types: GEOMETRY, GIST indexes, distance queries
CREATE EXTENSION timescaledb;     -- Hypertables, retention policies, compression
CREATE EXTENSION vector;          -- pgvector: 768-dimensional embeddings, HNSW indexes
CREATE EXTENSION pg_trgm;         -- Trigram similarity for entity resolution
CREATE EXTENSION pg_stat_statements; -- Query performance monitoring
```

### TimescaleDB

**Why:** Aircraft positions (OpenSky) and fire detections (NASA FIRMS) produce thousands of rows per second. Regular Postgres tables would grow unbounded and queries would slow as the table hits billions of rows. TimescaleDB automatically partitions this data by time, applies retention policies (drop data older than 7 days), enables columnar compression after 1 day, and provides continuous aggregates (hourly/daily rollups) for historical views — all without changing the SQL interface.

### pgvector

**Why:** NARAD needs to find semantically similar events ("find other protests like this one"), similar entities, similar documents, and similar regulatory changes. Cosine similarity on 768-dimensional vector embeddings (generated by Gemini `text-embedding-004`) enables this. HNSW (Hierarchical Navigable Small World) indexes provide approximate nearest-neighbor search at millisecond latency.

### PostGIS

**Why:** GeoStrat workspace requires spatial queries — "show all events within 50km of this point", "find all entities in Maharashtra", "calculate distance between two coordinates". PostGIS provides `GEOMETRY` columns, GIST spatial indexes, and functions like `ST_DWithin`, `ST_Distance`, `ST_AsGeoJSON`.

### Redis

**Why (two purposes):**
1. **Pub/sub event bus** — when a canonical event is written, Python workers publish a notification to Redis channels that projection workers subscribe to, triggering async projection updates
2. **Real-time UI push** — WebSocket microservice bridges Redis pub/sub to the browser for live updates on the PulseBoard

### Python (FastAPI + Celery)

**Why:** The intelligence plane (ingestion, NLP, LLM processing, entity resolution) is CPU-bound and I/O-bound with long-running tasks. Celery's distributed task queue enables:
- Parallel scraping across 32 sources
- Retry on failure with exponential backoff
- Rate limiting per source
- Priority queues (urgent breaking events vs background enrichment)

FastAPI provides the command API surface that Celery workers expose.

### Next.js 15 (Frontend + Read API)

**Why:** Next.js Server Components can query the projections database directly, bypassing a separate API layer for read operations. This eliminates a network hop. The App Router provides nested layouts that enable zero-cost tab switching between the 7 workspaces (layout persists, only workspace content re-renders).

### PgBouncer (Connection Pooler)

**Why:** At production load, NARAD will have dozens of Celery workers + Next.js instances all needing database connections. PostgreSQL has a hard limit on concurrent connections (typically 100-200 before performance degrades). PgBouncer in **transaction mode** multiplexes hundreds of app-level connections onto a small pool of real Postgres connections. Transaction mode is required because session-level state (prepared statements, session variables) is incompatible with multiplexing.

---

## 5. Schema Architecture — The 7 PostgreSQL Schemas

PostgreSQL schemas act as module boundaries within a single database, enabling fine-grained access control without the overhead of multiple databases.

```
narad_db
├── core              ← Canonical write model (the truth)
├── workflow          ← Analyst workflows (reference core, never copy)
├── geo_intelligence  ← GeoStrat layer registry and tile config
├── corp_watch        ← Corporate intelligence projections
├── lex_pulse         ← Regulatory projections and RAG cache
├── audit             ← Immutable audit trail
└── projections       ← CQRS read models (precomputed JSONB)
```

### The Critical Rule

**Only `core` and `workflow` schemas perform INSERT/UPDATE on canonical objects.** Every other schema holds derived or projected data that can be rebuilt from scratch by replaying canonical data. This is what makes the system resilient — projections are not the source of truth, they are a cache of it.

### DDD Subdomain Classification

Domain-Driven Design categorizes subdomains by their business value:

| Subdomain Type | Schemas | What It Means |
|---|---|---|
| **Core** (highest value, most unique) | `core`, `workflow` | This is what makes NARAD different from any off-the-shelf product. The canonical object model and analyst workflow system are irreplaceable business logic. |
| **Supporting** (necessary but not differentiating) | `geo_intelligence`, `corp_watch`, `lex_pulse` | These provide necessary enrichment and workspace-specific projections, but could theoretically be implemented with third-party tools. |
| **Generic** (standard cross-cutting concerns) | `audit`, `projections` | Standard patterns (audit logging, CQRS materialized views) that are important but not unique. |

---

## 6. Core Schema — The Canonical Write Model

The `core` schema contains 12 objects that represent every real-world thing NARAD tracks.

### 6.1 Tenants and Users

**`core.tenants`** — NARAD is multi-tenant. Each organization (a ministry, a media house, an intelligence agency) has its own tenant. Every row in every table carries `tenant_id` for isolation.

**`core.users`** — 6 roles with ABAC clearance levels:
- Roles: `viewer`, `analyst`, `senior_analyst`, `approver`, `admin`, `dpo`
- Clearance: `unclassified`, `restricted`, `confidential`, `secret`
- Clearance gates which events/investigations/briefings a user can see at the row level.

### 6.2 Sources

**`core.sources`** — Every data feed NARAD ingests from is registered here. This is what enables the trust tier system.

**Trust Tiers:**
- **Tier 1:** Government source-of-record (PIB, MCA21, SEBI filings, eGazette) — highest confidence
- **Tier 2:** Structured enrichment (BSE/NSE data, OpenSky ADS-B, IPA AIS) — high confidence
- **Tier 3:** Controlled/licensed (third-party data providers) — requires `governance_approved = TRUE` before ingestion

Trust tier flows through to event confidence, entity resolution priority, and search ranking.

### 6.3 Documents

**`core.documents`** — The raw ingested artifact before any intelligence is extracted. An article, a PDF gazette notification, a company filing, a telemetry batch, a satellite image — all stored as documents.

Key design decisions:
- `content_hash` (SHA-256) prevents ingesting the same document twice from the same source
- `body_text` stores extracted plain text; `translated_text` stores Bhashini's English translation
- `tsv TSVECTOR` column maintained by trigger enables full-text search
- `embedding vector(768)` generated asynchronously enables semantic search
- `s3_key` stores the original artifact in object storage (S3/R2)

### 6.4 Entities

**`core.entities`** — The canonical real-world object registry. Companies, people, ministries, districts, ports, airports, vessels, aircraft — all are entities.

This is the most important table in the system. Every other piece of intelligence links back to entities. Instead of having separate tables for "MCA companies" vs "BSE-listed companies" vs "companies mentioned in court orders", there is one `entities` table. Entity resolution merges multiple source-specific references into a single canonical entity record.

Entity types: `company`, `person`, `ministry`, `regulator`, `district`, `state`, `port`, `airport`, `railway_station`, `nuclear_facility`, `vessel`, `aircraft`, `parcel`, `project`, `organization`, `military_installation`

**External IDs** stored in `external_ids JSONB` enable deterministic matching:
- CIN (MCA) — Corporate Identity Number
- ISIN (BSE/NSE) — securities identifier
- ICAO24 (OpenSky) — unique aircraft transponder code
- IMO (IPA) — International Maritime Organization vessel number
- ULPIN (DILRMP) — Unique Land Parcel Identification Number

**Risk and Health Scores** (0–100, computed deterministically from inputs, not LLM-generated):
- `risk_score` — composite of compliance breaches, event severity, regulatory actions
- `health_score` — entity viability (filing completeness, director status, financial health)
- Both include `_inputs JSONB` breakdown for transparency and auditability

### 6.5 Events

**`core.events`** — A canonical real-world incident, occurrence, or state change. This is what appears on the PulseBoard.

After deduplication and clustering, one canonical event represents an occurrence regardless of how many sources reported it. `source_count` tracks corroboration strength.

**Lifecycle state machine:**
```
ingested → canonicalized → enriched → in_investigation → resolved
                                    ↘ invalidated
```
Every transition logged in `audit.state_transitions`.

**Event types** cover the full intelligence spectrum: `conflict`, `protest`, `disaster`, `weather`, `regulatory`, `corporate`, `legislative`, `infrastructure`, `security`, `environment`, `transport`, `economic`, `health`, `political`, `judicial`, `fire`, `maritime`, `aviation`

**Geometry columns:**
- `geometry GEOMETRY(Point, 4326)` — primary location (WGS84)
- `geometry_area GEOMETRY(Polygon, 4326)` — for area-effect events (floods, wildfire spread)

### 6.6 Claims

**`core.claims`** — A single factual assertion extracted from a document.

When an LLM reads a gazette notification, it might extract 5 claims: "Ministry X issued order Y", "Order Y amends Section 3 of Act Z", "Effective date is April 1", "Applies to sectors A, B, C", "Penalty for non-compliance is INR 10 crore".

Each claim carries:
- `confidence` — model confidence score
- `lineage_hash` — SHA-256 of (document_id + extraction_model + claim_text) for full provenance
- `is_verified` / `verified_by` — human review checkpoint (Verification Gate pattern)
- `extraction_model` + `extraction_model_version` — which AI model produced this claim

### 6.7 Relationships

**`core.relationships`** — Directed, temporal, confidence-scored links between entities. This is the graph layer.

Relationship types: `ownership`, `directorship`, `subsidiary`, `parent`, `partner`, `supplier`, `customer`, `regulator`, `regulated_by`, `located_in`, `operates_at`, `successor`, `predecessor`, `affiliated`, `joint_venture`, `legal_action`

Every relationship has:
- `valid_from` / `valid_until` — temporal validity (a director resigned, a subsidiary was divested)
- `confidence` — how certain we are this relationship exists
- `lineage_hash` — provenance fingerprint
- `source_document_id` — the document that established this relationship

### 6.8 Story Capsules

**`core.story_capsules`** — An AI-generated explanatory bundle attached to a canonical event.

Generated asynchronously (never blocking the ingestion pipeline), a story capsule contains:
- `headline` — one-line summary
- `explanation` — 3–5 sentence plain-language explanation
- `key_facts` — JSONB array of extracted key points
- `evidence_bundle` — JSONB array of `{document_id, relevance_score, excerpt}` proving the explanation
- `prompt_hash` — hash of the generation prompt for reproducibility audits
- `expires_at` — TTL for the cache (events become stale as they resolve)

The `ai_model` and `ai_model_version` fields ensure every AI-generated piece of content is traceable to the exact model that produced it.

---

## 7. Workflow Schema — Analyst Tools

The `workflow` schema contains the analyst-facing tooling that operates on canonical objects without copying or modifying them.

### 7.1 Watchlists

A watchlist monitors a set of entities, events, or geographies and fires alerts when defined conditions are met.

Three-layer design:
1. **`workflow.watchlists`** — the container (owner, name, active/inactive)
2. **`workflow.watchlist_items`** — what to monitor (entity IDs, geography polygons, event types)
3. **`workflow.watchlist_rules`** — declarative alerting conditions in JSON Logic format
4. **`workflow.watchlist_alerts`** — generated alerts with full lifecycle management

**Alert lifecycle:**
```
new → triaged → assigned → acknowledged → in_progress → resolved
                                                      ↘ suppressed
```

**Episode grouping** — related alerts for the same underlying situation are grouped by `episode_id`, preventing alert fatigue when one incident triggers multiple rules.

### 7.2 Investigations

Full case management with chain-of-custody evidence handling.

Five-layer design:
1. **`workflow.investigations`** — the case container with classification and status
2. **`workflow.investigation_items`** — canonical objects linked into the case (events, entities, documents, claims) with analyst-assigned roles (key_evidence, supporting, context, lead, exculpatory, disputed)
3. **`workflow.investigation_evidence`** — digital evidence with SHA-256 hash at intake (proves nothing was tampered after collection)
4. **`workflow.evidence_custody_log`** — INSERT-ONLY immutable log of every action taken on evidence (viewed, exported, verified, challenged, transferred) with IP address and hash re-verification
5. **`workflow.investigation_notes`** — analyst notes, hypotheses, task tracking, and AI-generated drafts pending human verification

**Investigation lifecycle:**
```
draft → under_review → active → on_hold → closed → archived
                              ↘ closed (can skip on_hold)
```

### 7.3 Briefings

Intelligence products with formal approval workflows and version control.

- **`workflow.briefings`** — the container with approval status and supersession chain
- **`workflow.briefing_versions`** — immutable version snapshots (sections stored as JSONB array)

**Briefing lifecycle:**
```
draft → under_review → approved → published → superseded
                                             ↘ withdrawn
```

**Versioning rules:**
- `version_number` is monotonically increasing (enforced by aggregate invariant)
- Only `approved` status can transition to `published`
- `supersedes_id` must point to a published briefing (prevents orphaned supersession)

---

## 8. CQRS Architecture — Commands, Queries, and Projections

CQRS (Command Query Responsibility Segregation) is the central architectural pattern of NARAD V2. It solves the fundamental tension between write-heavy intelligence ingestion (complex, asynchronous, AI-driven) and read-heavy UI serving (simple, fast, predictable).

### The Problem CQRS Solves

Without CQRS, every request to the PulseBoard would need to:
1. Query `core.events` (millions of rows)
2. JOIN to `core.entities` (via event_entity_links)
3. JOIN to `core.story_capsules`
4. JOIN to `core.sources`
5. Filter, sort, paginate
6. Serialize to JSON

This is expensive and gets slower as data grows. With CQRS, all of that computation happens once (asynchronously when events are written) and the result is stored in a single-row JSONB projection. The PulseBoard reads one table with zero joins.

### Write Side — 7 Commands

All executed by Python FastAPI/Celery workers:

| Command | What It Does | Aggregate |
|---|---|---|
| `IngestDocument` | Fetch URL/API, extract text, compute content_hash, store if new, trigger downstream | Document |
| `ExtractClaims` | Run NLP/LLM on document body, store claims with lineage hashes | Document → Claims |
| `CanonicalizeEvent` | Cluster candidate events, deduplicate, create/update canonical event | Event |
| `ResolveEntity` | Match new entity mentions against existing entities, merge if confident | Entity |
| `GenerateStoryCapsule` | LLM synthesis of evidence bundle into headline + explanation | Event → StoryCapsule |
| `EvaluateWatchlistRules` | Run JSON Logic rules against new events/entities, create alerts | WatchlistAlert |
| `TransitionState` | Advance state machines for events/investigations/briefings, validate transitions | Event / Investigation / Briefing |

**Every command handler follows this pattern:**
1. Validate aggregate invariants (fail fast, no partial writes)
2. Persist to canonical write model
3. Emit domain event via Redis pub/sub to trigger projection updates
4. Log to `audit.audit_log`

### Read Side — 6 Queries

All served by Next.js API routes, all read from precomputed projection tables:

| Query | Reads From | Use Case |
|---|---|---|
| `GetPulseBoardFeed(tenant_id, filters, cursor)` | `projections.pulseboard_feed` | PulseBoard event card stream |
| `GetEntitySummary(entity_id)` | `projections.entity_summaries` | Entity slide-over panels, CorpWatch profiles |
| `GetRegulatoryDigest(tenant_id, filters)` | `projections.regulatory_digest` | LexPulse regulatory feed |
| `GetWatchlistDeltas(watchlist_id)` | `projections.watchlist_deltas` | Watchlist change notifications |
| `SearchEvents(query, filters)` | `core.events` direct (hybrid BM25+vector) | Full-text + semantic search |
| `GetEventDetail(event_id)` | Direct join: events + story_capsules + entity_links | Event detail panels |

### Projection Staleness

| Projection | Max Staleness | Trigger |
|---|---|---|
| `pulseboard_feed` | 500ms | Event write, story capsule generation |
| `watchlist_deltas` | 1s | Event write, entity update, alert generation |
| `entity_summaries` | 5s | Entity update, relationship change, event link |
| `regulatory_digest` | 5s | Regulatory event write |

The UI shows a "refreshing" indicator when a write is acknowledged but the projection hasn't updated yet. This maintains user trust while allowing eventual consistency.

### PulseBoard Feed Card Structure

Each row in `projections.pulseboard_feed` stores a pre-assembled JSONB card:

```json
{
  "title": "SEBI imposes penalty on Adani Enterprises",
  "summary": "SEBI has imposed a fine of INR 15 crore on Adani Enterprises for...",
  "severity": "high",
  "confidence": 0.87,
  "source_trust_tier": 1,
  "source_count": 3,
  "place": {"state": "Maharashtra", "district": "Mumbai", "lat": 19.07, "lng": 72.87},
  "occurred_at": "2026-03-26T10:00:00Z",
  "event_type": "corporate",
  "linked_entity_ids": ["uuid1", "uuid2"],
  "linked_entity_names": ["Adani Enterprises", "SEBI"],
  "story_capsule": {"headline": "SEBI fines Adani INR 15cr", "explanation": "..."},
  "has_evidence": true
}
```

The Next.js API just reads this row and returns it. No computation at read time.

### Projection Rebuild Protocol (Zero-Downtime)

When projection logic must change (bug fix, schema migration):

1. `CREATE TABLE projections.pulseboard_feed_v2 ...`
2. Batch rebuild from `core.events` using **cursor-based pagination** (never OFFSET — see Section 10)
3. Validate: row count matches, spot-check JSONB integrity on 100 random rows
4. `BEGIN; ALTER TABLE projections.pulseboard_feed RENAME TO pulseboard_feed_old; ALTER TABLE projections.pulseboard_feed_v2 RENAME TO pulseboard_feed; COMMIT;`
5. `DROP TABLE projections.pulseboard_feed_old;`

Estimated rebuild times: pulseboard_feed ~1 min/100K events, entity_summaries ~2 min/100K entities.

---

## 9. Domain-Driven Design Layer

DDD (Domain-Driven Design) patterns were applied to transform the schema from a data model into a business-aware model.

### Aggregate Boundaries

An aggregate is a cluster of domain objects treated as a single unit for data changes. All changes to an aggregate must satisfy its invariants before the transaction commits. Cross-aggregate references use UUIDs only — never direct object graphs.

| Aggregate Root | Owned Children | Key Business Invariants |
|---|---|---|
| **Event** | EventEntityLinks, EventDocumentLinks, Impacts, StoryCapsule | severity and confidence must be set; at least one document link required for `canonicalized` status; `source_count` must match linked corroborating documents |
| **Entity** | (none) | `canonical_name` must not be empty; `entity_type` is immutable after resolution; `external_ids` values must be globally unique per key type |
| **Document** | Claims | `content_hash` must be unique per `(source_id, tenant_id)`; `body_text` or `s3_key` must be present (not both NULL) |
| **Investigation** | Items, Evidence, Notes, CustodyLog | status transitions follow state machine; `evidence_hash` must match document `content_hash` at intake; only owner or admin can transition to `closed` |
| **Watchlist** | Items, Rules | at least one item or rule required for activation; rules must parse as valid JSON Logic |
| **Briefing** | BriefingVersions | `version_number` monotonically increasing; only `approved` can transition to `published`; `supersedes_id` must point to a published briefing |

### Ubiquitous Language

11 domain terms defined that are used consistently across all code, documentation, and team communication:

| Term | Definition |
|---|---|
| **Canonical Event** | A deduplicated, normalized real-world incident — the single source of truth for an occurrence |
| **Story Capsule** | AI-generated explanatory bundle (headline + explanation + evidence) attached to a canonical event |
| **Entity Resolution** | The process of matching and merging multiple source references to the same real-world entity into one canonical record |
| **Trust Tier** | Source reliability: Tier 1 = government source-of-record, Tier 2 = structured enrichment, Tier 3 = controlled/licensed |
| **Confidence Score** | 0.00–1.00 numeric expressing certainty. Deterministic matches = 1.00, AI-extracted claims = model confidence |
| **Lineage Hash** | SHA-256 fingerprint of (source_document + extraction_model + extracted_content) for full provenance tracing |
| **Dark Archive** | WORM-compliant cold storage where erased/redacted content is moved to preserve referential integrity under DPDPA |
| **Claim** | A single factual assertion extracted from a document, with confidence score and provenance |
| **Projection** | A precomputed, denormalized read model optimized for a specific workspace's query patterns |
| **Verification Gate** | Human review checkpoint where AI-generated insights must be explicitly accepted before becoming canonical |
| **Episode** | A group of related watchlist alerts representing the same underlying situation |

---

## 10. Postgres Engineering Decisions

### Why UUID v7 (Not UUID v4)

UUID v4 is random. When used as a primary key in a B-tree index, every INSERT lands at a random position in the index, causing:
- **B-tree fragmentation** — pages are never full, wasting 40-60% of index space
- **Cache misses** — each INSERT touches a different page, invalidating CPU cache
- **Write amplification** — Postgres must keep splitting and rebalancing B-tree pages

UUID v7 is time-ordered (first 48 bits = timestamp, last 74 bits = random). Inserts always go to the end of the index, like an auto-increment ID but globally unique and without coordination. Requires `pg_uuidv7` extension.

### Why TIMESTAMPTZ, Not TIMESTAMP

`TIMESTAMP` stores a local time with no timezone context. When data is fetched from a source in Chennai (IST), stored in UTC, and displayed in Singapore (SGT), `TIMESTAMP` produces silent, invisible bugs. `TIMESTAMPTZ` stores the UTC epoch internally and converts correctly to any timezone on output. The performance is identical — this is a correctness requirement.

### Why TEXT, Not VARCHAR(n)

In PostgreSQL, `VARCHAR(n)` and `TEXT` have identical internal storage and performance. `VARCHAR(n)` adds an artificial length constraint that requires a migration to increase. `TEXT` avoids this without any downside.

### RLS Performance — The Subselect Rule

Naive RLS (Row-Level Security) policy:
```sql
-- WRONG — evaluates current_setting() for every row scanned
CREATE POLICY tenant_isolation ON core.events
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

This calls `current_setting()` for every row in a table scan. On a table with 10M events, that's 10M function calls per query.

**Correct pattern — evaluated once per query:**
```sql
CREATE POLICY tenant_isolation ON core.events
  FOR ALL USING (tenant_id = (SELECT current_setting('app.current_tenant_id')::uuid));
```

The subselect forces the planner to evaluate the function once and use the result as a constant for the entire query.

### Foreign Key Indexing — Postgres Does NOT Auto-Index FKs

This is the most common Postgres performance trap. Declaring `FOREIGN KEY (source_id) REFERENCES sources(id)` does NOT create an index on `source_id`. Without the index:
- Every JOIN that traverses this FK causes a full table scan
- Every `ON DELETE CASCADE` operation scans the entire child table

**Rule:** Every FK column must have an explicit `CREATE INDEX`. The ontology document enforces this for all 30+ tables.

### Connection Management — PgBouncer in Transaction Mode

With 20 Celery workers each holding 5 connections = 100 Postgres connections. Add 3 Next.js instances × 10 connections = 130. At 200 connections Postgres performance degrades significantly.

PgBouncer in **transaction mode** multiplexes all 130 app connections onto 20 real Postgres connections. Transaction mode means a real connection is only held for the duration of a transaction — milliseconds at a time. But it requires that applications use **unnamed prepared statements** (named prepared statements are pinned to a session and are incompatible with connection multiplexing).

**Timeouts:**
- `idle_in_transaction_session_timeout = 30s` — kill connections left in a transaction (prevents connection leaks from buggy code)
- `statement_timeout = 30s` — kill runaway queries (prevents a bad query from starving other connections)

### Index Strategy Summary

| Index Type | When to Use | Example in NARAD |
|---|---|---|
| **B-tree** | Equality and range queries | `(tenant_id, status, occurred_at DESC)` on events |
| **GIN** | JSONB containment, arrays, tsvector | `external_ids jsonb_path_ops`, `tsv tsvector` |
| **GIST** | PostGIS geometry, ranges | `geometry GEOMETRY(Point)` on entities, events |
| **HNSW** | Vector similarity search | `embedding vector_cosine_ops` on all 768d columns |
| **BRIN** | Large append-only time-series | `created_at` on `audit.audit_log` — 100x smaller than B-tree |
| **Partial** | Exclude irrelevant rows | `WHERE embedding IS NOT NULL`, `WHERE status != 'invalidated'` |
| **Covering** | Avoid heap fetches | `INCLUDE (title, severity)` on feed queries |

### Partitioning Strategy

| Table | Method | Reason |
|---|---|---|
| `audit.audit_log` | Monthly RANGE on `created_at` | Instant `DROP TABLE` for old partitions (vs slow DELETE + VACUUM) |
| `core.telemetry_events` | TimescaleDB hypertable | Auto-partitioned, retention policies, compression |
| `core.events`, `core.documents` | Monthly RANGE (defer until 100M rows) | Partitioning overhead not worth it at current scale |
| `projections.*` | None | Small tables, frequently overwritten |

### Data Access Patterns

| Pattern | Why | How |
|---|---|---|
| **Batch INSERT** | 50-100 rows per statement amortizes network round-trip | `INSERT INTO documents (...) VALUES ($1, $2), ($3, $4), ...` |
| **UPSERT** | Idempotent projection refresh — safe to retry on failure | `INSERT ... ON CONFLICT (event_id) DO UPDATE SET card = EXCLUDED.card` |
| **Cursor pagination** | OFFSET causes O(n) sequential scan (page 1000 scans 10,000 rows) | `WHERE (occurred_at, id) < ($cursor_time, $cursor_id) ORDER BY occurred_at DESC, id DESC LIMIT 20` |
| **SKIP LOCKED** | Non-blocking distributed queue — multiple workers dequeue concurrently | `SELECT id FROM job_queue FOR UPDATE SKIP LOCKED LIMIT 10` |
| **Short transactions** | Long transactions hold locks and exhaust connection pool | All write transactions complete in <100ms. No HTTP/LLM calls inside transactions. |
| **Batch embedding** | Reduce DB round-trips from 50 to 1 for embedding writes | `UPDATE entities SET embedding = $2 WHERE id = ANY($1::uuid[])` |

---

## 11. Entity Resolution System

Entity resolution is the process of determining that "Adani Ports and Special Economic Zone Limited", "Adani Ports SEZ Ltd", and "APSEZ" all refer to the same company and merging them into one canonical entity.

### Deterministic Matching (confidence = 1.00)

When a unique external ID matches, it is unambiguous:

| Entity Type | External ID | Source |
|---|---|---|
| Company | CIN (`U63090GJ2006PLC058865`) | MCA21 |
| Listed company | ISIN (`INE742F01042`) | BSE/NSE |
| Aircraft | ICAO24 transponder code | OpenSky |
| Vessel | IMO number | IPA / AIS |
| Land parcel | ULPIN | DILRMP |
| Airport | ICAO/IATA code | AAI eAIP |
| Port | Port code | IPA |
| Nuclear facility | IAEA ID | IAEA |

Deterministic matches **auto-resolve** — no human review required. The merge happens immediately.

### Probabilistic Matching (confidence = 0.00–1.00)

For entities without unique external IDs (most people, some organizations, all informal place names):

1. **Name trigram similarity** (`pg_trgm`) on `canonical_name` and `aliases[]` — threshold ≥ 0.7
2. **Entity type match** — must be identical (a "person" cannot merge with a "company")
3. **Spatial proximity** — if both have `geometry`, distance < 10km boosts the score
4. **Source overlap** — entities appearing in the same high-trust source more likely to be the same
5. **Temporal co-occurrence** — entities appearing in the same event cluster boost merge probability

**Scoring thresholds:**
- **≥ 0.85** — auto-merge (high confidence, rare false positive rate)
- **0.60–0.85** — flag for human review (Verification Gate)
- **< 0.60** — treat as separate entities

### Merge Strategy

When two entities merge:
- `canonical_name` — highest trust-tier source wins
- `aliases[]` — union of all aliases from both entities
- `external_ids` — union (conflicts flagged for review)
- `geometry` — highest trust-tier source wins
- `resolved_from[]` — stores UUIDs of all merged entities (full audit trail)
- All FK references (`event_entity_links`, `relationships`, `claims`) updated to surviving entity ID

---

## 12. Event Deduplication and Clustering

When 5 news sources report the same fire in Odisha within 2 hours, NARAD should not show 5 separate events on the PulseBoard. Event deduplication clusters these into one canonical event with `source_count = 5`.

### Clustering Criteria

Two events are candidate duplicates if **ALL** of:
1. `occurred_at` within **24 hours** of each other
2. Spatial distance < **50km** (configurable per event_type)
3. Same `event_type`

**AND at least ONE** of:
4. Embedding cosine similarity > **0.85** (semantic meaning is the same)
5. Share at least one linked entity
6. Title trigram similarity > **0.7**

The AND-then-OR structure prevents false positives. A protest in Mumbai and a fire in Mumbai on the same day are not duplicates just because they're close and same-day — they need semantic or entity overlap too.

### Canonical Event Selection

Within a cluster:
1. Event from **highest trust-tier source** becomes the canonical event
2. Other events become **corroborating sources** (linked via `event_document_links` with `link_type = 'corroboration'`)
3. `source_count` on the canonical event is incremented
4. All events share the same `cluster_id`

### Contradiction Handling

If a new source contradicts the canonical event:
- Link with `link_type = 'contradiction'`
- Reduce `confidence` on the canonical event
- If confidence drops below 0.50, flag for analyst review
- **Never auto-invalidate** a Tier 1 sourced event based on Tier 2/3 contradiction

---

## 13. Dark Archive — DPDPA Compliance

India's **Digital Personal Data Protection Act (DPDPA)** grants individuals the right to erasure of their personal data. For an intelligence platform, this creates a tension: referential integrity requires that documents referenced by events, claims, and investigations cannot simply be deleted.

### The Protocol

When a document must be erased:

1. **Move** the full artifact to `S3_BUCKET_DARK_ARCHIVE` (access-controlled, WORM-compliant)
2. **Nullify** `body_text` and `translated_text` in `core.documents`
3. **Replace** `s3_key` with the dark archive key (still accessible to authorized users only)
4. **Retain** `content_hash`, `doc_type`, `source_id`, `fetched_at`, `metadata` (anonymized)
5. **Mark** linked claims with `is_redacted = TRUE`
6. **Log** the erasure action in `audit.audit_log`

The document record still exists — its UUID is still referenced by events, investigations, and briefings. But the content is gone. Referential integrity is preserved. Erasure right is satisfied.

### Why This Is Built Into the Schema Now

The `narad_ingest_writer` database role has **REVOKE DELETE ON core.documents**. No application code path can directly delete a document row. Deletions must flow through the dark archive protocol, ensuring the audit log is always written and the WORM archive is always created. This is enforced at the database layer, not just in application code.

---

## 14. TimescaleDB Hypertables

Real-time telemetry data (aircraft positions from OpenSky, fire detections from NASA FIRMS) is fundamentally different from analytical data:
- **Volume:** Thousands of rows per second vs hundreds per hour
- **Access pattern:** Almost always recent data vs historical analysis
- **Retention:** 7 days of raw data is sufficient; hourly/daily aggregates for history
- **Query type:** "Where are all aircraft right now?" not "Show me this document from 2024"

### `core.telemetry_events` — the hypertable

| Column | Purpose |
|---|---|
| `time TIMESTAMPTZ` | TimescaleDB partition key |
| `telemetry_type TEXT` | `"aircraft_position"`, `"fire_detection"`, `"vessel_position"` |
| `geometry GEOMETRY(Point, 4326)` | Current location |
| `payload JSONB` | Source-specific: altitude, speed, callsign (aircraft); FRP, brightness (fire) |

**TimescaleDB configuration:**
```sql
-- Create the hypertable (auto-partitions by time)
SELECT create_hypertable('core.telemetry_events', 'time');

-- Drop data older than 7 days automatically
SELECT add_retention_policy('core.telemetry_events', INTERVAL '7 days');

-- Compress data older than 1 day (columnar compression = 10-20x size reduction)
SELECT add_compression_policy('core.telemetry_events', INTERVAL '1 day');

-- Continuous aggregates for historical views
CREATE MATERIALIZED VIEW telemetry_hourly
  WITH (timescaledb.continuous) AS
  SELECT time_bucket('1 hour', time) AS hour, source_id, telemetry_type, count(*) AS count
  FROM core.telemetry_events GROUP BY 1, 2, 3;
```

Without TimescaleDB, a table receiving 5,000 rows/second would have 432M rows after 24 hours. With hypertables + retention, the table stays at approximately 432M rows maximum (7 days), and chunked time-based partitions enable millisecond queries on recent data.

---

## 15. Security — RBAC and Row-Level Security

### Database Roles (3-tier, Principle of Least Privilege)

```sql
-- Role 1: Read-only for Next.js app plane
CREATE ROLE narad_app_reader NOLOGIN;
GRANT USAGE ON SCHEMA core, projections, geo_intelligence, corp_watch, lex_pulse TO narad_app_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA core, projections, geo_intelligence, corp_watch, lex_pulse TO narad_app_reader;

-- Role 2: Write for Python intelligence plane (ingestion + enrichment)
CREATE ROLE narad_ingest_writer NOLOGIN;
GRANT USAGE ON SCHEMA core, audit TO narad_ingest_writer;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA core TO narad_ingest_writer;
GRANT INSERT ON ALL TABLES IN SCHEMA audit TO narad_ingest_writer;
-- Note: NO DELETE on core — deletions must go through dark archive protocol

-- Role 3: Read/write for projection workers
CREATE ROLE narad_projection_writer NOLOGIN;
GRANT USAGE ON SCHEMA projections TO narad_projection_writer;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA projections TO narad_projection_writer;
GRANT SELECT ON ALL TABLES IN SCHEMA core, workflow TO narad_projection_writer;

-- Login roles inherit from base roles
CREATE ROLE narad_app LOGIN PASSWORD '...';
GRANT narad_app_reader TO narad_app;

CREATE ROLE narad_worker LOGIN PASSWORD '...';
GRANT narad_ingest_writer TO narad_worker;
GRANT narad_projection_writer TO narad_worker;
```

**Why this separation matters:**
- If the Next.js app is compromised, the attacker gets SELECT-only. No writes, no deletes.
- If an ingestion worker is compromised, it cannot delete canonical records (DELETE is revoked on `core`).
- Projection workers cannot touch the canonical write model.

### Row-Level Security (RLS)

Every table has an RLS policy enforcing tenant isolation:

```sql
ALTER TABLE core.events ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON core.events
  FOR ALL USING (tenant_id = (SELECT current_setting('app.current_tenant_id')::uuid));
```

Applications set the tenant context at connection time:
```sql
SET app.current_tenant_id = 'tenant-uuid-here';
```

After this, every SELECT/INSERT/UPDATE on any RLS-protected table automatically filters to the current tenant. It is impossible (without superuser access) to read another tenant's data.

### Clearance-Level ABAC

The `users.clearance_level` column enables attribute-based access control:

- `unclassified` — visible to all authenticated users
- `restricted` — requires `restricted` clearance or above
- `confidential` — requires `confidential` clearance or above
- `secret` — requires `secret` clearance

Events, investigations, and briefings carry classification levels. Application-layer middleware checks `user.clearance_level >= resource.classification` before returning data. (RLS policies for clearance can be added in Phase 2 once the policy logic is finalized.)

### Audit Trail (INSERT-Only)

`audit.audit_log` and `workflow.evidence_custody_log` are INSERT-only tables. The `narad_ingest_writer` and `narad_app_reader` roles have `REVOKE UPDATE, DELETE` on these tables. Every action (view, export, state transition, erasure) is permanently recorded and cannot be modified.

---

## 16. Open Questions and Suggested Defaults

12 architectural decisions were documented with suggested defaults to unblock Phase 2 implementation. These are not final — they can be revisited but the suggested defaults are good enough to start:

| OQ | Question | Suggested Default |
|---|---|---|
| OQ-1 | `entity_type` as CHECK constraint or lookup table? | Start with CHECK; migrate to lookup table if types exceed ~20 |
| OQ-2 | Investigation items: polymorphic FK (trigger) or 4 nullable FK columns? | Polymorphic + trigger |
| OQ-3 | Embedding dimension: 768d (Gemini) or 1536d (OpenAI)? | **Lock to 768d** for Gemini text-embedding-004 |
| OQ-4 | Watchlist rule format: custom DSL, JSON Logic, or CEL? | **JSON Logic** — evaluatable in both Python and JavaScript |
| OQ-5 | Geography table vs entities with `entity_type = 'district'`? | Use entities with `geometry_area` column |
| OQ-6 | Briefing sections: JSONB array or separate table? | JSONB for V2; migrate if collaborative section editing is needed |
| OQ-7 | DPDPA PII field-level encryption at rest? | Yes, but **defer to Phase 2** — identify PII fields now |
| OQ-8 | Telemetry rollup granularity? | Hourly for 30d, daily for 365d |
| OQ-9 | Command Bus pattern vs Celery task functions? | Start with Celery tasks following command naming; refactor if >20 command types |
| OQ-10 | PostgreSQL NOTIFY vs Redis pub/sub for projection sync? | **Redis pub/sub** — more reliable with PgBouncer in transaction mode |
| OQ-11 | ORM or raw SQL? | Python: **raw SQL with asyncpg**; Next.js: **Drizzle ORM** |
| OQ-12 | PostgreSQL advisory locks vs Redis distributed locks for entity merge? | **PostgreSQL advisory locks** — co-located with data, no extra infrastructure |

---

## 17. What Phase 2 Will Build

Phase 1 defined **what** exists. Phase 2 builds **the actual database and server structure** from those definitions.

### Phase 2 Deliverables

1. **PostgreSQL DDL Migration Files**
   - `migrations/001_extensions.sql` — all 6 Postgres extensions
   - `migrations/002_roles.sql` — 5 database roles with permissions
   - `migrations/003_core_schema.sql` — 12 core tables with indexes, RLS, triggers
   - `migrations/004_workflow_schema.sql` — 11 workflow tables
   - `migrations/005_domain_schemas.sql` — corp_watch, lex_pulse, geo_intelligence tables
   - `migrations/006_audit_schema.sql` — audit_log (partitioned), state_transitions
   - `migrations/007_projections_schema.sql` — 4 projection tables
   - `migrations/008_timescaledb.sql` — hypertable, retention policy, continuous aggregates

2. **Docker Compose Stack**
   ```yaml
   services:
     postgres:    # PostgreSQL 16 + TimescaleDB + PostGIS + pgvector
     redis:       # Redis 7 (pub/sub + cache)
     pgbouncer:   # PgBouncer in transaction mode
   ```

3. **Python Backend Scaffold**
   - Monorepo structure: `apps/intelligence/`, `apps/api/`, `packages/shared/`
   - FastAPI app with command handlers
   - Celery worker configuration
   - asyncpg connection pool with PgBouncer
   - Database role assignment per worker type

4. **Migration Runner Setup** — Flyway or Alembic configured for ordered migration execution with version control

---

## Summary

Phase 1 established the **single source of truth** for all of NARAD V2's data architecture. In one session, we:

- Designed a 30+ table schema spanning 7 PostgreSQL schemas with zero redundancy
- Applied production-grade Postgres performance conventions (UUID v7, TIMESTAMPTZ, RLS optimization, connection pooling, FK indexing)
- Defined CQRS architecture with 7 write commands, 6 read queries, and 4 projection tables
- Established DDD aggregate boundaries with business invariants that will become database constraints and application validation
- Built entity resolution logic handling both deterministic (external ID matching) and probabilistic (trigram + spatial + temporal) cases
- Designed event deduplication clustering that prevents alert fatigue while preserving corroboration evidence
- Built DPDPA compliance into the schema itself via the dark archive protocol and INSERT-only audit tables
- Established 3-tier RBAC enforcing least privilege at the database level
- Documented 12 open architectural decisions with actionable defaults

**Phase 2 begins:** translating this ontology into executable SQL DDL and infrastructure.
