# Phase 2B: Intelligence Plane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a running, verified intelligence plane in `apps/intelligence` with FastAPI, Celery, source adapter scaffolding, CQRS command handlers, projection updaters, and Redis event publishing.

**Architecture:** The intelligence plane is a Python 3.12 service set built on top of the Phase 2A data plane. FastAPI exposes health and admin endpoints. Celery worker and beat process ingestion, enrichment, projection, and maintenance work. Canonical tables remain the write model; `projections.*` tables remain the read model; Redis carries delta-friendly `narad:*` events for the app plane.

**Tech Stack:** Python 3.12, FastAPI, Uvicorn, Celery, Redis, asyncpg, SQLAlchemy 2.0 asyncio, Pydantic Settings, httpx, Google Gemini, Bhashini

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `apps/intelligence/pyproject.toml` | Create | Python package and tool configuration |
| `apps/intelligence/Dockerfile` | Create | Multi-stage image for API, worker, beat |
| `apps/intelligence/src/narad/__init__.py` | Create | Package marker |
| `apps/intelligence/src/narad/main.py` | Create | FastAPI app factory |
| `apps/intelligence/src/narad/config.py` | Create | Settings and environment parsing |
| `apps/intelligence/src/narad/dependencies.py` | Create | Dependency injection helpers |
| `apps/intelligence/src/narad/db/session.py` | Create | asyncpg pool and query helpers |
| `apps/intelligence/src/narad/db/models.py` | Create | Read-oriented model metadata and typed records |
| `apps/intelligence/src/narad/api/health.py` | Create | `/health` endpoint |
| `apps/intelligence/src/narad/api/admin.py` | Create | Source and pipeline admin endpoints |
| `apps/intelligence/src/narad/workers/celery_app.py` | Create | Celery app and queue config |
| `apps/intelligence/src/narad/workers/ingest_tasks.py` | Create | Source polling and ingest tasks |
| `apps/intelligence/src/narad/workers/enrichment_tasks.py` | Create | Translation, extraction, story tasks |
| `apps/intelligence/src/narad/workers/projection_tasks.py` | Create | Projection update tasks |
| `apps/intelligence/src/narad/workers/maintenance_tasks.py` | Create | Partition and cleanup tasks |
| `apps/intelligence/src/narad/adapters/base.py` | Create | Adapter protocol |
| `apps/intelligence/src/narad/adapters/registry.py` | Create | Adapter registry and seed metadata |
| `apps/intelligence/src/narad/adapters/tier1/*.py` | Create | Tier 1 official source adapters |
| `apps/intelligence/src/narad/services/*.py` | Create | Embedding, translation, LLM, resolver, clusterer, rule evaluator |
| `apps/intelligence/src/narad/commands/*.py` | Create | CQRS write-side commands |
| `apps/intelligence/src/narad/projections/*.py` | Create | Projection updater modules |
| `apps/intelligence/src/narad/events/types.py` | Create | Domain event payload contracts |
| `apps/intelligence/src/narad/events/publisher.py` | Create | Redis pub/sub publisher |
| `apps/intelligence/tests/**` | Create | Unit and integration tests |
| `.env.example` | Modify | Add Phase 2B runtime variables |
| `docker-compose.yml` | Modify | Add `intelligence`, `celery-worker`, `celery-beat` |
| `migrations/011_intelligence_plane.sql` | Create | Phase 2B indexes and system user |

---

## Task 1: Scaffold `apps/intelligence`

**Files:**
- Create: `apps/intelligence/pyproject.toml`
- Create: `apps/intelligence/Dockerfile`
- Create: `apps/intelligence/src/narad/__init__.py`
- Create: `apps/intelligence/src/narad/main.py`
- Create: `apps/intelligence/src/narad/config.py`
- Create: `apps/intelligence/src/narad/dependencies.py`

- [ ] **Step 1: Create package layout**

```bash
mkdir -p apps/intelligence/src/narad \
         apps/intelligence/src/narad/{api,db,workers,adapters/tier1,adapters/tier2,adapters/tier3,services,commands,projections,events} \
         apps/intelligence/tests
```

- [ ] **Step 2: Add package metadata and Dockerfile**

Requirements:
- Python `>=3.12`
- FastAPI + Uvicorn
- Celery + Redis
- asyncpg + SQLAlchemy asyncio
- Pydantic Settings
- httpx
- Google Gemini SDK
- pytest + ruff + mypy in `dev`

- [ ] **Step 3: Verify import and build metadata**

```bash
cd apps/intelligence
python3 -m compileall src
```
Expected: no syntax errors

---

## Task 2: Environment and Compose Integration

**Files:**
- Modify: `.env.example`
- Modify: `docker-compose.yml`

- [ ] **Step 1: Add Phase 2B variables to `.env.example`**

Add:

```bash
INTELLIGENCE_PORT=8000
CELERY_BROKER_URL=redis://localhost:6379/3
CELERY_RESULT_BACKEND=redis://localhost:6379/4
CELERY_WORKER_CONCURRENCY=4
CELERY_WORKER_PREFETCH_MULTIPLIER=2
CELERY_TASK_SOFT_TIME_LIMIT=300
CELERY_TASK_TIME_LIMIT=600
INGEST_POLL_INTERVAL_MS=60000
EMBED_BATCH_SIZE=50
EMBED_BATCH_WINDOW_MS=30000
FEED_PROJECTION_BATCH_MS=500
```

- [ ] **Step 2: Add intelligence services to `docker-compose.yml`**

Add:
- `intelligence`
- `celery-worker`
- `celery-beat`

Use Docker-internal URLs:
- `postgresql://narad_worker:${POSTGRES_WORKER_PASSWORD}@pgbouncer:5432/narad_v2`
- `redis://redis:6379/0`
- `redis://redis:6379/3`
- `redis://redis:6379/4`

- [ ] **Step 3: Validate compose syntax**

```bash
docker compose config --quiet && echo "OK: compose valid"
```
Expected: `OK: compose valid`

---

## Task 3: Database and Runtime Core

**Files:**
- Create: `apps/intelligence/src/narad/db/session.py`
- Create: `apps/intelligence/src/narad/db/models.py`
- Create: `migrations/011_intelligence_plane.sql`

- [ ] **Step 1: Implement settings-backed DB pool**

Requirements:
- asyncpg pool via PgBouncer
- pool sizing derived from config
- statement cache disabled for PgBouncer compatibility

- [ ] **Step 2: Add migration `011_intelligence_plane.sql`**

Include:
- unique index on `core.claims(lineage_hash)`
- deterministic system user insert
- canonicalization query index on `core.events`
- entity overlap index on `core.event_entity_links`
- worker grants required by workflow/audit writes

- [ ] **Step 3: Verify migration file is discoverable**

```bash
ls migrations/011_intelligence_plane.sql
```

---

## Task 4: FastAPI App and Route Surface

**Files:**
- Create: `apps/intelligence/src/narad/api/health.py`
- Create: `apps/intelligence/src/narad/api/admin.py`
- Create: `apps/intelligence/src/narad/main.py`

- [ ] **Step 1: Implement app factory**

Requirements:
- `/health`
- `/api/admin/sources`
- `/api/admin/sources/{source_id}/trigger`
- `/api/admin/pipeline/status`
- `/api/admin/maintenance/create-partition`
- `/api/admin/pipeline/dlq*`

- [ ] **Step 2: Implement health contract**

Health payload must include:
- database status and latency
- redis status and latency
- celery worker count and queue depth
- version
- timestamp

- [ ] **Step 3: Keep admin auth-ready**

Do not implement a separate auth system in Phase 2B. Structure routes so Phase 2C can wrap them with shared JWT validation without refactoring route signatures.

---

## Task 5: Celery App, Queues, and Scheduled Work

**Files:**
- Create: `apps/intelligence/src/narad/workers/celery_app.py`
- Create: `apps/intelligence/src/narad/workers/ingest_tasks.py`
- Create: `apps/intelligence/src/narad/workers/enrichment_tasks.py`
- Create: `apps/intelligence/src/narad/workers/projection_tasks.py`
- Create: `apps/intelligence/src/narad/workers/maintenance_tasks.py`

- [ ] **Step 1: Configure Celery queues**

Queues:
- `ingest`
- `enrichment`
- `projection`
- `maintenance`
- `default`

- [ ] **Step 2: Register beat schedules**

Schedules:
- periodic source polling
- embedding batch flush
- partition pre-creation
- stale cache cleanup

- [ ] **Step 3: Verify worker boot**

```bash
docker compose up -d intelligence celery-worker celery-beat
docker compose logs celery-beat | grep "beat: Starting"
```
Expected: beat startup log present

---

## Task 6: Source Adapter Framework

**Files:**
- Create: `apps/intelligence/src/narad/adapters/base.py`
- Create: `apps/intelligence/src/narad/adapters/registry.py`
- Create: `apps/intelligence/src/narad/adapters/tier1/*.py`

- [ ] **Step 1: Implement adapter protocol**

Required methods:
- fetch source payload
- normalize into internal document input
- expose adapter metadata
- classify trust tier and source slug

- [ ] **Step 2: Seed Tier 1 adapters**

Create initial adapters for:
- PIB
- eGazette
- SEBI
- MCA21
- Parliament
- RBI
- DPI

- [ ] **Step 3: Tier 2 and Tier 3 handling**

Rules:
- Tier 2 may exist as stubbed adapter modules where the source contract is incomplete
- Tier 3 must require governance approval before runnable ingest

---

## Task 7: Command Handlers and Shared Services

**Files:**
- Create: `apps/intelligence/src/narad/commands/*.py`
- Create: `apps/intelligence/src/narad/services/*.py`
- Create: `apps/intelligence/src/narad/events/*.py`

- [ ] **Step 1: Implement command layer**

Commands:
- `ingest_document`
- `extract_claims`
- `canonicalize_event`
- `resolve_entity`
- `generate_story_capsule`
- `evaluate_watchlist_rules`
- `transition_state`

- [ ] **Step 2: Implement services**

Services:
- embedding
- translation
- llm
- entity_resolver
- event_clusterer
- rule_evaluator

- [ ] **Step 3: Emit Redis delta events**

Publish `narad:*` events only after canonical/projection writes succeed. Payloads must be app-plane friendly and delta-oriented.

---

## Task 8: Projection Updaters

**Files:**
- Create: `apps/intelligence/src/narad/projections/pulseboard.py`
- Create: `apps/intelligence/src/narad/projections/watchlist_deltas.py`
- Create: `apps/intelligence/src/narad/projections/entity_summaries.py`
- Create: `apps/intelligence/src/narad/projections/regulatory_digest.py`

- [ ] **Step 1: Implement projection updaters**

Target tables:
- `projections.pulseboard_feed`
- `projections.watchlist_deltas`
- `projections.entity_summaries`
- `projections.regulatory_digest`

- [ ] **Step 2: Enforce write-side discipline**

Rules:
- canonical tables are authoritative
- projection refreshes are asynchronous
- projection payloads are optimized for app-plane reads, not canonical fidelity

---

## Task 9: Test Coverage

**Files:**
- Create: `apps/intelligence/tests/**`

- [ ] **Step 1: Add unit coverage**

Cover:
- settings
- db session
- adapter protocol
- command handlers
- projection functions
- event publisher

- [ ] **Step 2: Add integration coverage**

Cover:
- `/health`
- `/api/admin/sources`
- one adapter ingest path
- one projection refresh path

---

## Task 10: Verification Checklist

- [ ] **Step 1: App boots**

```bash
curl -s http://localhost:8000/health | jq '.status'
```
Expected: `"healthy"`

- [ ] **Step 2: Worker visible through health**

```bash
curl -s http://localhost:8000/health | jq '.checks.celery.active_workers'
```
Expected: `>= 1`

- [ ] **Step 3: Admin endpoints respond**

```bash
curl -s http://localhost:8000/api/admin/sources | jq '.total'
curl -s http://localhost:8000/api/admin/pipeline/status | jq '.workers.total'
```

- [ ] **Step 4: Migration applied**

```bash
psql postgres://postgres:${POSTGRES_SUPERUSER_PASSWORD}@localhost:5433/narad_v2 \
  -c "SELECT filename FROM public._migrations WHERE filename = '011_intelligence_plane.sql';"
```

- [ ] **Step 5: Redis channels appear after first ingest**

```bash
docker compose exec redis redis-cli PUBSUB CHANNELS 'narad:*'
```

---

## Commit Sequence

Suggested commit sequence:

1. `feat: scaffold intelligence plane package and runtime`
2. `feat: add intelligence services to docker compose`
3. `feat: add intelligence plane migration and db runtime`
4. `feat: add FastAPI health and admin endpoints`
5. `feat: add Celery workers and scheduled tasks`
6. `feat: add source adapter registry and Tier 1 adapters`
7. `feat: add CQRS commands, services, and event publisher`
8. `feat: add intelligence projections and backend tests`
