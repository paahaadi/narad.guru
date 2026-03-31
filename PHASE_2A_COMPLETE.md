# NARAD V2 — Phase 2A Complete: Data Plane + Infrastructure

**Phase:** 2A of 7 (first session of Phase 2)
**Session:** 2A — Data Plane + Infrastructure
**Status:** Complete
**Started:** 2026-03-27
**Completed:** 2026-03-28
**Depends on:** Phase 1 — Canonical Ontology (`docs/architecture/canonical_ontology.md`)

---

## Table of Contents

1. [Is Phase 2 Complete?](#1-is-phase-2-complete)
2. [What Phase 2A Produced](#2-what-phase-2a-produced)
3. [Technology Stack and Why Each Was Chosen](#3-technology-stack-and-why-each-was-chosen)
4. [Docker Compose Stack — 5 Services](#4-docker-compose-stack--5-services)
5. [Migration System Architecture](#5-migration-system-architecture)
6. [Database Schema — 37 Tables Across 7 Schemas](#6-database-schema--37-tables-across-7-schemas)
7. [Core Schema — 13 Tables](#7-core-schema--13-tables)
8. [Workflow Schema — 11 Tables](#8-workflow-schema--11-tables)
9. [Domain Schemas — 4 Tables](#9-domain-schemas--4-tables)
10. [Audit Schema — Partitioned INSERT-Only Tables](#10-audit-schema--partitioned-insert-only-tables)
11. [Projections Schema — CQRS Read Models](#11-projections-schema--cqrs-read-models)
12. [TimescaleDB — Hypertable and Continuous Aggregates](#12-timescaledb--hypertable-and-continuous-aggregates)
13. [Security — RBAC and Row-Level Security](#13-security--rbac-and-row-level-security)
14. [UUID v7 — Time-Ordered Primary Keys](#14-uuid-v7--time-ordered-primary-keys)
15. [PgBouncer — Connection Pooling](#15-pgbouncer--connection-pooling)
16. [Developer Tooling — pgAdmin and RedisInsight](#16-developer-tooling--pgadmin-and-redisinsight)
17. [One-Command Setup Script](#17-one-command-setup-script)
18. [Runtime Issues Discovered and Fixed](#18-runtime-issues-discovered-and-fixed)
19. [Verification Results — 9/9 Passing](#19-verification-results--99-passing)
20. [File Inventory](#20-file-inventory)
21. [Git History](#21-git-history)
22. [What Phase 2B Will Build On Top Of This](#22-what-phase-2b-will-build-on-top-of-this)
23. [Open Decisions Carried Forward](#23-open-decisions-carried-forward)

---

## 1. Is Phase 2 Complete?

**No. Phase 2A is complete. Phase 2 has three sub-phases:**

| Sub-Phase | Scope | Status |
|---|---|---|
| **Phase 2A** — Data Plane + Infrastructure | Docker Compose stack, 10 SQL migrations, migration runner, developer tooling | **Complete** |
| **Phase 2B** — Intelligence Plane | Python FastAPI backend, Celery workers, source adapters, ingest pipeline | Not started |
| **Phase 2C** — Presentation Plane | Next.js 15 frontend, Sovereign Midnight design system, real-time dashboard | Not started |

Phase 2A is the foundation layer that Phase 2B and 2C build on. It provides:
- A running PostgreSQL database with all 37 tables from the canonical ontology
- Redis for pub/sub, caching, and WebSocket presence
- PgBouncer for connection pooling
- A shell migration runner for database version control
- Developer inspection tools (pgAdmin, RedisInsight)

The `apps/intelligence/.gitkeep` and `apps/web/.gitkeep` placeholder directories are ready for Phase 2B and 2C respectively.

---

## 2. What Phase 2A Produced

### Deliverables

| Category | Count | Details |
|---|---|---|
| Docker services | 5 | postgres, redis, pgbouncer, pgadmin, redisinsight |
| SQL migration files | 10 | `001_extensions.sql` through `010_grants.sql` |
| Shell scripts | 2 | `migrate.sh` (migration runner), `setup-dev.sh` (one-command boot) |
| Infrastructure configs | 3 | `pgbouncer.ini`, `userlist.txt`, `servers.json` |
| Database schemas | 7 | core, workflow, audit, projections, corp_watch, lex_pulse, geo_intelligence |
| Database tables | 37 | Including 3 audit partitions and 1 TimescaleDB hypertable |
| Database indexes | 141 | Across all schemas (B-tree, GiST, HNSW, BRIN, GIN) |
| Database triggers | 34 | `updated_at` auto-set, TSV auto-update, INSERT-only enforcement |
| RLS policies | 16 | Tenant isolation on all multi-tenant tables |
| Database roles | 5 | 3 group roles + 2 login roles |
| Extensions | 9 | timescaledb, postgis, vector, pg_trgm, pg_stat_statements, pgcrypto, pg_uuidv7, timescaledb_toolkit, plpgsql |
| Continuous aggregates | 2 | `telemetry_hourly`, `telemetry_daily` |
| Git commits | 19 | From initial repo through final grant configuration |

### Design Documents Created

- **Design spec:** `docs/superpowers/specs/2026-03-27-phase-2a-data-plane-design.md` — approved design for Docker stack, PgBouncer config, migration file responsibilities, and verification checklist
- **Implementation plan:** `docs/superpowers/plans/2026-03-27-phase-2a-data-plane.md` — 19-task step-by-step plan with complete code for every file

---

## 3. Technology Stack and Why Each Was Chosen

### PostgreSQL 16 via TimescaleDB HA (`timescale/timescaledb-ha:pg16-all`)

**What:** PostgreSQL 16 packaged with TimescaleDB, PostGIS, pgvector, and 60+ extensions pre-installed.

**Why this image:** NARAD V2 requires four capabilities in a single Postgres instance:
- **TimescaleDB** — Time-series telemetry from 32 data sources (satellite, OSINT, government feeds). Hypertables provide automatic time-based partitioning, retention policies, compression, and continuous aggregates. Without TimescaleDB, managing telemetry at scale would require a separate time-series database.
- **PostGIS** — Geospatial intelligence (GeoInt) is a core NARAD workspace. Events have `GEOMETRY(Point, 4326)` and `GEOMETRY(Polygon, 4326)` columns for location and area. PostGIS provides spatial indexing (GiST), distance calculations, and geometry operations.
- **pgvector** — Semantic search across documents, entities, and events. Each has a `vector(768)` embedding column with HNSW indexes for approximate nearest-neighbor search. Used for RAG (Retrieval-Augmented Generation) in the LexPulse workspace.
- **pg_trgm** — Trigram-based fuzzy text search for entity resolution and deduplication. Combined with TSVector full-text search for the intelligence feed.

**Why the `-ha:pg16-all` tag specifically:** The original spec called for `timescale/timescaledb-ha:pg16-latest`, but that tag was removed from Docker Hub. The `-all` tag includes PostGIS and all optional extensions. The non-HA `timescale/timescaledb:latest-pg16` image was tested first but lacked PostGIS.

**Key configuration:**
- `PGDATA=/home/postgres/pgdata/data` — The HA image uses Patroni/Spilo internally with a non-standard data directory. Setting this incorrectly causes data loss on container restart.
- Host port `5433` — Direct Postgres access for migrations and admin. PgBouncer occupies port `6432` for application connections.
- Health check: `pg_isready -U postgres -d narad_v2` every 5 seconds with 5 retries — PgBouncer `depends_on` this health check and won't start until Postgres is ready.

### Redis 7 Alpine (`redis:7-alpine`)

**What:** In-memory data store used for pub/sub event bus, projection cache, WebSocket presence tracking, and rate limiting.

**Why Redis:** NARAD's CQRS architecture needs an event bus to notify the frontend when projections update. Redis Pub/Sub provides this with sub-millisecond latency. Redis is also used as:
- Semantic cache for LexPulse RAG queries (avoid re-embedding identical questions)
- WebSocket presence tracking (which analysts are online, what they're viewing)
- Rate limiter for external API calls (ACLED, GDELT, NASA FIRMS have quotas)

**Configuration:**
- `redis-server --appendonly yes --save 60 1` — AOF (Append-Only File) enabled for durability + RDB snapshot every 60 seconds if at least 1 key changed. This balances performance with crash safety.
- Three logical databases configured in `.env`: DB 0 (general), DB 1 (cache), DB 2 (WebSocket)

### PgBouncer (`edoburu/pgbouncer:latest`)

**What:** Lightweight connection pooler that sits between the application and PostgreSQL.

**Why PgBouncer:** PostgreSQL creates a new process for each connection (~10MB RAM each). With potentially hundreds of concurrent API requests + Celery workers, direct connections would exhaust Postgres resources. PgBouncer multiplexes many client connections onto a small pool of server connections.

**Configuration:** Transaction-mode pooling (see [Section 15](#15-pgbouncer--connection-pooling) for details).

### pgAdmin 4 (`dpage/pgadmin4:latest`)

**What:** Web-based PostgreSQL administration and inspection tool.

**Why:** Provides visual schema browsing, query execution, and ERD viewing during development. Configured in desktop mode (no login required) with pre-registered server connections.

### RedisInsight (`redis/redisinsight:latest`)

**What:** Web-based Redis inspection tool from Redis Labs.

**Why:** Provides visual key browsing, memory analysis, and slow-log inspection during development.

---

## 4. Docker Compose Stack — 5 Services

### Architecture

```
                    ┌─────────────────────────┐
                    │     Host Machine         │
                    │                          │
 App (Phase 2B/C) ─┤─── :6432 ──► PgBouncer ─┤──► postgres:5432 (Docker network)
                    │                          │
 migrate.sh ───────┤─── :5433 ──► PostgreSQL  │   (direct, bypasses pool)
                    │                          │
 Browser ──────────┤─── :5050 ──► pgAdmin     │
                    │                          │
 Browser ──────────┤─── :5540 ──► RedisInsight│
                    │                          │
 App (Phase 2B/C) ─┤─── :6379 ──► Redis      │
                    └─────────────────────────┘
```

### Service Details

| Service | Image | Host Port | Container Port | Volume | Health Check |
|---|---|---|---|---|---|
| `postgres` | `timescale/timescaledb-ha:pg16-all` | 5433 | 5432 | `narad_pgdata:/home/postgres/pgdata/data` | `pg_isready` every 5s |
| `redis` | `redis:7-alpine` | 6379 | 6379 | `narad_redis:/data` | `redis-cli ping` every 5s |
| `pgbouncer` | `edoburu/pgbouncer:latest` | 6432 | 5432 | Config files read-only mount | Depends on postgres healthy |
| `pgadmin` | `dpage/pgadmin4:latest` | 5050 | 80 | `narad_pgadmin:/var/lib/pgadmin` | — |
| `redisinsight` | `redis/redisinsight:latest` | 5540 | 5540 | `narad_redisinsight:/data` | — |

### Networking

All 5 services communicate over a single Docker bridge network named `narad`. Internal service-to-service communication uses Docker DNS names (`postgres`, `redis`, `pgbouncer`). PgBouncer connects to `postgres:5432` internally (not the host port).

### Why Port 6432 for PgBouncer (not 5432)

The original spec used host port 5432 for PgBouncer, matching the standard Postgres port. During deployment, we discovered a local PostgreSQL installation (Homebrew) already listening on port 5432. When `psql` connected to `localhost:5432`, it reached the local Postgres (which has no `narad_app` role) instead of Docker's PgBouncer. Moving PgBouncer to port 6432 (the standard PgBouncer port) resolved the conflict.

---

## 5. Migration System Architecture

### `migrate.sh` — Shell-Based Migration Runner

**Location:** `migrations/migrate.sh`

**Why shell instead of a framework (Flyway, Alembic, etc.):** Phase 2A has zero application dependencies — no Python, no Node, no Java. A shell script with `psql` is the simplest tool that works. It has zero dependencies beyond `psql` and `sha256sum`/`shasum` (both available on any dev machine). The script is 199 lines and handles everything the Phase 2A data plane needs.

### Interface

```bash
./migrations/migrate.sh              # Apply pending migrations
./migrations/migrate.sh --dry-run    # Show what would run, no changes
./migrations/migrate.sh --status     # Show applied/pending status
./migrations/migrate.sh --reset      # DROP + recreate DB, run all (dev only)
```

### How It Works

1. **Loads `.env`** — Reads connection config from environment variables via `set -a; source .env; set +a`
2. **Connects to direct Postgres** — Always port 5433 (never PgBouncer). Migrations use DDL statements (CREATE TABLE, ALTER, etc.) that don't work well through connection poolers in transaction mode.
3. **Creates tracking table** — `public._migrations (filename TEXT PK, sha256 TEXT, applied_at TIMESTAMPTZ)`
4. **For each `.sql` file** (sorted lexicographically by filename):
   - Checks if filename exists in `_migrations`
   - If yes: computes current SHA256 and compares with stored hash. If changed, warns (yellow) and skips. If identical, silently skips.
   - If no: applies the migration
5. **Syncs role passwords** — After all migrations, runs `ALTER ROLE` to sync passwords from `.env` into PostgreSQL

### Idempotency

Every migration is tracked by filename and SHA256 hash in `public._migrations`. Re-running `migrate.sh` skips already-applied migrations. If a migration file is modified after being applied, the runner warns with a yellow `⚠` but does not re-apply (use `--reset` to start fresh).

### Atomic Transactions

Most migrations are wrapped in a single transaction:

```
BEGIN;
<contents of .sql file>
INSERT INTO public._migrations (filename, sha256) VALUES (...);
COMMIT;
```

This ensures that if a migration fails halfway, neither the schema changes nor the tracking row are committed. A killed process cannot leave a migration applied-but-untracked.

**Exception:** `009_timescaledb.sql` runs without a transaction wrapper because TimescaleDB DDL functions (`create_hypertable`, `add_retention_policy`, `add_compression_policy`) cannot execute inside a PostgreSQL transaction block.

### Error Handling

The original implementation had a critical bug: with `set -e` (exit on error), the `error_output=$(psql ...)` subshell would cause the script to exit before capturing the error message. This was fixed by wrapping psql calls in an `if` statement:

```bash
if error_output=$(psql ... 2>&1); then
  psql_exit=0
else
  psql_exit=$?
fi
```

### SHA256 Detection

macOS uses `shasum -a 256`, Linux uses `sha256sum`. The script auto-detects which is available:

```bash
if command -v sha256sum > /dev/null 2>&1; then
  sha256_file() { sha256sum "$1" | awk '{print $1}'; }
elif command -v shasum > /dev/null 2>&1; then
  sha256_file() { shasum -a 256 "$1" | awk '{print $1}'; }
fi
```

---

## 6. Database Schema — 37 Tables Across 7 Schemas

### Schema Overview

| Schema | Tables | Purpose |
|---|---|---|
| `core` | 13 | Canonical write model — events, entities, documents, claims, relationships |
| `workflow` | 11 | Analyst tools — watchlists, investigations, briefings, evidence custody |
| `corp_watch` | 1 | Corporate intelligence — entity profiles with directors/shareholders |
| `lex_pulse` | 2 | Legal/regulatory — regulatory events, semantic cache for RAG |
| `geo_intelligence` | 1 | Geospatial — map layer configurations per tenant |
| `audit` | 5 | Immutable audit trail — range-partitioned, INSERT-only |
| `projections` | 4 | CQRS read models — denormalized dashboard feeds |
| **Total** | **37** | |

### Why 7 Schemas (Not One Flat Schema)

PostgreSQL schemas provide namespace isolation. Each NARAD workspace (CorpWatch, LexPulse, GeoInt) has its own schema, preventing name collisions and enabling granular RBAC grants. The `core` and `workflow` schemas contain the shared intelligence model; domain schemas contain workspace-specific extensions.

### Index Summary

| Schema | Index Count | Index Types |
|---|---|---|
| core | 70 | B-tree (PKs, FKs, lookups), GiST (geometry), HNSW (vector embeddings), GIN (tsvector full-text) |
| workflow | 35 | B-tree (PKs, FKs, status filters) |
| projections | 12 | B-tree (PKs, FKs, tenant+time sorting) |
| audit | 11 | B-tree (PKs), BRIN (time-range scans on `created_at`) |
| lex_pulse | 7 | B-tree, HNSW (semantic cache embeddings) |
| corp_watch | 3 | B-tree |
| geo_intelligence | 3 | B-tree |
| **Total** | **141** | |

---

## 7. Core Schema — 13 Tables

The core schema implements the canonical write model from Phase 1's ontology. Tables are created in strict FK dependency order to avoid forward references.

### Table Creation Order and Relationships

```
tenants
  └── users (FK → tenants)
  └── sources (FK → tenants)
       └── documents (FK → sources, tenants)
       └── entities (FK → tenants)
            └── events (FK → tenants, sources; no story_capsule_id yet)
                 └── story_capsules (FK → tenants, events; self-ref superseded_by)
                      └── ALTER events ADD story_capsule_id FK → story_capsules
                 └── claims (FK → events, sources, tenants)
                 └── relationships (FK → entities x2, tenants)
                 └── event_entity_links (FK → events, entities)
                 └── event_document_links (FK → events, documents)
                 └── impacts (FK → events, tenants)
```

### Circular FK Resolution

`core.events` has a `story_capsule_id` FK to `core.story_capsules`, but `core.story_capsules` has an `anchor_event_id` FK to `core.events`. This circular dependency is resolved by:
1. Creating `events` without the `story_capsule_id` column
2. Creating `story_capsules` with its `anchor_event_id` FK to `events`
3. Using `ALTER TABLE core.events ADD COLUMN story_capsule_id UUID REFERENCES core.story_capsules(id)` after both tables exist

### Key Columns by Table

| Table | Rows (expected) | Notable Columns |
|---|---|---|
| `tenants` | ~10 | Organization isolation boundary |
| `users` | ~1000 | `role` enum, `preferences` JSONB |
| `sources` | ~100 | Data feed definitions (PIB, ACLED, GDELT, etc.) |
| `documents` | ~1M+ | `embedding vector(768)`, `tsv TSVECTOR`, `raw_content TEXT` |
| `entities` | ~100K+ | `geometry GEOMETRY(Point,4326)`, `embedding vector(768)`, `entity_type` enum |
| `events` | ~10M+ | `geometry GEOMETRY(Point,4326)`, `geometry_area GEOMETRY(Polygon,4326)`, `embedding vector(768)` |
| `story_capsules` | ~100K | AI-generated narratives, `superseded_by` self-referential FK |
| `claims` | ~500K | Extracted assertions with `confidence_score`, `verification_status` |
| `relationships` | ~1M | Entity-to-entity links with `no_self_relationship` CHECK constraint |
| `event_entity_links` | ~10M | Many-to-many: events ↔ entities with `role` |
| `event_document_links` | ~10M | Many-to-many: events ↔ documents with `relevance_score` |
| `impacts` | ~500K | Event consequences: `impact_type`, `severity`, `affected_count` |
| `telemetry_events` | ~100M+ | TimescaleDB hypertable (see [Section 12](#12-timescaledb--hypertable-and-continuous-aggregates)) |

### Full-Text Search (TSVector)

Three tables have auto-updating TSVector columns for PostgreSQL full-text search:

- `core.documents` — `tsv` populated from `title` (weight A) + `raw_content` (weight B) via `update_documents_tsv` trigger
- `core.entities` — `tsv` populated from `name` (weight A) + `description` (weight B) via `update_entities_tsv` trigger
- `core.events` — `tsv` populated from `title` (weight A) + `description` (weight B) via `update_events_tsv` trigger

Each has a `GIN` index on the `tsv` column for fast `@@` full-text queries.

### Vector Embeddings (HNSW)

Four columns store 768-dimensional vectors for semantic similarity search:

- `core.documents.embedding` — Document content embeddings
- `core.entities.embedding` — Entity description embeddings
- `core.events.embedding` — Event description embeddings
- `lex_pulse.semantic_cache.query_embedding` — Cached RAG query vectors

Each has an HNSW index with `vector_cosine_ops` operator class and a `WHERE embedding IS NOT NULL` partial index condition (avoids indexing rows without embeddings).

### Geometry Columns (PostGIS)

- `core.entities.geometry` — `GEOMETRY(Point, 4326)` — Entity location (SRID 4326 = WGS 84)
- `core.events.geometry` — `GEOMETRY(Point, 4326)` — Event epicenter
- `core.events.geometry_area` — `GEOMETRY(Polygon, 4326)` — Event affected area
- `core.telemetry_events.geometry` — `GEOMETRY(Point, 4326)` — Telemetry source location

Each has a GiST spatial index for efficient bounding-box and distance queries.

---

## 8. Workflow Schema — 11 Tables

The workflow schema models analyst tools and investigative workflows.

### Tables

| Table | Purpose | Notable Feature |
|---|---|---|
| `watchlists` | Named collections of monitored entities/events | RLS-enabled |
| `watchlist_items` | Items in a watchlist | FK to watchlists |
| `watchlist_rules` | Automated alert rules | JSON condition definitions |
| `watchlist_alerts` | Triggered alerts | RLS-enabled, `acknowledged_at` nullable |
| `investigations` | Analyst investigation cases | RLS-enabled, status workflow |
| `investigation_items` | Events/entities linked to investigations | FK to investigations |
| `investigation_evidence` | Evidence files attached to investigations | FK to investigation_items |
| `evidence_custody_log` | **INSERT-only** chain of custody | Dual enforcement (see below) |
| `investigation_notes` | Analyst notes on investigations | Markdown content |
| `briefings` | Generated intelligence briefings | RLS-enabled |
| `briefing_versions` | Version history of briefings | FK to briefings |

### Evidence Custody Log — INSERT-Only Enforcement

`workflow.evidence_custody_log` is legally sensitive — it records who accessed or transferred evidence and when. It must be immutable (INSERT-only). Two layers enforce this:

1. **REVOKE:** `REVOKE UPDATE, DELETE ON TABLE workflow.evidence_custody_log FROM PUBLIC;`
2. **Trigger:** A `BEFORE UPDATE OR DELETE` trigger raises `EXCEPTION 'evidence_custody_log is INSERT-only'`

The trigger is a defense-in-depth measure — even if a superuser grants UPDATE, the trigger blocks it.

---

## 9. Domain Schemas — 4 Tables

### `corp_watch.entity_profiles`

Corporate intelligence enrichment. Stores JSONB `directors`, `shareholders`, `financials` for entities tracked by the CorpWatch workspace. One-to-one with `core.entities` via `UNIQUE(entity_id)`.

### `lex_pulse.regulatory_events`

Legal and regulatory event tracking. Links to `core.events` with additional `amendment_type` (CHECK constraint: 'act', 'ordinance', 'notification', 'circular', 'judgment'), `committee_name`, `bill_status`.

### `lex_pulse.semantic_cache`

RAG query cache for the LexPulse workspace. Stores `query_embedding vector(768)` with HNSW index. When a user asks a question, the system checks if a semantically similar question was recently asked (cosine similarity > 0.92) and returns the cached response. TTL is 4 hours.

### `geo_intelligence.layer_configs`

Map layer configurations per tenant. Each tenant can define custom map layers (satellite imagery, event heatmaps, entity clusters) with JSONB `style_config` and `filter_config`. RLS-enabled with tenant isolation.

---

## 10. Audit Schema — Partitioned INSERT-Only Tables

### `audit.audit_log`

**Purpose:** Immutable record of every state-changing operation in the system. Used for compliance (DPDPA), forensics, and accountability.

**Partitioning:** Range-partitioned by `created_at` (monthly). Pre-created partitions:
- `audit.audit_log_2026_03` — March 2026
- `audit.audit_log_2026_04` — April 2026
- `audit.audit_log_2026_05` — May 2026

Future partitions will be created by a cron job (Phase 2B) on the 20th of each month.

**Why range partitioning:** Audit logs are almost always queried by time range ("show me all changes in the last 24 hours"). Range partitioning on `created_at` allows PostgreSQL to scan only the relevant partition, skipping months of irrelevant data.

**BRIN index:** Instead of a B-tree on `created_at`, the audit log uses a BRIN (Block Range Index). BRIN indexes are 1000x smaller than B-tree indexes for time-sorted append-only data because they only store min/max values per block range.

**INSERT-only enforcement:** Same dual-layer approach as `evidence_custody_log`:
1. `REVOKE UPDATE, DELETE` from all roles
2. `BEFORE UPDATE OR DELETE` trigger raises exception via `prevent_audit_mutation()` function

### `audit.state_transitions`

Tracks state machine transitions (e.g., investigation status changes: `open` → `in_review` → `closed`). Same INSERT-only enforcement and BRIN indexing as `audit_log`.

---

## 11. Projections Schema — CQRS Read Models

### What is CQRS and Why NARAD Uses It

CQRS (Command Query Responsibility Segregation) separates write operations from read operations. NARAD's write model (core + workflow schemas) is normalized for data integrity. But dashboard queries would require complex multi-table JOINs across 13+ tables — too slow for real-time feeds.

The projections schema stores **pre-computed, denormalized views** of the data optimized for specific UI views. When the write model changes, workers update the relevant projections asynchronously via Redis pub/sub.

### Projection Tables

| Table | Purpose | Key Columns |
|---|---|---|
| `pulseboard_feed` | Main dashboard event feed | `projection JSONB`, FK to `core.events` |
| `watchlist_deltas` | Watchlist change notifications | `delta JSONB`, FK to `workflow.watchlists` |
| `entity_summaries` | Entity detail cards | `summary JSONB`, FK to `core.entities` |
| `regulatory_digest` | LexPulse regulatory feed | `digest JSONB`, no FK on `event_id` (by design) |

**No RLS on projections:** Tenant isolation is enforced via JSONB content filtering, not RLS policies. This is a deliberate design decision — projection workers need to read/write across tenants, and RLS would complicate the worker role grants.

**No FK on `regulatory_digest.event_id`:** The regulatory digest may reference events from external systems that don't have a corresponding row in `core.events`. The FK is intentionally omitted.

---

## 12. TimescaleDB — Hypertable and Continuous Aggregates

### `core.telemetry_events` — Hypertable

**What:** A TimescaleDB hypertable that automatically partitions data by time. Used for high-frequency telemetry from sources like NASA FIRMS (fire data), OpenSky (aircraft tracking), and ACLED (conflict events).

**Schema:**

```sql
CREATE TABLE core.telemetry_events (
  time            TIMESTAMPTZ NOT NULL,
  tenant_id       UUID NOT NULL REFERENCES core.tenants(id),
  source_id       UUID NOT NULL REFERENCES core.sources(id),
  telemetry_type  TEXT NOT NULL,
  geometry        GEOMETRY(Point, 4326),
  payload         JSONB NOT NULL DEFAULT '{}'
);
```

**TimescaleDB configuration:**
- `create_hypertable('core.telemetry_events', 'time', chunk_time_interval => INTERVAL '1 day')` — One chunk per day
- `add_retention_policy(INTERVAL '7 days')` — Automatically drop data older than 7 days
- `add_compression_policy(INTERVAL '1 day')` — Compress chunks older than 1 day (90%+ storage reduction)
- Segment by `tenant_id, telemetry_type` for optimal compression ratios

### Continuous Aggregates

Pre-computed time-bucketed summaries that update automatically as new data arrives:

**`core.telemetry_hourly`** — 1-hour buckets:
```sql
SELECT time_bucket('1 hour', time) AS bucket,
       tenant_id, source_id, telemetry_type,
       count(*), avg(ST_X(geometry)), avg(ST_Y(geometry))
FROM core.telemetry_events
GROUP BY bucket, tenant_id, source_id, telemetry_type;
```

**`core.telemetry_daily`** — 1-day buckets with the same structure.

Both are created with `WITH NO DATA` — they start populating when data is inserted. The dashboard uses these aggregates instead of scanning raw telemetry data.

### Why TimescaleDB Instead of a Separate Time-Series DB

NARAD's telemetry events reference `core.tenants` and `core.sources` via foreign keys. A separate time-series database (InfluxDB, QuestDB) would require data duplication or cross-database JOINs. TimescaleDB runs inside PostgreSQL, so telemetry queries can JOIN with the core schema natively.

---

## 13. Security — RBAC and Row-Level Security

### 5-Role Hierarchy

```
PostgreSQL Superuser (postgres)
  │
  ├── narad_app_reader (NOLOGIN — group role)
  │     Grants: SELECT on core, projections, geo_intelligence, corp_watch, lex_pulse
  │
  ├── narad_ingest_writer (NOLOGIN — group role)
  │     Grants: SELECT, INSERT, UPDATE on core, workflow, corp_watch, lex_pulse, geo_intelligence
  │             INSERT only on audit (no UPDATE/DELETE)
  │
  ├── narad_projection_writer (NOLOGIN — group role)
  │     Grants: SELECT, INSERT, UPDATE, DELETE on projections
  │             SELECT on core, workflow, corp_watch, lex_pulse, geo_intelligence
  │
  ├── narad_app (LOGIN) — inherits narad_app_reader
  │     Used by: Next.js API routes (Phase 2C) via PgBouncer
  │
  └── narad_worker (LOGIN) — inherits narad_ingest_writer + narad_projection_writer
        Used by: Python Celery workers (Phase 2B) via PgBouncer
```

**Why group roles:** The three NOLOGIN roles (`narad_app_reader`, `narad_ingest_writer`, `narad_projection_writer`) define permission sets. The two LOGIN roles (`narad_app`, `narad_worker`) inherit from group roles. This means:
- Adding a new application service = create a LOGIN role and GRANT it the appropriate group role
- Changing permissions = modify the group role, all inheritors get the change automatically

### Row-Level Security (RLS)

16 tables have RLS enabled with a `tenant_isolation` policy:

```sql
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON <table>
  USING (tenant_id = (SELECT current_setting('app.current_tenant_id', TRUE)::uuid));
```

**How it works:** Before executing any query, the application sets `SET LOCAL app.current_tenant_id = '<tenant-uuid>'`. PostgreSQL automatically filters every SELECT, UPDATE, DELETE to only rows matching that tenant. This is invisible to application code — queries don't need WHERE clauses for tenant filtering.

**The `current_setting(..., TRUE)` pattern:** The `TRUE` parameter means "return NULL if the setting doesn't exist" instead of raising an error. This prevents crashes when RLS policies are evaluated before the setting is established (e.g., during migrations run as superuser).

**Tables without RLS:** `core.tenants` (the tenant table itself), all `audit.*` tables (append-only, queried by admins), all `projections.*` tables (filtered via JSONB content).

---

## 14. UUID v7 — Time-Ordered Primary Keys

### What and Why

Every table uses UUID v7 primary keys instead of auto-incrementing integers or random UUIDv4.

**UUID v7** encodes a 48-bit Unix millisecond timestamp in the first 6 bytes, followed by 74 random bits. This means:
- **Time-ordered:** UUIDs sort chronologically. B-tree indexes stay sequential (no random page splits like UUIDv4).
- **Globally unique:** No coordination needed between services. Celery workers and API servers can generate IDs independently.
- **No sequential leaking:** Unlike auto-increment, UUIDs don't reveal how many records exist or creation order to external consumers.

### Implementation

The `001_extensions.sql` migration creates a `uuid_generate_v7()` PL/pgSQL function:

```sql
CREATE OR REPLACE FUNCTION uuid_generate_v7() RETURNS uuid
LANGUAGE plpgsql PARALLEL SAFE AS $$
DECLARE
  unix_ts_ms bytea;
  uuid_bytes bytea;
BEGIN
  unix_ts_ms := substring(int8send(
    floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint
  ) FROM 3);
  uuid_bytes := unix_ts_ms || gen_random_bytes(10);
  -- Set version nibble to 0111 (v7)
  uuid_bytes := set_byte(uuid_bytes, 6,
    (b'01110000'::int | (get_byte(uuid_bytes, 6) & b'00001111'::int)));
  -- Set variant bits to 10xx (RFC 4122)
  uuid_bytes := set_byte(uuid_bytes, 8,
    (b'10000000'::int | (get_byte(uuid_bytes, 8) & b'00111111'::int)));
  RETURN encode(uuid_bytes, 'hex')::uuid;
END $$;
```

The function first attempts to load the `pg_uuidv7` extension (C implementation, faster). If the extension isn't available, the PL/pgSQL fallback is used. Both produce identical output. The `gen_random_bytes()` function comes from the `pgcrypto` extension.

---

## 15. PgBouncer — Connection Pooling

### Configuration (`infra/pgbouncer/pgbouncer.ini`)

```ini
[databases]
narad_v2 = host=postgres port=5432 dbname=narad_v2

[pgbouncer]
pool_mode = transaction
listen_addr = 0.0.0.0
listen_port = 5432
auth_type = plain
auth_file = /etc/pgbouncer/userlist.txt
max_client_conn = 200
default_pool_size = 20
server_idle_timeout = 600
idle_transaction_timeout = 30
query_timeout = 30
```

### Why Transaction Mode

PgBouncer offers three pool modes:
- **Session mode:** Client owns a server connection for the entire session. No benefit over direct connections.
- **Transaction mode:** Client borrows a server connection for each transaction. Connection returned to pool between transactions. **Best for web apps.**
- **Statement mode:** Client borrows a server connection for each statement. Breaks multi-statement transactions.

NARAD uses **transaction mode** because:
- API requests are short-lived (a few queries per request)
- 200 concurrent API clients can share 20 server connections
- Celery tasks complete transactions quickly

**Limitation:** `SET LOCAL` (used for RLS tenant setting) only works within a transaction in transaction mode. Application code must wrap operations in explicit transactions.

### Authentication

`auth_type = plain` with `userlist.txt` containing plaintext passwords. This is acceptable for development. For production, this should be `scram-sha-256` with hashed passwords (open decision carried forward).

The `userlist.txt` is generated from `.env` variables by `setup-dev.sh`:
```
"narad_app" "<POSTGRES_APP_PASSWORD from .env>"
"narad_worker" "<POSTGRES_WORKER_PASSWORD from .env>"
```

---

## 16. Developer Tooling — pgAdmin and RedisInsight

### pgAdmin

- **URL:** http://localhost:5050
- **Mode:** Desktop (no login required) — `PGADMIN_CONFIG_SERVER_MODE: 'False'`
- **Pre-registered servers** via `infra/pgadmin/servers.json`:
  - Server 1: `NARAD V2 (direct)` — connects to `postgres:5432` as `postgres`
  - Server 2: `NARAD V2 (pgbouncer)` — connects to `pgbouncer:5432` as `narad_app`
- First use: pgAdmin prompts for the Postgres superuser password once per volume lifetime

### RedisInsight

- **URL:** http://localhost:5540
- First use: manually add Redis connection (`redis:6379`) in the UI — one-time step

---

## 17. One-Command Setup Script

### `scripts/setup-dev.sh`

Boots the entire development environment in one command:

```bash
./scripts/setup-dev.sh
```

**What it does:**
1. Checks prerequisites (`docker`, `psql` must be installed)
2. Loads `.env` file
3. Generates `infra/pgbouncer/userlist.txt` from `POSTGRES_APP_PASSWORD` and `POSTGRES_WORKER_PASSWORD` environment variables
4. Runs `docker compose up -d` to start all 5 services
5. Waits for PostgreSQL to accept connections (polls `pg_isready` with 30 retries, 2 seconds apart)
6. Runs `./migrations/migrate.sh` to apply all pending migrations

**Total boot time:** ~15 seconds on a warm Docker cache (images already pulled), ~3-5 minutes on first run (pulling 5 images).

---

## 18. Runtime Issues Discovered and Fixed

During the first live deployment, 8 issues were discovered and resolved. These are documented here for future reference.

### Issue 1: Docker Image Tag `timescale/timescaledb-ha:pg16-latest` Not Found

**Symptom:** `docker compose up` fails with `manifest unknown: manifest unknown`
**Root cause:** The TimescaleDB HA image removed the `pg16-latest` tag from Docker Hub.
**Fix:** Changed to `timescale/timescaledb-ha:pg16-all` which includes all extensions (TimescaleDB, PostGIS, pgvector, pg_trgm, etc.)
**Impact:** The `-all` tag is a superset of what the spec required. All extensions are present.

### Issue 2: Docker Image Tag `redis/redisinsight:2` Not Found

**Symptom:** `docker compose up` fails with `manifest unknown`
**Root cause:** RedisInsight removed the `:2` version tag.
**Fix:** Changed to `redis/redisinsight:latest`
**Impact:** None — latest is the current version.

### Issue 3: PGDATA Path Mismatch

**Symptom:** After switching from `-ha` to non-HA and back, data directory conflict.
**Root cause:** The non-HA `timescale/timescaledb:latest-pg16` image uses `/var/lib/postgresql/data`, while the HA image uses `/home/postgres/pgdata/data` (Patroni convention). Incorrect `PGDATA` causes data loss on restart.
**Fix:** Restored `PGDATA=/home/postgres/pgdata/data` and volume mount path when switching back to the HA image.
**Learning:** Always verify the data directory convention when changing Postgres Docker images.

### Issue 4: pgAdmin Rejects `admin@narad.local` Email

**Symptom:** pgAdmin container starts but immediately exits with `'admin@narad.local' does not appear to be a valid email address`
**Root cause:** pgAdmin 4 validates the admin email and rejects `.local` TLD as a "special-use or reserved name"
**Fix:** Changed to `admin@narad.guru` (matching the project domain)
**Impact:** Cosmetic only — email is only used for pgAdmin's internal user, not for actual email delivery.

### Issue 5: Unquoted `&` in PIB_RSS_URL Breaks `.env` Sourcing

**Symptom:** `source .env` fails with `parse error near '&'`
**Root cause:** The line `PIB_RSS_URL=https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=3` contains unquoted `&` characters. When bash sources this file, `&` is interpreted as a background operator.
**Fix:** Quoted the URL: `PIB_RSS_URL="https://...&Lang=1&Regid=3"`
**Applied to:** Both `.env` and `.env.example`

### Issue 6: `gen_random_bytes()` Not Available (Missing `pgcrypto`)

**Symptom:** `SELECT uuid_generate_v7()` fails with `function gen_random_bytes(integer) does not exist`
**Root cause:** The `uuid_generate_v7()` PL/pgSQL function calls `gen_random_bytes(10)` which is provided by the `pgcrypto` extension. The extension wasn't listed in `001_extensions.sql`.
**Fix:** Added `CREATE EXTENSION IF NOT EXISTS pgcrypto;` to `001_extensions.sql`. Applied the extension and re-created the function on the running database. Updated the SHA256 in `_migrations` to match the modified file.

### Issue 7: `set -e` Kills migrate.sh Before Error Display

**Symptom:** When a migration fails, the script exits silently with no error message — just `Applying 001_extensions.sql...` and then nothing.
**Root cause:** With `set -euo pipefail`, the assignment `error_output=$(psql ... 2>&1)` exits the script if psql returns non-zero, BEFORE reaching `psql_exit=$?` or the error display code.
**Fix:** Wrapped psql calls in `if` statements which suppress `set -e` for the condition:
```bash
if error_output=$(psql ... 2>&1); then
  psql_exit=0
else
  psql_exit=$?
fi
```

### Issue 8: Local PostgreSQL Shadows PgBouncer on Port 5432

**Symptom:** `psql -h localhost -p 5432 -U narad_app` fails with `FATAL: role "narad_app" does not exist`
**Root cause:** A local Homebrew PostgreSQL installation is also listening on port 5432. When `psql` connects to `localhost:5432`, macOS resolves to the local Postgres (IPv6 `::1`) instead of Docker's PgBouncer. The local Postgres doesn't have the `narad_app` role.
**Fix:** Changed PgBouncer's host port from 5432 to 6432 (the standard PgBouncer port convention). Updated `.env`, `.env.example`, `docker-compose.yml`, and `DATABASE_URL`.

---

## 19. Verification Results — 9/9 Passing

All verification checks pass after the runtime fixes:

| # | Check | Result |
|---|---|---|
| 1 | All 7 schemas exist | **PASS** — core, workflow, audit, projections, corp_watch, lex_pulse, geo_intelligence |
| 2 | Core tables exist (≥12) | **PASS** — 13 tables in `core` schema |
| 3 | RLS enabled on `core.events` | **PASS** — `relrowsecurity = true` |
| 4 | `uuid_generate_v7()` returns valid UUID | **PASS** — `019d336d-47f6-78c5-b875-ee04e20f91b0` |
| 5 | PgBouncer accepts `narad_app` on port 6432 | **PASS** — `SELECT 1` returns `1` |
| 6 | TimescaleDB hypertable exists | **PASS** — `telemetry_events` |
| 7 | pgAdmin accessible (HTTP :5050) | **PASS** — HTTP 302 (redirect to dashboard) |
| 8 | RedisInsight accessible (HTTP :5540) | **PASS** — HTTP 200 |
| 9 | All 10 migrations tracked in `_migrations` | **PASS** — 10 rows |

### Migration Application Log

```
001_extensions.sql         — 2026-03-28 07:47:25
002_roles.sql              — 2026-03-28 07:47:25
003_schemas.sql            — 2026-03-28 07:47:26
004_core_schema.sql        — 2026-03-28 07:47:26
005_workflow_schema.sql    — 2026-03-28 07:47:26
006_domain_schemas.sql     — 2026-03-28 07:47:26
007_audit_schema.sql       — 2026-03-28 07:47:26
008_projections_schema.sql — 2026-03-28 07:47:26
009_timescaledb.sql        — 2026-03-28 07:47:26
010_grants.sql             — 2026-03-28 07:47:26
```

All 10 migrations applied in under 2 seconds.

---

## 20. File Inventory

### Infrastructure Files

| File | Lines | Purpose |
|---|---|---|
| `docker-compose.yml` | 88 | 5-service stack definition |
| `infra/pgbouncer/pgbouncer.ini` | 17 | Transaction-mode pool config |
| `infra/pgbouncer/userlist.txt` | 2 | Generated credentials (gitignored in prod) |
| `infra/pgadmin/servers.json` | 22 | Auto-register Postgres connections |
| `scripts/setup-dev.sh` | 62 | One-command dev boot |
| `migrations/migrate.sh` | 199 | Shell migration runner |
| `.env.example` | 250 | Environment variable template |

### SQL Migration Files

| File | Lines | Objects Created |
|---|---|---|
| `001_extensions.sql` | 43 | 7 extensions + `uuid_generate_v7()` function |
| `002_roles.sql` | ~50 | 5 roles with idempotency guards |
| `003_schemas.sql` | ~20 | 7 schemas + `set_updated_at()` trigger function |
| `004_core_schema.sql` | ~406 | 13 tables, RLS, triggers, indexes |
| `005_workflow_schema.sql` | ~241 | 11 tables, RLS, triggers, indexes |
| `006_domain_schemas.sql` | ~100 | 4 tables with specialized indexes |
| `007_audit_schema.sql` | ~80 | 2 tables + 3 partitions, INSERT-only enforcement |
| `008_projections_schema.sql` | ~60 | 4 CQRS projection tables |
| `009_timescaledb.sql` | ~50 | 1 hypertable + 2 continuous aggregates |
| `010_grants.sql` | ~40 | GRANT/REVOKE for all 3 group roles |

### Monorepo Skeleton

| File | Purpose |
|---|---|
| `apps/intelligence/.gitkeep` | Phase 2B: Python FastAPI + Celery |
| `apps/web/.gitkeep` | Phase 2C: Next.js 15 frontend |
| `packages/.gitkeep` | Shared configuration packages |

---

## 21. Git History

19 commits in chronological order:

```
20dff5a chore: initialize repo — Phase 1 docs and .env.example
e6e7385 feat: add monorepo skeleton for Phase 2B/2C
dc75fec feat: add Phase 2A docker stack variables to .env.example
6bea611 feat: add docker-compose.yml with 5-service data plane stack
db7cf16 feat: add PgBouncer transaction-mode pool configuration
235d604 feat: add pgAdmin server auto-registration for NARAD V2
3428bdd feat: add setup-dev.sh one-command dev environment boot
489c47c feat: add migrate.sh shell runner with sha256 idempotency tracking
39fe2be fix: migrate.sh — atomic transactions, stderr capture, PSQL_CONN array propagation
5b34782 feat: add 001_extensions.sql with pg_uuidv7 fallback
efa8a1e feat: add 002_roles.sql with 5 RBAC roles
e78ed6d feat: add 003_schemas.sql with 7 schemas and set_updated_at trigger
a9f6371 feat: add 004_core_schema.sql with 12 core tables, RLS, indexes, triggers
8e73285 feat: add 005_workflow_schema.sql with 11 workflow tables
2b00396 feat: add 006_domain_schemas.sql with corp_watch, lex_pulse, geo_intelligence tables
d7044f6 feat: add 007_audit_schema.sql with partitioned INSERT-only audit tables
9d2757a feat: add 008_projections_schema.sql with 4 CQRS projection tables
777219f feat: add 009_timescaledb.sql with hypertable, retention, compression, aggregates
7098e56 feat: add 010_grants.sql completing RBAC grant configuration
```

---

## 22. What Phase 2B Will Build On Top Of This

Phase 2B (Intelligence Plane) will add:

- **Python FastAPI app** in `apps/intelligence/` — connects to PgBouncer on `localhost:6432` as `narad_worker`
- **Celery workers** — asynchronous task processing for data ingestion and projection updates
- **Source adapters** — 32 data source connectors (PIB, ACLED, GDELT, NASA FIRMS, etc.)
- **Ingest pipeline** — Event extraction, entity resolution, claim extraction, embedding generation
- **Partition management cron** — Creates `audit_log` monthly partitions on the 20th
- **Projection workers** — Update CQRS projection tables when write model changes

Phase 2C (Presentation Plane) will add:

- **Next.js 15 frontend** in `apps/web/` — connects to PgBouncer on `localhost:6432` as `narad_app`
- **Sovereign Midnight design system** — Dark-mode intelligence UI
- **Real-time dashboard** — WebSocket-powered event feed, map view, watchlist alerts

---

## 23. Open Decisions Carried Forward

| Decision | Current Default | When to Revisit |
|---|---|---|
| PgBouncer `auth_type = plain` | Plaintext passwords in `userlist.txt` | Switch to `scram-sha-256` before production deployment |
| Audit log partition creation | Manual cron job (Phase 2B) | Automate via `pg_cron` extension in Phase 7 |
| `userlist.txt` committed to repo | Dev only with generated passwords | Inject via secrets manager (Vault, AWS Secrets Manager) in production |
| PgBouncer host port | 6432 (changed from spec's 5432) | If local Postgres is removed, could revert to 5432 |
| Docker image tags | `:pg16-all`, `:latest` | Pin to specific versions before production |
| `pgcrypto` extension | Added for `gen_random_bytes()` | If `pg_uuidv7` C extension becomes available in image, `pgcrypto` can be removed |
