# NARAD V2 — Phase 2B Design Spec
## Intelligence Plane (Python FastAPI + Celery)

**Date:** 2026-03-28
**Session:** 2B of Phase 2
**Status:** Approved — locked for implementation
**Depends on:** Phase 2A Data Plane (complete — 5 Docker services, 37 tables, 7 schemas)
**Builds on:** `docs/superpowers/specs/2026-03-27-phase-2a-data-plane-design.md`

---

## 1. Scope

This session produces a running intelligence plane:
- Python FastAPI application with health and admin endpoints
- Celery worker with 7 task queues across 4 task modules
- Celery Beat scheduler for periodic ingestion and maintenance
- 32 source adapters organized by trust tier
- 7 CQRS command handlers (ingest, extract, canonicalize, resolve, generate, evaluate, transition)
- 4 projection updaters (pulseboard, watchlist_deltas, entity_summaries, regulatory_digest)
- 6 shared services (embedding, translation, LLM, entity resolver, event clusterer, rule evaluator)
- Redis pub/sub event publishing for real-time UI
- 3 new Docker Compose services (intelligence, celery-worker, celery-beat)
- Dockerfile for the intelligence plane

**Out of scope for this session:** Next.js frontend, WebSocket server, authentication/authorization middleware, S3 integration, OpenTelemetry instrumentation.

---

## 2. Directory Structure

```
apps/intelligence/
├── pyproject.toml                      # uv/pip package definition
├── Dockerfile                          # Multi-stage Python 3.12 build
├── alembic.ini                         # NOT used — migrations handled by migrate.sh
├── src/
│   └── narad/
│       ├── __init__.py                 # Package marker
│       ├── main.py                     # FastAPI app factory
│       ├── config.py                   # Pydantic Settings from .env
│       ├── dependencies.py             # FastAPI dependency injection
│       ├── db/
│       │   ├── __init__.py
│       │   ├── session.py              # asyncpg pool setup via PgBouncer
│       │   └── models.py              # SQLAlchemy 2.0 models (read-only, type safety)
│       ├── commands/                    # CQRS command handlers (write side)
│       │   ├── __init__.py
│       │   ├── ingest_document.py
│       │   ├── extract_claims.py
│       │   ├── canonicalize_event.py
│       │   ├── resolve_entity.py
│       │   ├── generate_story_capsule.py
│       │   ├── evaluate_watchlist_rules.py
│       │   └── transition_state.py
│       ├── workers/                     # Celery task definitions
│       │   ├── __init__.py
│       │   ├── celery_app.py           # Celery app factory + config
│       │   ├── ingest_tasks.py         # Source polling + document ingestion
│       │   ├── enrichment_tasks.py     # Translation, claim extraction, story capsules
│       │   ├── projection_tasks.py     # CQRS projection rebuilds
│       │   └── maintenance_tasks.py    # Partition creation, stale data cleanup
│       ├── adapters/                    # Source adapters (32 sources)
│       │   ├── __init__.py
│       │   ├── base.py                 # Abstract adapter protocol
│       │   ├── registry.py             # Adapter discovery + lookup
│       │   ├── tier1/                  # Government sources (trust_tier=1)
│       │   │   ├── __init__.py
│       │   │   ├── pib.py              # Press Information Bureau (RSS)
│       │   │   ├── egazette.py         # eGazette of India (scrape + API)
│       │   │   ├── sebi.py             # SEBI orders/circulars (API)
│       │   │   ├── mca21.py            # MCA21 company filings (API)
│       │   │   ├── parliament.py       # Lok Sabha / Rajya Sabha (scrape)
│       │   │   ├── rbi.py              # Reserve Bank of India (API + RSS)
│       │   │   └── dpi.py              # Digital Public Infrastructure
│       │   ├── tier2/                  # Structured enrichment (trust_tier=2)
│       │   │   ├── __init__.py
│       │   │   ├── acled.py            # Armed Conflict Location & Event Data
│       │   │   ├── nasa_firms.py       # NASA Fire Information
│       │   │   ├── opensky.py          # ADS-B aircraft tracking
│       │   │   ├── gdelt.py            # Global media monitoring
│       │   │   ├── imd.py              # Indian Meteorological Department
│       │   │   ├── ndma.py             # National Disaster Management Authority
│       │   │   ├── bse.py              # Bombay Stock Exchange
│       │   │   └── nse.py              # National Stock Exchange
│       │   └── tier3/                  # OSINT (trust_tier=3, governance_approved required)
│       │       ├── __init__.py
│       │       ├── twitter.py          # X/Twitter monitoring
│       │       ├── reddit.py           # Reddit community signals
│       │       ├── telegram.py         # Telegram channel monitoring
│       │       ├── youtube.py          # YouTube press conferences
│       │       ├── google_search.py    # Web crawl fallback
│       │       └── newsapi.py          # Aggregated news
│       ├── services/                   # Shared business logic
│       │   ├── __init__.py
│       │   ├── embedding.py            # Batch embedding generation
│       │   ├── translation.py          # Bhashini API client
│       │   ├── llm.py                  # Gemini API client (claim extraction + story capsules)
│       │   ├── entity_resolver.py      # pg_trgm + pgvector matching
│       │   ├── event_clusterer.py      # Temporal + spatial + semantic clustering
│       │   └── rule_evaluator.py       # JSON Logic watchlist rule evaluation
│       ├── projections/                # CQRS projection updaters
│       │   ├── __init__.py
│       │   ├── pulseboard.py           # projections.pulseboard_feed
│       │   ├── watchlist_deltas.py     # projections.watchlist_deltas
│       │   ├── entity_summaries.py     # projections.entity_summaries
│       │   └── regulatory_digest.py    # projections.regulatory_digest
│       ├── events/                     # Domain event definitions + publisher
│       │   ├── __init__.py
│       │   ├── types.py                # Event type constants + Pydantic models
│       │   └── publisher.py            # Redis pub/sub publisher
│       └── api/                        # FastAPI routes (admin/health only)
│           ├── __init__.py
│           ├── health.py               # GET /health
│           └── admin.py                # Source management, manual triggers
├── tests/
│   ├── conftest.py                     # Shared fixtures (DB pool, Redis, test tenant)
│   ├── test_commands/
│   │   ├── test_ingest_document.py
│   │   ├── test_extract_claims.py
│   │   ├── test_canonicalize_event.py
│   │   ├── test_resolve_entity.py
│   │   ├── test_generate_story_capsule.py
│   │   ├── test_evaluate_watchlist_rules.py
│   │   └── test_transition_state.py
│   ├── test_adapters/
│   │   ├── test_base.py
│   │   ├── test_pib.py
│   │   └── test_gdelt.py
│   ├── test_services/
│   │   ├── test_embedding.py
│   │   ├── test_translation.py
│   │   ├── test_llm.py
│   │   ├── test_entity_resolver.py
│   │   ├── test_event_clusterer.py
│   │   └── test_rule_evaluator.py
│   └── test_projections/
│       ├── test_pulseboard.py
│       ├── test_watchlist_deltas.py
│       ├── test_entity_summaries.py
│       └── test_regulatory_digest.py
└── docker/
    └── Dockerfile                      # Symlink or copy of top-level Dockerfile
```

**Total new files:** ~75 Python files + 1 Dockerfile + 1 pyproject.toml

---

## 3. Docker Integration

### 3.1 New Services Added to `docker-compose.yml`

Three new services join the existing 5 (postgres, redis, pgbouncer, pgadmin, redisinsight):

```yaml
  intelligence:
    build:
      context: ./apps/intelligence
      dockerfile: Dockerfile
    command: >
      uvicorn narad.main:create_app --factory
      --host 0.0.0.0 --port 8000
      --workers 2
      --loop uvloop
      --http httptools
      --log-level info
    ports:
      - "${INTELLIGENCE_PORT:-8000}:8000"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      pgbouncer:
        condition: service_started
    env_file:
      - .env
    environment:
      DATABASE_URL: postgresql://narad_worker:${POSTGRES_WORKER_PASSWORD}@pgbouncer:5432/narad_v2
      REDIS_URL: redis://redis:6379/0
      CELERY_BROKER_URL: redis://redis:6379/3
      CELERY_RESULT_BACKEND: redis://redis:6379/4
    networks:
      - narad
    healthcheck:
      test: ["CMD", "python", "-c", "import httpx; r = httpx.get('http://localhost:8000/health'); r.raise_for_status()"]
      interval: 10s
      timeout: 5s
      retries: 3
      start_period: 15s
    restart: unless-stopped

  celery-worker:
    build:
      context: ./apps/intelligence
      dockerfile: Dockerfile
    command: >
      celery -A narad.workers.celery_app:celery worker
      --loglevel=info
      --concurrency=4
      --prefetch-multiplier=2
      -Q ingest,enrichment,projection,maintenance,default
      -n worker@%h
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      pgbouncer:
        condition: service_started
    env_file:
      - .env
    environment:
      DATABASE_URL: postgresql://narad_worker:${POSTGRES_WORKER_PASSWORD}@pgbouncer:5432/narad_v2
      REDIS_URL: redis://redis:6379/0
      CELERY_BROKER_URL: redis://redis:6379/3
      CELERY_RESULT_BACKEND: redis://redis:6379/4
    networks:
      - narad
    restart: unless-stopped

  celery-beat:
    build:
      context: ./apps/intelligence
      dockerfile: Dockerfile
    command: >
      celery -A narad.workers.celery_app:celery beat
      --loglevel=info
      --schedule=/tmp/celerybeat-schedule
    depends_on:
      - celery-worker
    env_file:
      - .env
    environment:
      DATABASE_URL: postgresql://narad_worker:${POSTGRES_WORKER_PASSWORD}@pgbouncer:5432/narad_v2
      REDIS_URL: redis://redis:6379/0
      CELERY_BROKER_URL: redis://redis:6379/3
      CELERY_RESULT_BACKEND: redis://redis:6379/4
    networks:
      - narad
    restart: unless-stopped
```

### 3.2 Redis DB Allocation

Redis databases are partitioned by concern:

| DB | Purpose | Used by |
|---|---|---|
| `0` | Pub/sub event bus + general cache | intelligence, celery-worker, (future: Next.js) |
| `1` | Semantic cache (LexPulse RAG) | intelligence |
| `2` | WebSocket presence (Phase 2C) | (future: Next.js) |
| `3` | Celery broker (task queue) | celery-worker, celery-beat |
| `4` | Celery result backend | celery-worker |

### 3.3 Dockerfile

```dockerfile
# apps/intelligence/Dockerfile
# Multi-stage build for Python 3.12 intelligence plane

# ── Stage 1: Builder ─────────────────────────────────────────────────────
FROM python:3.12-slim AS builder

WORKDIR /build

# System deps for asyncpg, psycopg2 (build only)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./
RUN pip install --no-cache-dir --prefix=/install .

# ── Stage 2: Runtime ─────────────────────────────────────────────────────
FROM python:3.12-slim AS runtime

WORKDIR /app

# Runtime deps only
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy installed packages from builder
COPY --from=builder /install /usr/local

# Copy application code
COPY src/ ./

# Non-root user
RUN useradd --create-home --shell /bin/bash narad
USER narad

# Health check dependency
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app

EXPOSE 8000

CMD ["uvicorn", "narad.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000"]
```

### 3.4 New Environment Variables

Added to `.env.example` under a `# -- Phase 2B: Intelligence Plane --` section:

```bash
# ── Phase 2B: Intelligence Plane ──────────────────────────────────────────

# Intelligence API
INTELLIGENCE_PORT=8000

# Celery
CELERY_BROKER_URL=redis://localhost:6379/3
CELERY_RESULT_BACKEND=redis://localhost:6379/4
CELERY_WORKER_CONCURRENCY=4
CELERY_WORKER_PREFETCH_MULTIPLIER=2
CELERY_TASK_SOFT_TIME_LIMIT=300
CELERY_TASK_TIME_LIMIT=600
```

Note: `GEMINI_API_KEY`, `BHASHINI_*`, `EMBEDDING_*`, `INGEST_POLL_INTERVAL_MS`, `EMBED_BATCH_SIZE`, and `EMBED_BATCH_WINDOW_MS` already exist in `.env.example` from Phase 2A scaffolding.

---

## 4. FastAPI Application Architecture

### 4.1 App Factory (`main.py`)

```python
from fastapi import FastAPI
from contextlib import asynccontextmanager

from narad.config import get_settings
from narad.db.session import create_pool, close_pool
from narad.events.publisher import EventPublisher
from narad.api.health import router as health_router
from narad.api.admin import router as admin_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage connection pools and shared resources."""
    settings = get_settings()
    # Startup
    app.state.db_pool = await create_pool(settings.database_url)
    app.state.redis = await EventPublisher.create(settings.redis_url)
    yield
    # Shutdown
    await close_pool(app.state.db_pool)
    await app.state.redis.close()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="NARAD V2 Intelligence Plane",
        version="0.1.0",
        docs_url="/docs" if settings.debug else None,
        redoc_url=None,
        lifespan=lifespan,
    )
    app.include_router(health_router)
    app.include_router(admin_router, prefix="/api/admin")
    return app
```

### 4.2 Configuration (`config.py`)

```python
from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    database_url: str  # PgBouncer URL for app queries
    database_pool_min: int = 5
    database_pool_max: int = 20

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # Celery
    celery_broker_url: str = "redis://localhost:6379/3"
    celery_result_backend: str = "redis://localhost:6379/4"

    # LLM
    gemini_api_key: str = ""
    gemini_model_mid: str = "gemini-2.5-flash"
    gemini_model_large: str = "gemini-2.5-pro"

    # Translation
    bhashini_api_key: str = ""
    bhashini_user_id: str = ""
    bhashini_pipeline_id: str = ""
    bhashini_base_url: str = "https://dhruva-api.bhashini.gov.in"

    # Embeddings
    embedding_provider: str = "gemini"
    embedding_model: str = "text-embedding-004"
    embedding_dimensions: int = 768

    # Ingest
    ingest_poll_interval_ms: int = 60000
    embed_batch_size: int = 50
    embed_batch_window_ms: int = 30000

    # Projections
    feed_projection_batch_ms: int = 500

    # Application
    debug: bool = False
    log_level: str = "info"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
```

### 4.3 Database Session (`db/session.py`)

```python
import asyncpg
from typing import AsyncGenerator


async def create_pool(database_url: str, min_size: int = 5, max_size: int = 20) -> asyncpg.Pool:
    """Create asyncpg connection pool.

    Connects through PgBouncer (transaction mode).
    Uses unnamed prepared statements for PgBouncer compatibility.
    """
    pool = await asyncpg.create_pool(
        database_url,
        min_size=min_size,
        max_size=max_size,
        # PgBouncer transaction-mode compatibility:
        # disable automatic statement cache (named prepared statements
        # break transaction-mode pooling)
        statement_cache_size=0,
        # Set RLS tenant context on each acquired connection
        setup=_setup_connection,
    )
    return pool


async def _setup_connection(conn: asyncpg.Connection):
    """Called each time a connection is acquired from the pool.

    Note: tenant_id is set per-query via set_tenant(), not here,
    because PgBouncer transaction mode resets session state between
    transactions.
    """
    pass


async def set_tenant(conn: asyncpg.Connection, tenant_id: str):
    """Set RLS tenant context for the current transaction."""
    await conn.execute(
        "SELECT set_config('app.current_tenant_id', $1, TRUE)",
        tenant_id,
    )


async def close_pool(pool: asyncpg.Pool):
    """Gracefully close all connections in the pool."""
    await pool.close()
```

Key detail: `statement_cache_size=0` is required because PgBouncer in transaction mode does not support named prepared statements. The `set_config(..., TRUE)` third argument makes the setting transaction-local, which is correct for PgBouncer transaction mode.

### 4.4 Dependency Injection (`dependencies.py`)

```python
from typing import Annotated, AsyncGenerator
from fastapi import Depends, Request
import asyncpg

from narad.events.publisher import EventPublisher


async def get_db_pool(request: Request) -> asyncpg.Pool:
    return request.app.state.db_pool


async def get_connection(
    pool: Annotated[asyncpg.Pool, Depends(get_db_pool)]
) -> AsyncGenerator[asyncpg.Connection, None]:
    async with pool.acquire() as conn:
        yield conn


async def get_event_publisher(request: Request) -> EventPublisher:
    return request.app.state.redis


DbPool = Annotated[asyncpg.Pool, Depends(get_db_pool)]
DbConn = Annotated[asyncpg.Connection, Depends(get_connection)]
Publisher = Annotated[EventPublisher, Depends(get_event_publisher)]
```

---

## 5. Celery Worker Architecture

### 5.1 Celery App Factory (`workers/celery_app.py`)

```python
from celery import Celery
from celery.schedules import crontab
from narad.config import get_settings

settings = get_settings()

celery = Celery(
    "narad",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
)

celery.conf.update(
    # Serialization
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="Asia/Kolkata",
    enable_utc=True,

    # Routing
    task_default_queue="default",
    task_routes={
        "narad.workers.ingest_tasks.*": {"queue": "ingest"},
        "narad.workers.enrichment_tasks.*": {"queue": "enrichment"},
        "narad.workers.projection_tasks.*": {"queue": "projection"},
        "narad.workers.maintenance_tasks.*": {"queue": "maintenance"},
    },

    # Reliability
    task_acks_late=True,
    worker_prefetch_multiplier=2,
    task_reject_on_worker_lost=True,

    # Time limits (seconds)
    task_soft_time_limit=300,    # 5 min soft limit (raises SoftTimeLimitExceeded)
    task_time_limit=600,         # 10 min hard kill

    # Result expiry
    result_expires=3600,         # 1 hour

    # Worker
    worker_concurrency=4,
    worker_max_tasks_per_child=1000,  # Restart worker process after 1000 tasks (memory leak guard)

    # Beat schedule
    beat_schedule={
        # Source polling — runs every INGEST_POLL_INTERVAL_MS (default: 60s)
        "poll-active-sources": {
            "task": "narad.workers.ingest_tasks.poll_active_sources",
            "schedule": settings.ingest_poll_interval_ms / 1000.0,
            "options": {"queue": "ingest"},
        },
        # Embedding batch flush — runs every EMBED_BATCH_WINDOW_MS (default: 30s)
        "flush-embedding-batch": {
            "task": "narad.workers.enrichment_tasks.flush_embedding_batch",
            "schedule": settings.embed_batch_window_ms / 1000.0,
            "options": {"queue": "enrichment"},
        },
        # Audit partition creation — 20th of each month at 02:00 IST
        "create-next-audit-partition": {
            "task": "narad.workers.maintenance_tasks.create_audit_partition",
            "schedule": crontab(day_of_month="20", hour="2", minute="0"),
            "options": {"queue": "maintenance"},
        },
        # Stale projection cleanup — daily at 03:00 IST
        "cleanup-stale-projections": {
            "task": "narad.workers.maintenance_tasks.cleanup_stale_projections",
            "schedule": crontab(hour="3", minute="0"),
            "options": {"queue": "maintenance"},
        },
        # Source health check — every 5 minutes
        "check-source-health": {
            "task": "narad.workers.maintenance_tasks.check_source_health",
            "schedule": 300.0,
            "options": {"queue": "maintenance"},
        },
    },
)

# Auto-discover tasks in workers/ modules
celery.autodiscover_tasks(["narad.workers"])
```

### 5.2 Queue Design

| Queue | Purpose | Concurrency | Typical Tasks |
|---|---|---|---|
| `ingest` | Source polling + document storage | 4 workers | `poll_active_sources`, `ingest_from_source`, `ingest_document` |
| `enrichment` | LLM + translation + embedding + entity + event | 4 workers | `translate_document`, `extract_claims`, `canonicalize_event`, `resolve_entity`, `generate_story_capsule`, `flush_embedding_batch` |
| `projection` | CQRS projection rebuilds | 2 workers | `update_pulseboard`, `update_watchlist_deltas`, `update_entity_summaries`, `update_regulatory_digest` |
| `maintenance` | Scheduled ops | 1 worker | `create_audit_partition`, `cleanup_stale_projections`, `check_source_health` |
| `default` | Fallback queue | 1 worker | Unrouted tasks |

All queues consumed by the single `celery-worker` service. Production deployment may split to dedicated worker pods per queue.

### 5.3 Task Modules

#### `ingest_tasks.py` — Source Polling + Document Ingestion

```python
@celery.task(name="narad.workers.ingest_tasks.poll_active_sources")
def poll_active_sources():
    """Celery Beat entry point: query core.sources WHERE is_active=TRUE,
    dispatch ingest_from_source for each."""

@celery.task(name="narad.workers.ingest_tasks.ingest_from_source",
             bind=True, max_retries=5, default_retry_delay=2)
def ingest_from_source(self, source_id: str, tenant_id: str):
    """Instantiate adapter for source, fetch new items, dispatch
    ingest_document for each."""

@celery.task(name="narad.workers.ingest_tasks.ingest_document",
             bind=True, max_retries=5, default_retry_delay=2)
def ingest_document(self, document_payload: dict, source_id: str, tenant_id: str):
    """Execute IngestDocument command. On success, chain:
    translate (if non-English) → extract_claims → canonicalize_event."""
```

#### `enrichment_tasks.py` — LLM + Translation + Embedding

```python
@celery.task(name="narad.workers.enrichment_tasks.translate_document",
             bind=True, max_retries=3, default_retry_delay=5)
def translate_document(self, document_id: str, tenant_id: str):
    """Call Bhashini API to translate document body to English.
    Update core.documents.translated_text. Chain to extract_claims."""

@celery.task(name="narad.workers.enrichment_tasks.extract_claims",
             bind=True, max_retries=3, default_retry_delay=5)
def extract_claims(self, document_id: str, tenant_id: str):
    """Call Gemini to extract claims from document text.
    Insert into core.claims. Chain to canonicalize_event."""

@celery.task(name="narad.workers.enrichment_tasks.canonicalize_event",
             bind=True, max_retries=3, default_retry_delay=5)
def canonicalize_event(self, document_id: str, tenant_id: str):
    """Run EventClusterer to find matching canonical event or create new.
    Chain to resolve_entity for each extracted entity mention."""

@celery.task(name="narad.workers.enrichment_tasks.resolve_entity",
             bind=True, max_retries=3, default_retry_delay=5)
def resolve_entity(self, entity_mention: dict, tenant_id: str):
    """Run EntityResolver to match mention to canonical entity or create new.
    On completion, trigger projection updates."""

@celery.task(name="narad.workers.enrichment_tasks.generate_story_capsule",
             bind=True, max_retries=3, default_retry_delay=10)
def generate_story_capsule(self, event_id: str, tenant_id: str):
    """Call Gemini to generate story capsule for canonical event.
    Insert into core.story_capsules. Update event.story_capsule_id."""

@celery.task(name="narad.workers.enrichment_tasks.evaluate_watchlist_rules",
             bind=True, max_retries=2, default_retry_delay=2)
def evaluate_watchlist_rules(self, event_id: str, tenant_id: str):
    """Run RuleEvaluator against all active watchlist rules for this tenant.
    Insert watchlist_alerts for matches. Update watchlist_deltas projection."""

@celery.task(name="narad.workers.enrichment_tasks.flush_embedding_batch")
def flush_embedding_batch():
    """Celery Beat entry point: query documents/events/entities/claims
    WHERE embedding IS NULL, batch up to EMBED_BATCH_SIZE, generate
    embeddings via Gemini, UPDATE rows."""
```

#### `projection_tasks.py` — CQRS Projection Updates

```python
@celery.task(name="narad.workers.projection_tasks.update_pulseboard")
def update_pulseboard(event_id: str, tenant_id: str):
    """Upsert projections.pulseboard_feed row for the given event.
    Publish pulseboard.updated to Redis pub/sub."""

@celery.task(name="narad.workers.projection_tasks.update_watchlist_deltas")
def update_watchlist_deltas(alert_id: str, tenant_id: str):
    """Insert projections.watchlist_deltas row for the given alert.
    Publish watchlist.delta to Redis pub/sub."""

@celery.task(name="narad.workers.projection_tasks.update_entity_summaries")
def update_entity_summaries(entity_id: str, tenant_id: str):
    """Rebuild projections.entity_summaries row for the given entity.
    Publish entity.updated to Redis pub/sub."""

@celery.task(name="narad.workers.projection_tasks.update_regulatory_digest")
def update_regulatory_digest(event_id: str, tenant_id: str):
    """Upsert projections.regulatory_digest row for regulatory events.
    Publish regulatory.digest.updated to Redis pub/sub."""
```

#### `maintenance_tasks.py` — Scheduled Operations

```python
@celery.task(name="narad.workers.maintenance_tasks.create_audit_partition")
def create_audit_partition():
    """Create next month's audit.audit_log partition.
    Runs on 20th of each month via Celery Beat.
    SQL: CREATE TABLE IF NOT EXISTS audit.audit_log_{YYYY_MM}
         PARTITION OF audit.audit_log
         FOR VALUES FROM ('{first_of_month}') TO ('{first_of_next_month}');
    """

@celery.task(name="narad.workers.maintenance_tasks.cleanup_stale_projections")
def cleanup_stale_projections():
    """Delete projection rows where source event/entity no longer exists.
    Runs daily at 03:00 IST."""

@celery.task(name="narad.workers.maintenance_tasks.check_source_health")
def check_source_health():
    """For each active source: check last_successful_fetch vs update_cadence_seconds.
    If overdue by 3x cadence, set last_error and publish source.unhealthy event."""
```

### 5.4 Task Chain (Ingestion Pipeline)

The ingestion pipeline is a Celery chain with conditional branching:

```
poll_active_sources
  └─> ingest_from_source (per source)
        └─> ingest_document (per item)
              ├─> translate_document (if original_language != 'en')
              │     └─> extract_claims
              └─> extract_claims (if already English)
                    └─> canonicalize_event
                          ├─> resolve_entity (per entity mention)
                          ├─> generate_story_capsule
                          └─> evaluate_watchlist_rules
                                └─> [projection tasks fan out]
```

Each task in the chain receives the output IDs from the previous step. The chain is built using Celery `chain()` and `group()`:

```python
from celery import chain, group

# After ingest_document succeeds:
pipeline = chain(
    translate_document.si(doc_id, tenant_id) if needs_translation else extract_claims.si(doc_id, tenant_id),
    canonicalize_event.si(doc_id, tenant_id),
    group(
        generate_story_capsule.si(event_id, tenant_id),
        evaluate_watchlist_rules.si(event_id, tenant_id),
    ),
)
pipeline.apply_async()
```

Note: `si()` (immutable signature) is used because each task fetches its data from the database by ID rather than passing large payloads through the broker.

### 5.5 Celery + asyncpg Bridge

Celery workers run synchronous Python. All database and async HTTP calls use a sync-to-async bridge:

```python
import asyncio
from functools import wraps

_loop = None

def get_event_loop() -> asyncio.AbstractEventLoop:
    """Get or create the worker-thread event loop."""
    global _loop
    if _loop is None or _loop.is_closed():
        _loop = asyncio.new_event_loop()
    return _loop

def run_async(coro):
    """Run an async coroutine from a sync Celery task."""
    loop = get_event_loop()
    return loop.run_until_complete(coro)
```

Each Celery task creates a short-lived asyncpg connection pool (or acquires from a module-level pool) and runs async command handlers through `run_async()`.

---

## 6. Source Adapter Framework

### 6.1 Abstract Adapter Protocol (`adapters/base.py`)

```python
from __future__ import annotations
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import AsyncIterator


@dataclass(frozen=True)
class RawDocument:
    """Standardized output from any source adapter."""
    external_id: str                      # Source's own identifier
    title: str | None = None
    body_text: str                        # Raw text content
    doc_type: str = "article"             # core.documents.doc_type enum
    original_language: str | None = None  # ISO 639-1 (None = unknown, assume English)
    fetch_url: str | None = None          # Original URL
    published_at: datetime | None = None  # Source publication timestamp
    metadata: dict = field(default_factory=dict)  # Source-specific fields


class SourceAdapter(ABC):
    """Base class for all 32 source adapters.

    Contract:
    1. __init__ receives source config (from core.sources.config JSONB)
    2. fetch_new() yields RawDocument objects since last successful fetch
    3. Adapter is stateless — last_successful_fetch is stored in core.sources
    4. Adapter must handle rate limiting internally
    5. Adapter must handle pagination internally
    6. Adapter must set original_language when known
    """

    def __init__(self, source_id: str, config: dict, last_fetch: datetime | None):
        self.source_id = source_id
        self.config = config
        self.last_fetch = last_fetch

    @abstractmethod
    async def fetch_new(self) -> AsyncIterator[RawDocument]:
        """Yield new documents since last_fetch.

        Must be idempotent: calling twice with same last_fetch
        produces the same documents (dedup handled downstream by content_hash).
        """
        ...

    @abstractmethod
    async def health_check(self) -> bool:
        """Return True if the source is reachable and responding."""
        ...

    @property
    @abstractmethod
    def adapter_name(self) -> str:
        """Machine identifier matching core.sources.slug."""
        ...
```

### 6.2 Adapter Registry (`adapters/registry.py`)

```python
from narad.adapters.base import SourceAdapter
from narad.adapters.tier1.pib import PibAdapter
from narad.adapters.tier1.egazette import EgazetteAdapter
from narad.adapters.tier1.sebi import SebiAdapter
from narad.adapters.tier1.mca21 import Mca21Adapter
from narad.adapters.tier1.parliament import ParliamentAdapter
from narad.adapters.tier1.rbi import RbiAdapter
from narad.adapters.tier1.dpi import DpiAdapter
from narad.adapters.tier2.acled import AcledAdapter
from narad.adapters.tier2.nasa_firms import NasaFirmsAdapter
from narad.adapters.tier2.opensky import OpenskyAdapter
from narad.adapters.tier2.gdelt import GdeltAdapter
from narad.adapters.tier2.imd import ImdAdapter
from narad.adapters.tier2.ndma import NdmaAdapter
from narad.adapters.tier2.bse import BseAdapter
from narad.adapters.tier2.nse import NseAdapter
from narad.adapters.tier3.twitter import TwitterAdapter
from narad.adapters.tier3.reddit import RedditAdapter
from narad.adapters.tier3.telegram import TelegramAdapter
from narad.adapters.tier3.youtube import YoutubeAdapter
from narad.adapters.tier3.google_search import GoogleSearchAdapter
from narad.adapters.tier3.newsapi import NewsapiAdapter

ADAPTER_MAP: dict[str, type[SourceAdapter]] = {
    # Tier 1 — Government
    "pib_rss": PibAdapter,
    "egazette": EgazetteAdapter,
    "sebi": SebiAdapter,
    "mca21": Mca21Adapter,
    "parliament_ls": ParliamentAdapter,
    "parliament_rs": ParliamentAdapter,
    "rbi": RbiAdapter,
    "dpi": DpiAdapter,

    # Tier 2 — Structured
    "acled": AcledAdapter,
    "nasa_firms": NasaFirmsAdapter,
    "opensky": OpenskyAdapter,
    "gdelt": GdeltAdapter,
    "imd": ImdAdapter,
    "ndma": NdmaAdapter,
    "bse": BseAdapter,
    "nse": NseAdapter,

    # Tier 3 — OSINT
    "twitter": TwitterAdapter,
    "reddit": RedditAdapter,
    "telegram": TelegramAdapter,
    "youtube": YoutubeAdapter,
    "google_search": GoogleSearchAdapter,
    "newsapi": NewsapiAdapter,
}


def get_adapter(slug: str, source_id: str, config: dict, last_fetch) -> SourceAdapter:
    """Look up and instantiate adapter by source slug."""
    adapter_cls = ADAPTER_MAP.get(slug)
    if adapter_cls is None:
        raise ValueError(f"No adapter registered for source slug: {slug}")
    return adapter_cls(source_id=source_id, config=config, last_fetch=last_fetch)
```

### 6.3 Example Adapter: PIB RSS (`adapters/tier1/pib.py`)

```python
import httpx
import xml.etree.ElementTree as ET
from datetime import datetime
from typing import AsyncIterator

from narad.adapters.base import SourceAdapter, RawDocument


class PibAdapter(SourceAdapter):
    """Press Information Bureau — RSS feed.

    No API key required. Public RSS at:
    https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=3
    """

    adapter_name = "pib_rss"

    async def fetch_new(self) -> AsyncIterator[RawDocument]:
        url = self.config.get("rss_url", "https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=3")
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url)
            response.raise_for_status()

        root = ET.fromstring(response.text)
        for item in root.iter("item"):
            pub_date_str = item.findtext("pubDate", "")
            pub_date = _parse_rss_date(pub_date_str) if pub_date_str else None

            # Skip items older than last fetch
            if self.last_fetch and pub_date and pub_date <= self.last_fetch:
                continue

            yield RawDocument(
                external_id=item.findtext("guid", ""),
                title=item.findtext("title"),
                body_text=item.findtext("description", ""),
                doc_type="press_release",
                original_language="en",  # PIB English RSS
                fetch_url=item.findtext("link"),
                published_at=pub_date,
                metadata={
                    "source": "pib",
                    "ministry": _extract_ministry(item),
                },
            )

    async def health_check(self) -> bool:
        url = self.config.get("rss_url", "https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=3")
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url)
            return response.status_code == 200
```

### 6.4 Source-to-Adapter Mapping (All 32 Sources)

| # | Source | Slug | Tier | Adapter Class | Source Type | Language |
|---|---|---|---|---|---|---|
| 1 | PIB English RSS | `pib_rss` | 1 | `PibAdapter` | rss | en |
| 2 | PIB Hindi RSS | `pib_rss_hi` | 1 | `PibAdapter` | rss | hi |
| 3 | eGazette | `egazette` | 1 | `EgazetteAdapter` | portal | en/hi |
| 4 | SEBI | `sebi` | 1 | `SebiAdapter` | api | en |
| 5 | MCA21 | `mca21` | 1 | `Mca21Adapter` | api | en |
| 6 | Parliament Lok Sabha | `parliament_ls` | 1 | `ParliamentAdapter` | portal | en/hi |
| 7 | Parliament Rajya Sabha | `parliament_rs` | 1 | `ParliamentAdapter` | portal | en/hi |
| 8 | RBI | `rbi` | 1 | `RbiAdapter` | api | en |
| 9 | DPI / India Stack | `dpi` | 1 | `DpiAdapter` | api | en |
| 10 | ACLED | `acled` | 2 | `AcledAdapter` | api | en |
| 11 | NASA FIRMS | `nasa_firms` | 2 | `NasaFirmsAdapter` | api | en |
| 12 | OpenSky | `opensky` | 2 | `OpenskyAdapter` | api | en |
| 13 | GDELT | `gdelt` | 2 | `GdeltAdapter` | api | en |
| 14 | IMD | `imd` | 2 | `ImdAdapter` | api | en/hi |
| 15 | NDMA | `ndma` | 2 | `NdmaAdapter` | api | en |
| 16 | BSE | `bse` | 2 | `BseAdapter` | api | en |
| 17 | NSE | `nse` | 2 | `NseAdapter` | api | en |
| 18 | ISRO Bhuvan | `bhuvan` | 2 | `BhuvanAdapter` | wms | n/a |
| 19 | Survey of India | `soi` | 2 | `SoiAdapter` | wms | n/a |
| 20 | Twitter/X | `twitter` | 3 | `TwitterAdapter` | api | multi |
| 21 | Reddit | `reddit` | 3 | `RedditAdapter` | api | en |
| 22 | Telegram | `telegram` | 3 | `TelegramAdapter` | api | multi |
| 23 | YouTube | `youtube` | 3 | `YoutubeAdapter` | api | multi |
| 24 | Google Custom Search | `google_search` | 3 | `GoogleSearchAdapter` | api | multi |
| 25 | News API | `newsapi` | 3 | `NewsapiAdapter` | api | en |
| 26 | BSE Corporate Filings | `bse_filings` | 2 | `BseAdapter` | api | en |
| 27 | NSE Corporate Announcements | `nse_announcements` | 2 | `NseAdapter` | api | en |
| 28 | MoEFCC (Environment) | `moefcc` | 1 | future | portal | en |
| 29 | DGCA (Aviation) | `dgca` | 1 | future | portal | en |
| 30 | DG Shipping | `dgshipping` | 1 | future | portal | en |
| 31 | NCRB (Crime) | `ncrb` | 1 | future | portal | en |
| 32 | Election Commission | `eci` | 1 | future | portal | en |

Sources 28-32 are stubbed (adapter raises `NotImplementedError`) and activated incrementally.

---

## 7. Command Handlers (CQRS Write Side)

Each command handler is a pure async function that:
1. Validates input via Pydantic model
2. Acquires a database connection from the pool
3. Sets RLS tenant context via `set_tenant()`
4. Performs the write operation (INSERT or UPSERT)
5. Logs to `audit.audit_log`
6. Returns the created/updated object ID
7. Does NOT call external APIs (those happen in Celery tasks that invoke these commands)

### 7.1 IngestDocument Command (`commands/ingest_document.py`)

**Input model:**

```python
from pydantic import BaseModel, Field
from datetime import datetime


class IngestDocumentCommand(BaseModel):
    tenant_id: str
    source_id: str
    external_id: str | None = None
    doc_type: str
    title: str | None = None
    body_text: str
    original_language: str | None = None
    fetch_url: str | None = None
    published_at: datetime | None = None
    metadata: dict = Field(default_factory=dict)
```

**Behavior:**

1. Compute `content_hash = SHA-256(body_text)`
2. Check for existing document: `SELECT id FROM core.documents WHERE tenant_id=$1 AND source_id=$2 AND content_hash=$3`
3. If exists: return existing `document_id` (idempotent — no duplicate)
4. If new: `INSERT INTO core.documents` with all fields, `fetched_at = now()`
5. Log to `audit.audit_log` with `action='document.ingested'`
6. Return `document_id`

**SQL (INSERT with dedup):**

```sql
INSERT INTO core.documents (
    id, tenant_id, source_id, external_id, doc_type, title,
    body_text, original_language, content_hash, fetch_url,
    published_at, fetched_at, metadata
) VALUES (
    uuid_generate_v7(), $1, $2, $3, $4, $5,
    $6, $7, $8, $9,
    $10, now(), $11
)
ON CONFLICT (tenant_id, source_id, content_hash) DO NOTHING
RETURNING id;
```

### 7.2 ExtractClaims Command (`commands/extract_claims.py`)

**Input model:**

```python
class ExtractClaimsCommand(BaseModel):
    tenant_id: str
    document_id: str
    claims: list[ExtractedClaim]

class ExtractedClaim(BaseModel):
    claim_text: str
    claim_type: str  # factual, opinion, prediction, etc.
    confidence: float = Field(ge=0.0, le=1.0)
    extraction_model: str
    extraction_model_version: str | None = None
    entity_mentions: list[str] = Field(default_factory=list)  # raw names for entity resolution
    event_signals: dict = Field(default_factory=dict)  # hints for event canonicalization
```

**Behavior:**

1. For each claim: compute `lineage_hash = SHA-256(document_id + extraction_model + claim_text)`
2. Batch insert into `core.claims`:
   ```sql
   INSERT INTO core.claims (
       id, tenant_id, document_id, claim_text, claim_type,
       confidence, lineage_hash, extraction_model, extraction_model_version
   ) VALUES (uuid_generate_v7(), $1, $2, $3, $4, $5, $6, $7, $8)
   ON CONFLICT ON CONSTRAINT claims_lineage_hash_key DO NOTHING
   RETURNING id;
   ```
3. Note: `lineage_hash` requires a unique index on `core.claims(lineage_hash)` (to be added as migration 011)
4. Return list of `claim_id` values
5. Also returns entity mentions and event signals for downstream chaining

### 7.3 CanonicalizeEvent Command (`commands/canonicalize_event.py`)

**Input model:**

```python
class CanonicalizeEventCommand(BaseModel):
    tenant_id: str
    document_id: str
    title: str
    summary: str | None = None
    event_type: str
    event_subtype: str | None = None
    severity: str = "medium"
    confidence: float = Field(ge=0.0, le=1.0, default=0.50)
    geometry_lat: float | None = None
    geometry_lon: float | None = None
    state_code: str | None = None
    district_code: str | None = None
    occurred_at: datetime | None = None
    reported_at: datetime | None = None
    entity_mentions: list[str] = Field(default_factory=list)
    metadata: dict = Field(default_factory=dict)
```

**Behavior:**

1. Call `EventClusterer.find_match()` (see Section 11) with the event attributes
2. **If match found (existing canonical event):**
   - `UPDATE core.events SET source_count = source_count + 1, confidence = GREATEST(confidence, $new_conf), updated_at = now() WHERE id = $match_id`
   - Upgrade confidence if new source is higher trust tier
   - `INSERT INTO core.event_document_links (event_id, document_id, link_type='corroboration')`
3. **If no match (new canonical event):**
   - `INSERT INTO core.events` with `status='canonicalized'`
   - `INSERT INTO core.event_document_links (event_id, document_id, link_type='primary_source')`
4. Log state transition to `audit.state_transitions`
5. Return `event_id` and `is_new: bool`

### 7.4 ResolveEntity Command (`commands/resolve_entity.py`)

**Input model:**

```python
class ResolveEntityCommand(BaseModel):
    tenant_id: str
    mention_text: str            # Raw entity mention from text
    entity_type: str | None      # Hint from claim extraction
    external_ids: dict = Field(default_factory=dict)  # CIN, ISIN, etc. if found
    geometry_lat: float | None = None
    geometry_lon: float | None = None
    source_document_id: str | None = None
    source_trust_tier: int = 3
```

**Behavior:**

See Section 10 (Entity Resolution Algorithm) for the full algorithm. Summary:
1. Deterministic match: exact `external_ids` key-value match
2. Probabilistic match: pg_trgm + pgvector + type + spatial proximity
3. Based on confidence:
   - >= 0.85: auto-merge (update canonical entity)
   - 0.60-0.85: create entity, flag for human verification
   - < 0.60: create new entity
4. Return `entity_id`, `confidence`, `resolution_method`

### 7.5 GenerateStoryCapsule Command (`commands/generate_story_capsule.py`)

**Input model:**

```python
class GenerateStoryCapsuleCommand(BaseModel):
    tenant_id: str
    event_id: str
```

**Behavior:**

1. Fetch event + linked documents + linked entities + claims from database
2. Build prompt for Gemini (see Section 8.3 for prompt template)
3. Compute `prompt_hash = SHA-256(prompt_text)`
4. Check for existing capsule with same `prompt_hash` (dedup)
5. If new: call Gemini API via `LLMService.generate()`
6. Parse response into structured fields (headline, explanation, key_facts, evidence_bundle)
7. Insert into `core.story_capsules`
8. Update `core.events SET story_capsule_id = $capsule_id`
9. If existing capsule exists: set `superseded_by` on old capsule
10. Return `story_capsule_id`

### 7.6 EvaluateWatchlistRules Command (`commands/evaluate_watchlist_rules.py`)

**Input model:**

```python
class EvaluateWatchlistRulesCommand(BaseModel):
    tenant_id: str
    event_id: str
    entity_ids: list[str] = Field(default_factory=list)
```

**Behavior:**

1. Fetch all active watchlists for tenant:
   ```sql
   SELECT w.id, wr.id as rule_id, wr.rule_name, wr.condition, wr.severity_override
   FROM workflow.watchlists w
   JOIN workflow.watchlist_rules wr ON wr.watchlist_id = w.id
   WHERE w.tenant_id = $1 AND w.is_active = TRUE AND wr.is_active = TRUE;
   ```
2. Fetch watchlist items:
   ```sql
   SELECT wi.watchlist_id, wi.target_type, wi.target_id
   FROM workflow.watchlist_items wi
   JOIN workflow.watchlists w ON w.id = wi.watchlist_id
   WHERE w.tenant_id = $1 AND w.is_active = TRUE;
   ```
3. For each watchlist: evaluate rules using `RuleEvaluator` (see Section 8.6)
4. For each match: insert into `workflow.watchlist_alerts`:
   ```sql
   INSERT INTO workflow.watchlist_alerts (
       id, tenant_id, watchlist_id, rule_id, triggered_by_event_id,
       triggered_by_entity_id, severity, status, title, summary
   ) VALUES (uuid_generate_v7(), $1, $2, $3, $4, $5, $6, 'new', $7, $8);
   ```
5. Return list of `alert_id` values

### 7.7 TransitionState Command (`commands/transition_state.py`)

**Input model:**

```python
class TransitionStateCommand(BaseModel):
    tenant_id: str
    object_type: str          # 'event', 'investigation', 'alert', 'briefing'
    object_id: str
    from_state: str | None    # Validated against current state
    to_state: str
    transitioned_by: str      # user_id or 'system'
    reason: str | None = None
```

**Behavior:**

1. Validate transition against state machine (see canonical ontology lifecycle diagrams)
2. Fetch current state: `SELECT status FROM {schema}.{table} WHERE id = $1 AND tenant_id = $2`
3. If `from_state` provided and does not match current: raise `InvalidStateTransition`
4. Validate target state is reachable from current state
5. `UPDATE {schema}.{table} SET status = $to_state, updated_at = now() WHERE id = $1`
6. `INSERT INTO audit.state_transitions (tenant_id, object_type, object_id, from_state, to_state, transitioned_by, reason)`
7. Return `success: bool`

**Valid state machines:**

```python
EVENT_STATES = {
    "ingested": ["canonicalized"],
    "canonicalized": ["enriched", "invalidated"],
    "enriched": ["in_investigation", "invalidated"],
    "in_investigation": ["resolved", "invalidated"],
    "resolved": [],
    "invalidated": [],
}

ALERT_STATES = {
    "new": ["triaged"],
    "triaged": ["assigned"],
    "assigned": ["acknowledged"],
    "acknowledged": ["in_progress"],
    "in_progress": ["resolved", "suppressed"],
    "resolved": [],
    "suppressed": [],
}

INVESTIGATION_STATES = {
    "draft": ["under_review"],
    "under_review": ["active"],
    "active": ["on_hold", "closed"],
    "on_hold": ["active", "closed"],
    "closed": ["archived"],
    "archived": [],
}

BRIEFING_STATES = {
    "draft": ["under_review"],
    "under_review": ["approved"],
    "approved": ["published"],
    "published": ["superseded", "withdrawn"],
    "superseded": [],
    "withdrawn": [],
}
```

---

## 8. Services Layer

### 8.1 Embedding Service (`services/embedding.py`)

```python
class EmbeddingService:
    """Batch embedding generation via Gemini text-embedding-004.

    Configuration:
    - Model: text-embedding-004
    - Dimensions: 768
    - Max batch size: EMBED_BATCH_SIZE (default: 50)
    - Rate limit: 1500 requests/min (Gemini free tier)
    """

    def __init__(self, api_key: str, model: str = "text-embedding-004", dimensions: int = 768):
        self.api_key = api_key
        self.model = model
        self.dimensions = dimensions
        self.batch_size = get_settings().embed_batch_size

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        """Generate embeddings for a batch of texts.

        Uses Gemini batch embedding API:
        POST https://generativelanguage.googleapis.com/v1beta/models/{model}:batchEmbedContents

        Request body:
        {
          "requests": [
            {"model": "models/text-embedding-004", "content": {"parts": [{"text": "..."}]}}
          ]
        }

        Returns list of 768-dimensional float vectors.
        """
        ...

    async def embed_single(self, text: str) -> list[float]:
        """Generate embedding for a single text. Delegates to embed_batch([text])."""
        results = await self.embed_batch([text])
        return results[0]
```

**Database update pattern (batch flush):**

```sql
-- Update documents missing embeddings
UPDATE core.documents
SET embedding = $2
WHERE id = $1 AND embedding IS NULL;
```

The batch flush task queries all rows with `embedding IS NULL`, batches them into groups of `EMBED_BATCH_SIZE`, calls `embed_batch()`, and updates each row.

### 8.2 Translation Service (`services/translation.py`)

```python
class TranslationService:
    """Bhashini API client for Indian language translation.

    Supports 22 scheduled Indian languages via Bhashini NMT pipeline.
    Source language auto-detected if not provided.

    API flow:
    1. POST /services/inference/pipeline — submit translation task
    2. Response contains translated text

    Headers:
    - Authorization: {BHASHINI_API_KEY}
    - userId: {BHASHINI_USER_ID}
    """

    SUPPORTED_LANGUAGES = [
        "as",  # Assamese
        "bn",  # Bengali
        "brx", # Bodo
        "doi", # Dogri
        "gu",  # Gujarati
        "hi",  # Hindi
        "kn",  # Kannada
        "ks",  # Kashmiri
        "gom", # Konkani
        "mai", # Maithili
        "ml",  # Malayalam
        "mni", # Manipuri
        "mr",  # Marathi
        "ne",  # Nepali
        "or",  # Odia
        "pa",  # Punjabi
        "sa",  # Sanskrit
        "sat", # Santali
        "sd",  # Sindhi
        "ta",  # Tamil
        "te",  # Telugu
        "ur",  # Urdu
    ]

    async def translate(
        self,
        text: str,
        source_language: str,
        target_language: str = "en",
    ) -> str:
        """Translate text from source language to English.

        Request body:
        {
          "pipelineTasks": [{
            "taskType": "translation",
            "config": {
              "language": {
                "sourceLanguage": "{source_language}",
                "targetLanguage": "{target_language}"
              }
            }
          }],
          "inputData": {
            "input": [{"source": "{text}"}]
          }
        }
        """
        ...

    async def detect_language(self, text: str) -> str:
        """Detect language of input text.
        Falls back to 'en' if detection fails."""
        ...
```

### 8.3 LLM Service (`services/llm.py`)

```python
class LLMService:
    """Gemini API client for claim extraction and story capsule generation.

    Models:
    - gemini-2.5-flash: Claim extraction (fast, cheap)
    - gemini-2.5-pro: Story capsule generation (higher quality)

    All LLM calls are async and happen ONLY in Celery tasks (never in hot path).
    """

    def __init__(self, api_key: str, model_mid: str, model_large: str):
        self.api_key = api_key
        self.model_mid = model_mid
        self.model_large = model_large

    async def extract_claims(self, document_text: str, doc_type: str) -> list[dict]:
        """Extract factual claims from document text using Gemini Flash.

        Returns list of:
        {
            "claim_text": str,
            "claim_type": "factual"|"opinion"|"prediction"|...,
            "confidence": float,
            "entity_mentions": [str],
            "event_signals": {
                "event_type": str | None,
                "severity_hint": str | None,
                "location_hint": str | None,
                "date_hint": str | None
            }
        }
        """
        prompt = CLAIM_EXTRACTION_PROMPT.format(
            doc_type=doc_type,
            document_text=document_text[:8000],  # Truncate to fit context window
        )
        response = await self._call_gemini(self.model_mid, prompt, response_schema=CLAIM_SCHEMA)
        return response

    async def generate_story_capsule(
        self,
        event_title: str,
        event_summary: str,
        claims: list[dict],
        documents: list[dict],
        entities: list[dict],
    ) -> dict:
        """Generate story capsule using Gemini Pro.

        Returns:
        {
            "headline": str,        # One-line (max 120 chars)
            "explanation": str,     # 3-5 sentences
            "key_facts": [str],     # 3-7 bullet points
            "evidence_bundle": [
                {"document_id": str, "relevance_score": float, "excerpt": str}
            ]
        }
        """
        prompt = STORY_CAPSULE_PROMPT.format(
            event_title=event_title,
            event_summary=event_summary,
            claims_json=json.dumps(claims[:20]),
            documents_json=json.dumps(documents[:10]),
            entities_json=json.dumps(entities[:10]),
        )
        response = await self._call_gemini(self.model_large, prompt, response_schema=CAPSULE_SCHEMA)
        return response

    async def _call_gemini(self, model: str, prompt: str, response_schema: dict | None = None) -> dict:
        """Low-level Gemini API call.

        POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
        Headers: x-goog-api-key: {api_key}
        Body: {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "responseMimeType": "application/json",
                "responseSchema": response_schema,
                "temperature": 0.2,
                "maxOutputTokens": 4096
            }
        }
        """
        ...
```

**Claim Extraction Prompt Template:**

```
You are a factual claim extractor for the NARAD intelligence platform.
Given a {doc_type} document, extract all distinct factual claims.

For each claim, provide:
1. claim_text: The exact factual assertion (one sentence)
2. claim_type: One of [factual, opinion, prediction, regulatory, financial, spatial, temporal, causal]
3. confidence: Your confidence in the extraction accuracy (0.0-1.0)
4. entity_mentions: List of organization/person/place names mentioned in the claim
5. event_signals: Any hints about the event type, severity, location, or date

Rules:
- Extract ONLY verifiable factual claims, not background context
- Each claim must be self-contained (understandable without the source document)
- Do not merge multiple distinct facts into one claim
- Preserve original numbers, dates, and proper nouns exactly

Document text:
{document_text}
```

**Story Capsule Prompt Template:**

```
You are a senior intelligence analyst writing a story capsule for the NARAD sovereign intelligence platform.

Generate a concise, authoritative narrative for the following canonical event:

EVENT: {event_title}
SUMMARY: {event_summary}

SUPPORTING CLAIMS (extracted from source documents):
{claims_json}

SOURCE DOCUMENTS:
{documents_json}

RELATED ENTITIES:
{entities_json}

Generate:
1. headline: One-line summary (max 120 characters, no sensationalism, factual)
2. explanation: 3-5 sentence plain-language explanation of what happened, why it matters, and what happens next
3. key_facts: 3-7 bullet points of the most important verified facts
4. evidence_bundle: For each source document, provide relevance_score (0.0-1.0) and the most relevant excerpt (max 200 chars)

Rules:
- Write for a senior government analyst audience
- Never speculate beyond what the evidence supports
- Cite specific numbers, dates, and names from the claims
- Flag any conflicting claims between sources
```

### 8.4 Entity Resolver Service (`services/entity_resolver.py`)

See Section 10 for the complete algorithm. Key methods:

```python
class EntityResolver:
    async def resolve(self, command: ResolveEntityCommand) -> EntityResolution:
        """Full resolution pipeline: deterministic → probabilistic → decision."""
        ...

    async def _deterministic_match(self, external_ids: dict, tenant_id: str) -> EntityMatch | None:
        """Exact match on CIN, ISIN, ICAO24, IMO, ULPIN."""
        ...

    async def _probabilistic_match(
        self, mention: str, entity_type: str | None,
        geometry: tuple[float, float] | None, tenant_id: str
    ) -> list[EntityCandidate]:
        """pg_trgm + pgvector + type + spatial + trust weighting."""
        ...

    async def _merge_entities(self, canonical_id: str, candidate_id: str, tenant_id: str):
        """Merge candidate into canonical: update aliases, external_ids, resolved_from."""
        ...


@dataclass
class EntityResolution:
    entity_id: str
    confidence: float
    resolution_method: str  # "deterministic", "probabilistic_auto", "probabilistic_review", "new"
    is_new: bool
    merged_from: list[str] = field(default_factory=list)
```

### 8.5 Event Clusterer Service (`services/event_clusterer.py`)

See Section 11 for the complete algorithm. Key methods:

```python
class EventClusterer:
    async def find_match(
        self,
        title: str,
        event_type: str,
        geometry: tuple[float, float] | None,
        occurred_at: datetime | None,
        entity_ids: list[str],
        embedding: list[float] | None,
        tenant_id: str,
    ) -> EventMatch | None:
        """Find a matching canonical event using temporal + spatial + semantic + entity overlap."""
        ...


@dataclass
class EventMatch:
    event_id: str
    match_score: float
    match_reasons: list[str]  # ["temporal_proximity", "spatial_proximity", "semantic_similarity", ...]
```

### 8.6 Rule Evaluator Service (`services/rule_evaluator.py`)

```python
class RuleEvaluator:
    """Evaluates JSON Logic watchlist rules against events and entities.

    Rule format (stored in workflow.watchlist_rules.condition):
    {
      "and": [
        {"==": [{"var": "event_type"}, "regulatory"]},
        {"in": [{"var": "severity"}, ["critical", "high"]]},
        {">=": [{"var": "confidence"}, 0.70]}
      ]
    }

    Extended operators beyond standard JSON Logic:
    - "geo_within": {"geo_within": [{"var": "geometry"}, {"lat": x, "lon": y, "radius_km": 50}]}
    - "entity_match": {"entity_match": [{"var": "entity_ids"}, ["entity_uuid_1", "entity_uuid_2"]]}
    - "text_contains": {"text_contains": [{"var": "title"}, "keyword"]}
    """

    def evaluate(self, rule_condition: dict, context: dict) -> bool:
        """Evaluate a single rule against the event/entity context.

        Context dict structure:
        {
            "event_id": str,
            "event_type": str,
            "event_subtype": str | None,
            "severity": str,
            "confidence": float,
            "title": str,
            "state_code": str | None,
            "district_code": str | None,
            "geometry": {"lat": float, "lon": float} | None,
            "entity_ids": [str],
            "entity_types": [str],
            "entity_names": [str],
            "source_count": int,
            "occurred_at": str (ISO 8601),
        }
        """
        ...

    def evaluate_all(
        self,
        rules: list[dict],
        context: dict,
    ) -> list[RuleMatch]:
        """Evaluate all rules, return list of matches."""
        ...


@dataclass
class RuleMatch:
    rule_id: str
    watchlist_id: str
    rule_name: str
    severity: str  # severity_override or event severity
    match_details: dict  # Which conditions matched
```

---

## 9. Projection Updaters

Each projection updater is a focused module that builds one CQRS read model from canonical `core` data.

### 9.1 PulseBoard Feed (`projections/pulseboard.py`)

**Target table:** `projections.pulseboard_feed`

**JSONB `card` structure:**

```json
{
  "event_id": "uuid",
  "title": "string",
  "summary": "string (first 300 chars)",
  "event_type": "string",
  "event_subtype": "string | null",
  "severity": "critical|high|medium|low|informational",
  "confidence": 0.85,
  "status": "canonicalized",
  "occurred_at": "2026-03-28T10:30:00Z",
  "location": {
    "lat": 28.6139,
    "lon": 77.2090,
    "state_code": "DL",
    "district_code": "DL001",
    "label": "New Delhi"
  },
  "source_count": 3,
  "primary_source": {
    "source_id": "uuid",
    "name": "PIB RSS",
    "trust_tier": 1
  },
  "entities": [
    {"entity_id": "uuid", "canonical_name": "string", "entity_type": "string", "role": "string"}
  ],
  "story_capsule": {
    "headline": "string",
    "key_facts": ["string"]
  } | null,
  "impacts": [
    {"impact_type": "human", "severity": "high", "description": "string"}
  ],
  "updated_at": "2026-03-28T10:30:05Z"
}
```

**Severity rank mapping:**

```python
SEVERITY_RANK = {
    "critical": 1,
    "high": 2,
    "medium": 3,
    "low": 4,
    "informational": 5,
}
```

**SQL (UPSERT):**

```sql
INSERT INTO projections.pulseboard_feed (event_id, tenant_id, card, severity_rank, occurred_at, projected_at)
VALUES ($1, $2, $3::jsonb, $4, $5, now())
ON CONFLICT (event_id) DO UPDATE SET
    card = EXCLUDED.card,
    severity_rank = EXCLUDED.severity_rank,
    occurred_at = EXCLUDED.occurred_at,
    projected_at = now();
```

**Staleness target:** < 500ms from event write to projection availability.

### 9.2 Watchlist Deltas (`projections/watchlist_deltas.py`)

**Target table:** `projections.watchlist_deltas`

**Behavior:** Unlike pulseboard (UPSERT), watchlist deltas are append-only. Each new alert creates a new delta row.

**SQL (INSERT):**

```sql
INSERT INTO projections.watchlist_deltas (
    id, tenant_id, watchlist_id, delta_type, summary, reference_id, reference_type, computed_at
) VALUES (
    uuid_generate_v7(), $1, $2, $3, $4, $5, $6, now()
);
```

**Delta types:**

| delta_type | Trigger | summary template |
|---|---|---|
| `alert_fired` | New watchlist alert created | "Alert: {rule_name} triggered by event '{event_title}'" |
| `alert_escalated` | Alert severity upgraded | "Alert escalated from {old} to {new}: {title}" |
| `entity_risk_changed` | Watched entity risk score changed > 10 points | "Entity '{name}' risk score changed: {old} -> {new}" |
| `new_corroboration` | Watched event gets new source | "Event '{title}' now corroborated by {count} sources" |
| `status_changed` | Watched event/entity status transition | "Event '{title}' status: {from} -> {to}" |

**Staleness target:** < 1 second.

### 9.3 Entity Summaries (`projections/entity_summaries.py`)

**Target table:** `projections.entity_summaries`

**JSONB `summary` structure:**

```json
{
  "entity_id": "uuid",
  "canonical_name": "string",
  "entity_type": "company",
  "aliases": ["string"],
  "description": "string",
  "location": {
    "lat": 19.0760,
    "lon": 72.8777,
    "state_code": "MH",
    "label": "Mumbai"
  },
  "external_ids": {"cin": "...", "isin": "..."},
  "risk_score": 45.5,
  "risk_inputs": {},
  "health_score": 72.0,
  "is_resolved": true,
  "event_count": 15,
  "recent_events": [
    {"event_id": "uuid", "title": "string", "severity": "high", "occurred_at": "ISO"}
  ],
  "relationship_count": 8,
  "key_relationships": [
    {"target_entity_id": "uuid", "target_name": "string", "relationship_type": "subsidiary"}
  ],
  "claim_count": 42,
  "corp_watch": {
    "company_status": "Active",
    "sector": "Banking",
    "filing_completeness": 0.95,
    "last_filing_date": "2026-03-01"
  } | null,
  "updated_at": "ISO"
}
```

**SQL (build summary):**

```sql
-- Recent events for entity
SELECT e.id, e.title, e.severity, e.occurred_at
FROM core.events e
JOIN core.event_entity_links eel ON eel.event_id = e.id
WHERE eel.entity_id = $1 AND e.tenant_id = $2
ORDER BY e.occurred_at DESC
LIMIT 5;

-- Key relationships
SELECT r.target_entity_id, te.canonical_name, r.relationship_type
FROM core.relationships r
JOIN core.entities te ON te.id = r.target_entity_id
WHERE r.source_entity_id = $1 AND r.tenant_id = $2
ORDER BY r.confidence DESC
LIMIT 10;

-- Corp watch enrichment (if entity_type = 'company')
SELECT * FROM corp_watch.entity_profiles WHERE entity_id = $1;
```

**Staleness target:** < 5 seconds.

### 9.4 Regulatory Digest (`projections/regulatory_digest.py`)

**Target table:** `projections.regulatory_digest`

**JSONB `digest` structure:**

```json
{
  "event_id": "uuid",
  "title": "string",
  "event_type": "regulatory|legislative|judicial",
  "severity": "high",
  "regulator": {
    "entity_id": "uuid",
    "name": "SEBI",
    "entity_type": "regulator"
  },
  "affected_entities": [
    {"entity_id": "uuid", "name": "string", "role": "regulated"}
  ],
  "summary": "string",
  "key_claims": [
    {"claim_text": "string", "confidence": 0.9}
  ],
  "documents": [
    {"document_id": "uuid", "doc_type": "circular", "title": "string", "published_at": "ISO"}
  ],
  "effective_date": "2026-04-01",
  "lex_pulse": {
    "regulatory_event_type": "circular",
    "compliance_deadline": "2026-06-30"
  } | null,
  "updated_at": "ISO"
}
```

**Filter:** Only events where `event_type IN ('regulatory', 'legislative', 'judicial')`.

**Staleness target:** < 5 seconds.

---

## 10. Entity Resolution Algorithm

### 10.1 Overview

Entity resolution matches raw entity mentions from text to canonical `core.entities` records. The algorithm runs in two phases: deterministic (exact ID match) then probabilistic (fuzzy matching).

### 10.2 Phase 1: Deterministic Match

**Trigger:** Entity mention includes an external identifier (CIN, ISIN, ICAO24, IMO, ULPIN, DIN).

```sql
SELECT id, canonical_name, entity_type, external_ids, confidence
FROM core.entities
WHERE tenant_id = $1
  AND external_ids @> $2::jsonb
LIMIT 1;
```

Where `$2` is, for example, `{"cin": "L65910MH2009PLC193395"}`.

**Result:** confidence = 1.00, method = "deterministic"

### 10.3 Phase 2: Probabilistic Match

**Trigger:** No external ID match found.

**Step 1 — Candidate retrieval (pg_trgm + text search):**

```sql
SELECT
    id,
    canonical_name,
    entity_type,
    geometry,
    embedding,
    similarity(canonical_name, $1) AS trgm_score,
    ts_rank(tsv, plainto_tsquery('english', $1)) AS ts_rank
FROM core.entities
WHERE tenant_id = $2
  AND (
    similarity(canonical_name, $1) >= 0.40  -- liberal initial filter
    OR $1 = ANY(aliases)
    OR tsv @@ plainto_tsquery('english', $1)
  )
ORDER BY trgm_score DESC
LIMIT 20;
```

**Step 2 — Scoring (weighted composite):**

For each candidate, compute a composite confidence score:

```python
def compute_match_score(
    trgm_score: float,        # 0.0-1.0 from pg_trgm
    semantic_score: float,    # 0.0-1.0 from pgvector cosine similarity
    type_match: bool,         # entity_type matches hint
    spatial_distance_km: float | None,  # distance between geometries
    source_trust_tier: int,   # 1=highest, 3=lowest
) -> float:
    # Weights
    W_TRGM = 0.35
    W_SEMANTIC = 0.25
    W_TYPE = 0.15
    W_SPATIAL = 0.15
    W_TRUST = 0.10

    score = 0.0

    # Name similarity (pg_trgm)
    score += W_TRGM * trgm_score

    # Semantic similarity (pgvector cosine)
    score += W_SEMANTIC * semantic_score

    # Type match bonus
    score += W_TYPE * (1.0 if type_match else 0.0)

    # Spatial proximity (inverse distance, capped)
    if spatial_distance_km is not None and spatial_distance_km < 500:
        spatial_score = max(0, 1.0 - (spatial_distance_km / 500.0))
        score += W_SPATIAL * spatial_score

    # Source trust bonus (Tier 1 = full weight, Tier 2 = 0.5, Tier 3 = 0.1)
    trust_map = {1: 1.0, 2: 0.5, 3: 0.1}
    score += W_TRUST * trust_map.get(source_trust_tier, 0.1)

    return round(score, 4)
```

**Step 3 — Spatial distance calculation (PostGIS):**

```sql
SELECT ST_Distance(
    geography(a.geometry),
    geography(ST_SetSRID(ST_MakePoint($lon, $lat), 4326))
) / 1000.0 AS distance_km
FROM core.entities a
WHERE a.id = $entity_id AND a.geometry IS NOT NULL;
```

**Step 4 — Semantic similarity (pgvector):**

```sql
SELECT 1 - (embedding <=> $1::vector) AS cosine_similarity
FROM core.entities
WHERE id = $2 AND embedding IS NOT NULL;
```

### 10.4 Decision Thresholds

| Composite Score | Action | Method Label |
|---|---|---|
| >= 0.85 | Auto-merge into canonical entity | `probabilistic_auto` |
| 0.60 - 0.84 | Create entity, flag for human verification gate | `probabilistic_review` |
| < 0.60 | Create as new separate entity | `new` |

### 10.5 Auto-Merge Procedure

When confidence >= 0.85:

```sql
-- Add mention as alias to canonical entity
UPDATE core.entities
SET
    aliases = array_append(aliases, $mention_text),
    external_ids = external_ids || $new_external_ids,
    resolved_from = array_append(resolved_from, $candidate_id),
    is_resolved = TRUE,
    resolved_at = now(),
    updated_at = now()
WHERE id = $canonical_id AND tenant_id = $tenant_id;
```

### 10.6 Human Verification Gate

When confidence is 0.60-0.84:

1. Create a new entity record with `is_resolved = FALSE`
2. Insert into `workflow.watchlist_alerts` with:
   - `title`: "Entity resolution review: {mention} may match {canonical_name}"
   - `severity`: "low"
   - `metadata`: `{"resolution_candidate_id": "...", "match_score": 0.72, "match_reasons": [...]}`
3. Analyst reviews in UI (Phase 2C) and either merges or separates

---

## 11. Event Canonicalization Rules

### 11.1 Overview

Event canonicalization determines whether a newly extracted event from a document matches an existing canonical event or creates a new one.

### 11.2 Candidate Retrieval

```sql
SELECT
    e.id,
    e.title,
    e.event_type,
    e.geometry,
    e.occurred_at,
    e.embedding,
    e.source_count,
    e.confidence,
    array_agg(eel.entity_id) AS entity_ids
FROM core.events e
LEFT JOIN core.event_entity_links eel ON eel.event_id = e.id
WHERE e.tenant_id = $1
  AND e.event_type = $2                                      -- same event type
  AND e.status NOT IN ('invalidated')                       -- skip invalidated
  AND e.occurred_at >= $3::timestamptz - interval '24 hours' -- temporal window
  AND e.occurred_at <= $3::timestamptz + interval '24 hours'
GROUP BY e.id
ORDER BY e.occurred_at DESC
LIMIT 50;
```

### 11.3 Match Scoring

For each candidate, compute match signals:

```python
def compute_event_match(candidate, new_event) -> EventMatchScore:
    signals = {}

    # 1. Temporal proximity (within 24 hours)
    time_delta_hours = abs((candidate.occurred_at - new_event.occurred_at).total_seconds()) / 3600
    if time_delta_hours <= 24:
        signals["temporal"] = 1.0 - (time_delta_hours / 24.0)
    else:
        return None  # Hard filter: must be within 24 hours

    # 2. Spatial proximity (within 50km)
    if candidate.geometry and new_event.geometry:
        distance_km = geodesic_distance(candidate.geometry, new_event.geometry)
        if distance_km <= 50:
            signals["spatial"] = 1.0 - (distance_km / 50.0)
        # Note: spatial is optional — events without geometry can still match

    # 3. Semantic similarity (embedding cosine > 0.85)
    if candidate.embedding and new_event.embedding:
        cosine_sim = cosine_similarity(candidate.embedding, new_event.embedding)
        if cosine_sim > 0.85:
            signals["semantic"] = cosine_sim

    # 4. Title similarity (pg_trgm > 0.70)
    title_sim = trgm_similarity(candidate.title, new_event.title)
    if title_sim > 0.70:
        signals["title"] = title_sim

    # 5. Entity overlap
    overlap = set(candidate.entity_ids) & set(new_event.entity_ids)
    if len(overlap) > 0:
        signals["entity_overlap"] = len(overlap) / max(len(candidate.entity_ids), 1)

    # Decision: match if any high-confidence signal OR multiple moderate signals
    if "semantic" in signals and signals["semantic"] > 0.85:
        return EventMatchScore(score=signals["semantic"], signals=signals)
    if "title" in signals and signals["title"] > 0.70 and "temporal" in signals:
        return EventMatchScore(score=signals["title"], signals=signals)
    if "entity_overlap" in signals and signals["entity_overlap"] > 0.5 and "temporal" in signals:
        return EventMatchScore(score=0.80, signals=signals)
    if len(signals) >= 3:  # Multiple weak signals together
        avg = sum(signals.values()) / len(signals)
        if avg > 0.60:
            return EventMatchScore(score=avg, signals=signals)

    return None  # No match
```

### 11.4 Corroboration Upgrade

When a match is found and the new document comes from a different trust tier:

```python
# Tier corroboration upgrade matrix
CORROBORATION_BOOST = {
    (1, 2): 0.10,  # Tier 1 event confirmed by Tier 2
    (1, 3): 0.05,  # Tier 1 event mentioned in Tier 3
    (2, 1): 0.15,  # Tier 2 event confirmed by Tier 1 (big boost)
    (2, 3): 0.05,  # Tier 2 event mentioned in Tier 3
    (3, 1): 0.20,  # Tier 3 rumor confirmed by Tier 1 (biggest boost)
    (3, 2): 0.10,  # Tier 3 rumor corroborated by Tier 2
}
```

```sql
UPDATE core.events
SET
    source_count = source_count + 1,
    confidence = LEAST(1.00, confidence + $boost),
    updated_at = now()
WHERE id = $event_id AND tenant_id = $tenant_id;
```

---

## 12. Redis Pub/Sub Events

### 12.1 Event Publisher (`events/publisher.py`)

```python
import json
import redis.asyncio as redis
from datetime import datetime


class EventPublisher:
    """Publishes domain events to Redis pub/sub channels.

    Channel naming convention: narad:{domain}.{action}
    All events include tenant_id for client-side filtering.
    """

    def __init__(self, client: redis.Redis):
        self.client = client

    @classmethod
    async def create(cls, redis_url: str) -> "EventPublisher":
        client = redis.from_url(redis_url)
        return cls(client)

    async def publish(self, channel: str, event: dict):
        """Publish an event to a Redis pub/sub channel."""
        event["published_at"] = datetime.utcnow().isoformat() + "Z"
        await self.client.publish(channel, json.dumps(event))

    async def close(self):
        await self.client.aclose()
```

### 12.2 Event Channels and Payloads

| Channel | Trigger | Payload |
|---|---|---|
| `narad:pulseboard.updated` | PulseBoard projection updated | `{"tenant_id": str, "event_id": str, "severity": str, "action": "upsert"}` |
| `narad:pulseboard.removed` | Event invalidated | `{"tenant_id": str, "event_id": str, "action": "remove"}` |
| `narad:watchlist.alert_fired` | New watchlist alert created | `{"tenant_id": str, "alert_id": str, "watchlist_id": str, "severity": str, "title": str}` |
| `narad:watchlist.delta` | Watchlist delta projection updated | `{"tenant_id": str, "watchlist_id": str, "delta_type": str, "reference_id": str}` |
| `narad:entity.updated` | Entity summary projection updated | `{"tenant_id": str, "entity_id": str, "canonical_name": str, "action": "upsert"}` |
| `narad:entity.resolved` | Entity resolution completed | `{"tenant_id": str, "entity_id": str, "resolution_method": str, "confidence": float}` |
| `narad:entity.review_required` | Entity needs human verification | `{"tenant_id": str, "entity_id": str, "candidate_name": str, "match_score": float}` |
| `narad:regulatory.digest_updated` | Regulatory digest projection updated | `{"tenant_id": str, "event_id": str, "event_type": str}` |
| `narad:source.ingested` | Source ingestion completed | `{"tenant_id": str, "source_id": str, "document_count": int, "duration_ms": int}` |
| `narad:source.error` | Source ingestion failed | `{"tenant_id": str, "source_id": str, "error": str}` |
| `narad:source.unhealthy` | Source health check failed | `{"source_id": str, "reason": str, "last_success": str}` |
| `narad:pipeline.document_processed` | Document completed full pipeline | `{"tenant_id": str, "document_id": str, "event_id": str, "claims_count": int}` |

### 12.3 Pub/Sub Design Notes

- Redis pub/sub is fire-and-forget. It is NOT a durable message queue. If no subscriber is listening, the message is lost.
- This is intentional: pub/sub is used for real-time UI updates only. The database is the source of truth.
- Phase 2C (Next.js) will subscribe to these channels via a WebSocket bridge.
- All payloads include `tenant_id` so the WebSocket bridge can route events to the correct authenticated client.
- Channel names use `narad:` prefix to avoid collisions with Redis databases used for other purposes.

---

## 13. Error Handling and Retry Strategy

### 13.1 Retry Configuration

```python
# Default retry policy for all Celery tasks
RETRY_POLICY = {
    "max_retries": 5,
    "retry_backoff": True,       # Exponential backoff
    "retry_backoff_max": 300,    # Max 5 minutes between retries
    "retry_jitter": True,        # Add random jitter to prevent thundering herd
}

# Per-task overrides
RETRY_OVERRIDES = {
    "ingest_document": {"max_retries": 5, "default_retry_delay": 2},
    "translate_document": {"max_retries": 3, "default_retry_delay": 5},
    "extract_claims": {"max_retries": 3, "default_retry_delay": 5},
    "canonicalize_event": {"max_retries": 3, "default_retry_delay": 5},
    "resolve_entity": {"max_retries": 3, "default_retry_delay": 5},
    "generate_story_capsule": {"max_retries": 3, "default_retry_delay": 10},
    "evaluate_watchlist_rules": {"max_retries": 2, "default_retry_delay": 2},
}
```

**Backoff schedule (default):**

| Retry # | Base Delay | With Jitter (approx) |
|---|---|---|
| 1 | 2s | 1-3s |
| 2 | 4s | 3-5s |
| 3 | 8s | 6-10s |
| 4 | 16s | 12-20s |
| 5 | 32s | 24-40s |

### 13.2 Dead Letter Queue (DLQ)

Tasks that exhaust all retries are routed to a DLQ for manual review:

```python
from celery import Task

class BaseTask(Task):
    """Base task class with DLQ routing on final failure."""

    def on_failure(self, exc, task_id, args, kwargs, einfo):
        """Called when task fails after all retries exhausted."""
        # Log to audit
        _log_to_dlq(
            task_name=self.name,
            task_id=task_id,
            args=args,
            kwargs=kwargs,
            exception=str(exc),
            traceback=str(einfo),
        )

def _log_to_dlq(task_name, task_id, args, kwargs, exception, traceback):
    """Store failed task in Redis list for manual review.

    Key: narad:dlq:{task_name}
    Value: JSON with task_id, args, kwargs, exception, traceback, failed_at
    TTL: 7 days
    """
    ...
```

**DLQ inspection (admin endpoint):**

```
GET /api/admin/pipeline/dlq
GET /api/admin/pipeline/dlq/{task_name}
POST /api/admin/pipeline/dlq/{task_id}/retry  # Manual retry
POST /api/admin/pipeline/dlq/{task_id}/discard  # Remove from DLQ
```

### 13.3 Error Categories and Handling

| Error Type | Example | Retry? | Action |
|---|---|---|---|
| Transient network | HTTP 503, connection timeout | Yes (with backoff) | Retry up to max_retries |
| Rate limit | HTTP 429, Gemini quota | Yes (with extended backoff) | Retry with `retry_delay = retry_after` header value |
| Authentication | HTTP 401/403, expired token | No | Log error, set `source.last_error`, publish `source.error` |
| Data validation | Invalid document format | No | Log to DLQ, skip document |
| Database constraint | Unique violation (expected) | No | Idempotent — not an error, return existing ID |
| Database connection | Pool exhausted, PgBouncer timeout | Yes (1 retry) | Retry once, then fail |
| LLM response parse | Malformed JSON from Gemini | Yes (1 retry) | Retry with different temperature |
| LLM content filter | Gemini refuses to generate | No | Log warning, skip story capsule generation |

### 13.4 Circuit Breaker (per source)

```python
class SourceCircuitBreaker:
    """Per-source circuit breaker to prevent cascading failures.

    States:
    - CLOSED: normal operation, requests flow through
    - OPEN: source is broken, requests are short-circuited
    - HALF_OPEN: one test request allowed through

    Thresholds:
    - failure_threshold: 5 consecutive failures → OPEN
    - recovery_timeout: 300 seconds → transition from OPEN to HALF_OPEN
    - success_threshold: 2 consecutive successes in HALF_OPEN → CLOSED
    """

    # Stored in Redis: narad:circuit_breaker:{source_id}
    # Value: {"state": "closed|open|half_open", "failure_count": int, "last_failure_at": ISO}
```

### 13.5 Audit Trail for Errors

Every task failure is logged to `audit.audit_log`:

```sql
INSERT INTO audit.audit_log (
    id, tenant_id, user_id, action, object_type, object_id, delta, created_at
) VALUES (
    uuid_generate_v7(),
    $tenant_id,
    '00000000-0000-0000-0000-000000000000',  -- system user
    'task.failed',
    $task_name,
    $task_id::uuid,
    $error_json::jsonb,
    now()
);
```

---

## 14. Environment Variables

### 14.1 Complete Variable Reference

All environment variables for Phase 2B, showing which are new vs already defined in Phase 2A:

| Variable | Default | Phase | Used By |
|---|---|---|---|
| `DATABASE_URL` | `postgresql://narad_worker:...@pgbouncer:5432/narad_v2` | 2A | intelligence, celery-worker |
| `REDIS_URL` | `redis://localhost:6379/0` | 2A | intelligence, celery-worker |
| `INTELLIGENCE_PORT` | `8000` | **2B** | intelligence (host port mapping) |
| `CELERY_BROKER_URL` | `redis://localhost:6379/3` | **2B** | celery-worker, celery-beat |
| `CELERY_RESULT_BACKEND` | `redis://localhost:6379/4` | **2B** | celery-worker |
| `CELERY_WORKER_CONCURRENCY` | `4` | **2B** | celery-worker |
| `CELERY_WORKER_PREFETCH_MULTIPLIER` | `2` | **2B** | celery-worker |
| `CELERY_TASK_SOFT_TIME_LIMIT` | `300` | **2B** | celery-worker |
| `CELERY_TASK_TIME_LIMIT` | `600` | **2B** | celery-worker |
| `GEMINI_API_KEY` | (empty) | 2A | celery-worker |
| `GEMINI_MODEL_MID` | `gemini-2.5-flash` | 2A | celery-worker |
| `GEMINI_MODEL_LARGE` | `gemini-2.5-pro` | 2A | celery-worker |
| `BHASHINI_API_KEY` | (empty) | 2A | celery-worker |
| `BHASHINI_USER_ID` | (empty) | 2A | celery-worker |
| `BHASHINI_PIPELINE_ID` | (empty) | 2A | celery-worker |
| `BHASHINI_BASE_URL` | `https://dhruva-api.bhashini.gov.in` | 2A | celery-worker |
| `EMBEDDING_PROVIDER` | `gemini` | 2A | celery-worker |
| `EMBEDDING_MODEL` | `text-embedding-004` | 2A | celery-worker |
| `EMBEDDING_DIMENSIONS` | `768` | 2A | celery-worker |
| `INGEST_POLL_INTERVAL_MS` | `60000` | 2A | celery-beat |
| `EMBED_BATCH_SIZE` | `50` | 2A | celery-worker |
| `EMBED_BATCH_WINDOW_MS` | `30000` | 2A | celery-beat |
| `FEED_PROJECTION_BATCH_MS` | `500` | 2A | celery-worker |
| `POSTGRES_WORKER_USER` | `narad_worker` | 2A | docker-compose.yml |
| `POSTGRES_WORKER_PASSWORD` | (must set) | 2A | docker-compose.yml |

### 14.2 Docker-Internal vs Host URLs

Inside Docker Compose, services use Docker DNS names:
- `pgbouncer:5432` (not `localhost:6432`)
- `redis:6379` (not `localhost:6379`)

The `environment:` block in docker-compose.yml overrides the `.env` file values with Docker-internal URLs. The `.env` file retains `localhost` values for local development without Docker.

---

## 15. API Endpoints

### 15.1 Health Check

```
GET /health
```

**Response (200 OK):**

```json
{
  "status": "healthy",
  "version": "0.1.0",
  "checks": {
    "database": {
      "status": "healthy",
      "latency_ms": 2.3,
      "pool_size": 20,
      "pool_free": 15
    },
    "redis": {
      "status": "healthy",
      "latency_ms": 0.5
    },
    "celery": {
      "status": "healthy",
      "active_workers": 4,
      "queued_tasks": {
        "ingest": 3,
        "enrichment": 12,
        "projection": 0,
        "maintenance": 0
      }
    }
  },
  "timestamp": "2026-03-28T10:30:00Z"
}
```

**Response (503 Service Unavailable):**

```json
{
  "status": "unhealthy",
  "version": "0.1.0",
  "checks": {
    "database": {"status": "unhealthy", "error": "connection pool exhausted"},
    "redis": {"status": "healthy", "latency_ms": 0.5},
    "celery": {"status": "healthy", "active_workers": 4}
  },
  "timestamp": "2026-03-28T10:30:00Z"
}
```

### 15.2 Admin: List Sources

```
GET /api/admin/sources
```

**Response (200 OK):**

```json
{
  "sources": [
    {
      "id": "uuid",
      "name": "PIB RSS",
      "slug": "pib_rss",
      "source_type": "rss",
      "trust_tier": 1,
      "is_active": true,
      "governance_approved": true,
      "last_successful_fetch": "2026-03-28T10:25:00Z",
      "last_error": null,
      "update_cadence_seconds": 300,
      "documents_ingested_24h": 42,
      "circuit_breaker_state": "closed"
    }
  ],
  "total": 22,
  "active": 18
}
```

### 15.3 Admin: Trigger Source Ingestion

```
POST /api/admin/sources/{source_id}/trigger
```

**Response (202 Accepted):**

```json
{
  "task_id": "celery-task-uuid",
  "source_id": "uuid",
  "status": "queued",
  "message": "Ingestion task queued for source 'pib_rss'"
}
```

### 15.4 Admin: Pipeline Status

```
GET /api/admin/pipeline/status
```

**Response (200 OK):**

```json
{
  "queues": {
    "ingest": {"depth": 3, "active": 2, "reserved": 1},
    "enrichment": {"depth": 12, "active": 4, "reserved": 8},
    "projection": {"depth": 0, "active": 0, "reserved": 0},
    "maintenance": {"depth": 0, "active": 0, "reserved": 0}
  },
  "workers": {
    "total": 4,
    "active": 4,
    "idle": 0
  },
  "error_rates": {
    "last_1h": {"total_tasks": 450, "failed": 3, "rate": 0.0067},
    "last_24h": {"total_tasks": 10800, "failed": 45, "rate": 0.0042}
  },
  "dlq": {
    "total": 5,
    "by_task": {
      "translate_document": 3,
      "extract_claims": 2
    }
  },
  "throughput": {
    "documents_per_minute": 12.5,
    "events_per_minute": 3.2,
    "claims_per_minute": 45.0
  },
  "timestamp": "2026-03-28T10:30:00Z"
}
```

### 15.5 Admin: Create Audit Partition

```
POST /api/admin/maintenance/create-partition
```

**Request body (optional — defaults to next month):**

```json
{
  "year": 2026,
  "month": 6
}
```

**Response (200 OK):**

```json
{
  "partition_name": "audit_log_2026_06",
  "range_start": "2026-06-01",
  "range_end": "2026-07-01",
  "created": true,
  "message": "Partition audit_log_2026_06 created successfully"
}
```

**Response (200 OK, already exists):**

```json
{
  "partition_name": "audit_log_2026_06",
  "created": false,
  "message": "Partition audit_log_2026_06 already exists"
}
```

### 15.6 Admin: DLQ Management

```
GET /api/admin/pipeline/dlq
GET /api/admin/pipeline/dlq/{task_name}
POST /api/admin/pipeline/dlq/{task_id}/retry
POST /api/admin/pipeline/dlq/{task_id}/discard
```

---

## 16. pyproject.toml

```toml
[project]
name = "narad-intelligence"
version = "0.1.0"
description = "NARAD V2 Intelligence Plane — FastAPI + Celery backend"
requires-python = ">=3.12"
dependencies = [
    # Web framework
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.32.0",
    "uvloop>=0.21.0",
    "httptools>=0.6.0",

    # Database
    "asyncpg>=0.30.0",
    "sqlalchemy[asyncio]>=2.0.36",

    # Task queue
    "celery[redis]>=5.4.0",

    # Redis
    "redis[hiredis]>=5.2.0",

    # HTTP client
    "httpx>=0.28.0",

    # Validation
    "pydantic>=2.10.0",
    "pydantic-settings>=2.7.0",

    # LLM
    "google-generativeai>=0.8.0",

    # Utilities
    "python-dotenv>=1.0.0",
    "orjson>=3.10.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.3.0",
    "pytest-asyncio>=0.24.0",
    "pytest-cov>=6.0.0",
    "ruff>=0.8.0",
    "mypy>=1.13.0",
    "factory-boy>=3.3.0",
    "httpx",  # For TestClient
]

[build-system]
requires = ["setuptools>=75.0"]
build-backend = "setuptools.build_meta"

[tool.setuptools.packages.find]
where = ["src"]

[tool.ruff]
target-version = "py312"
line-length = 120

[tool.ruff.lint]
select = ["E", "F", "I", "N", "W", "UP", "B", "A", "C4", "SIM", "TCH"]

[tool.mypy]
python_version = "3.12"
strict = true
warn_return_any = true
warn_unused_configs = true

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
```

---

## 17. Database Migration Additions

Phase 2B requires one new migration file to support the intelligence plane:

### `migrations/011_intelligence_plane.sql`

```sql
-- 011_intelligence_plane.sql
-- Additions required for Phase 2B intelligence plane.
-- Adds: lineage_hash unique index on claims, system user for audit logging.

-- ── 1. Unique index on claims.lineage_hash (dedup for claim extraction) ──
CREATE UNIQUE INDEX IF NOT EXISTS claims_lineage_hash_key
    ON core.claims (lineage_hash);

-- ── 2. System user for audit logging by automated processes ──
-- The intelligence plane logs actions as a system user (no human login)
-- This requires a well-known system user in core.users.
-- The system user has a deterministic UUID so all environments use the same ID.
INSERT INTO core.users (id, tenant_id, email, display_name, role, password_hash)
SELECT
    '00000000-0000-7000-8000-000000000001'::uuid,
    (SELECT id FROM core.tenants LIMIT 1),
    'system@narad.internal',
    'NARAD System',
    'admin',
    'SYSTEM_NO_LOGIN'
WHERE NOT EXISTS (
    SELECT 1 FROM core.users WHERE id = '00000000-0000-7000-8000-000000000001'::uuid
);

-- ── 3. Index on events for canonicalization queries ──
-- Supports the 24-hour temporal window + event_type filter used by EventClusterer
CREATE INDEX IF NOT EXISTS idx_events_canonicalization
    ON core.events (tenant_id, event_type, occurred_at DESC)
    WHERE status != 'invalidated';

-- ── 4. Index on event_entity_links for entity overlap queries ──
CREATE INDEX IF NOT EXISTS idx_event_entity_links_entity
    ON core.event_entity_links (entity_id, event_id);

-- ── 5. Grant narad_worker INSERT on audit schema ──
-- Already covered by 010_grants.sql for narad_ingest_writer, but explicit for clarity:
GRANT INSERT ON ALL TABLES IN SCHEMA audit TO narad_ingest_writer;
GRANT USAGE ON SCHEMA workflow TO narad_ingest_writer;
GRANT SELECT ON ALL TABLES IN SCHEMA workflow TO narad_ingest_writer;
GRANT INSERT ON workflow.watchlist_alerts TO narad_ingest_writer;
```

---

## 18. Verification Checklist

After `docker compose up -d` with all 8 services, the following must pass:

```bash
# 1. All 8 services healthy/running
docker compose ps | grep -c "Up"  # expect 8

# 2. Intelligence plane health check
curl -s http://localhost:8000/health | jq '.status'  # expect "healthy"

# 3. Database connectivity (via PgBouncer)
curl -s http://localhost:8000/health | jq '.checks.database.status'  # expect "healthy"

# 4. Redis connectivity
curl -s http://localhost:8000/health | jq '.checks.redis.status'  # expect "healthy"

# 5. Celery workers active
curl -s http://localhost:8000/health | jq '.checks.celery.active_workers'  # expect >= 1

# 6. Admin sources endpoint
curl -s http://localhost:8000/api/admin/sources | jq '.total'  # expect >= 0

# 7. Pipeline status endpoint
curl -s http://localhost:8000/api/admin/pipeline/status | jq '.workers.total'  # expect >= 1

# 8. Celery Beat running (check for scheduled tasks)
docker compose logs celery-beat | grep "beat: Starting"  # expect match

# 9. Manual source trigger (requires at least one source seeded)
# curl -X POST http://localhost:8000/api/admin/sources/{source_id}/trigger | jq '.status'

# 10. Redis pub/sub channels active
docker compose exec redis redis-cli PUBSUB CHANNELS 'narad:*'  # expect channel list after first ingestion

# 11. Migration 011 applied
psql postgres://postgres:${POSTGRES_SUPERUSER_PASSWORD}@localhost:5433/narad_v2 \
  -c "SELECT filename FROM public._migrations WHERE filename = '011_intelligence_plane.sql';"
```

---

## 19. Open Decisions Carried Forward

| Decision | Resolved Default | When to Revisit |
|---|---|---|
| Celery sync-to-async bridge | Module-level event loop with `run_async()` | Evaluate Celery 6.0 native async support when released |
| Single celery-worker service | One container consumes all queues | Split into dedicated workers per queue in production (Phase 5) |
| Gemini as sole LLM provider | Gemini 2.5 Flash/Pro for all LLM tasks | Add OpenAI/Ollama fallback chain when multi-provider is needed |
| JSON Logic for watchlist rules | Custom evaluator with extended operators | Evaluate `json-logic-py` library vs custom implementation |
| No authentication on admin endpoints | Admin endpoints are unprotected | Add JWT middleware in Phase 2C (Next.js auth shares JWT) |
| Content hash uses body_text only | `SHA-256(body_text)` for dedup | May need to include `source_id` or `doc_type` if same text appears in different contexts |
| Embedding batch flush via timer | Celery Beat periodic task every 30s | Consider Redis Stream consumer for lower-latency embedding with backpressure |
| Circuit breaker in Redis | Per-source circuit state in Redis keys | Move to a proper circuit breaker library (e.g., `pybreaker`) if complexity grows |
| System user UUID hardcoded | `00000000-0000-7000-8000-000000000001` | This works for single-tenant dev; multi-tenant needs one system user per tenant |
| PgBouncer `statement_cache_size=0` | Disables asyncpg statement cache for PgBouncer compatibility | Re-evaluate if moving to session-mode pooling (enables server-side prepared statements) |
| Audit partition creation is manual trigger + cron | Celery Beat task on 20th of month | Consider `pg_partman` extension for fully automated partition management |
| Source adapter stubs for sources 28-32 | Raise `NotImplementedError` | Implement as sources become available / APIs are documented |

---

## 20. What Phase 2C Will Build On Top Of This

- Next.js 15 application connects to PgBouncer as `narad_app` (read-only role)
- WebSocket server subscribes to Redis pub/sub channels (`narad:*`) and forwards to authenticated clients
- UI reads from `projections` schema (pulseboard_feed, watchlist_deltas, entity_summaries, regulatory_digest)
- Authentication middleware shares JWT validation between Next.js API routes and intelligence admin endpoints
- Sovereign Midnight design system renders the PulseBoard, WatchList, CorpWatch, LexPulse, and GeoStrat workspaces
