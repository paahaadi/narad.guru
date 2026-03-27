# NARAD V2 — Phase 2A Design Spec
## Data Plane + Infrastructure

**Date:** 2026-03-27
**Session:** 2A of Phase 2
**Status:** Approved — ready for implementation
**Depends on:** `docs/architecture/canonical_ontology.md` (Phase 1 deliverable)

---

## Scope

This session produces a running, verified data plane:
- Docker Compose stack (5 services)
- 10 ordered SQL migration files covering every table from the canonical ontology
- Shell-based migration runner with idempotency tracking
- Monorepo skeleton (empty `apps/` and `packages/` dirs for Phase 2B/2C)

**Out of scope for this session:** Python backend, Next.js frontend, source adapters, any application code.

---

## Directory Structure

```
narad.guru/
├── docker-compose.yml
├── .env                             ← gitignored; copy from .env.example
├── .env.example                     ← already exists
├── .gitignore                       ← already exists
│
├── infra/
│   ├── pgbouncer/
│   │   ├── pgbouncer.ini            ← transaction mode config
│   │   └── userlist.txt             ← narad_app + narad_worker credentials (gitignored in prod)
│   └── pgadmin/
│       └── servers.json             ← auto-registers Postgres connection
│
├── migrations/
│   ├── migrate.sh                   ← shell runner
│   ├── 001_extensions.sql
│   ├── 002_roles.sql
│   ├── 003_schemas.sql
│   ├── 004_core_schema.sql
│   ├── 005_workflow_schema.sql
│   ├── 006_domain_schemas.sql
│   ├── 007_audit_schema.sql
│   ├── 008_projections_schema.sql
│   ├── 009_timescaledb.sql
│   └── 010_grants.sql
│
├── apps/
│   ├── intelligence/.gitkeep        ← Python FastAPI/Celery (Phase 2B)
│   └── web/.gitkeep                 ← Next.js 15 (Phase 2C)
│
├── packages/.gitkeep                ← shared config (future)
│
└── docs/
    ├── architecture/
    │   └── canonical_ontology.md    ← already exists
    └── superpowers/
        └── specs/
            └── 2026-03-27-phase-2a-data-plane-design.md  ← this file
```

---

## Docker Compose

### Services

| Service | Image | Host Port | Container Port | Role |
|---|---|---|---|---|
| `postgres` | `timescale/timescaledb-ha:pg16-latest` | `5433` | `5432` | Canonical data store — direct access for migrations and admin |
| `redis` | `redis:7-alpine` | `6379` | `6379` | Pub/sub event bus + projection cache |
| `pgbouncer` | `edoburu/pgbouncer:latest` | `5432` | `5432` | Connection pool — transaction mode — app connects here |
| `pgadmin` | `dpage/pgadmin4:latest` | `5050` | `80` | Postgres inspection UI — desktop mode (no login) |
| `redisinsight` | `redis/redisinsight:2` | `5540` | `5540` | Redis inspection UI |

### Critical configuration details

**postgres:**
- `PGDATA=/home/postgres/pgdata/data` — timescaledb-ha uses a non-standard data directory; wrong path causes data loss on restart
- Volume: `narad_pgdata:/home/postgres/pgdata/data`
- Health check: `pg_isready -U postgres -d narad_v2` every 5s, 5 retries
- Exposed on `5433` — PgBouncer occupies `5432` on the host

**pgbouncer:**
- Mounts `./infra/pgbouncer/pgbouncer.ini` and `./infra/pgbouncer/userlist.txt` (read-only)
- `depends_on: postgres: condition: service_healthy` — only starts after Postgres passes health check
- Pool mode: `transaction`
- `max_client_conn = 200`, `default_pool_size = 20`
- `idle_transaction_timeout = 30s`, `query_timeout = 30s`
- Connects internally to `postgres:5432` (Docker network name resolution)

**redis:**
- `redis-server --appendonly yes --save 60 1` — AOF enabled + RDB snapshot every 60s if ≥1 key changed
- Volume: `narad_redis:/data`
- Health check: `redis-cli ping` every 5s

**pgadmin:**
- `PGADMIN_CONFIG_SERVER_MODE: 'False'` — desktop mode, no login required
- Mounts `./infra/pgadmin/servers.json` to `/pgadmin4/servers.json`
- Pre-registered server connects to `postgres:5432` (internal) as superuser
- First use: pgAdmin prompts for Postgres superuser password once per volume lifetime

**redisinsight:**
- First use: manually add Redis connection (`redis:6379`) in the UI — one-time step

### Networks and volumes

```yaml
networks:
  narad:
    driver: bridge

volumes:
  narad_pgdata:
  narad_redis:
  narad_pgadmin:
  narad_redisinsight:
```

All services on the `narad` bridge network. Internal service-to-service communication uses Docker DNS names (`postgres`, `redis`, `pgbouncer`).

### Environment variables

All secrets injected via `env_file: [.env]`. The `.env` file must define:

```
POSTGRES_SUPERUSER=postgres
POSTGRES_SUPERUSER_PASSWORD=<strong-password>
POSTGRES_DB=narad_v2
POSTGRES_DIRECT_PORT=5433
POSTGRES_APP_USER=narad_app
POSTGRES_APP_PASSWORD=<app-password>
POSTGRES_WORKER_USER=narad_worker
POSTGRES_WORKER_PASSWORD=<worker-password>
PGADMIN_EMAIL=admin@narad.local
PGADMIN_PASSWORD=admin
```

---

## PgBouncer Configuration

### `infra/pgbouncer/pgbouncer.ini`

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
log_connections = 1
log_disconnections = 1
```

### `infra/pgbouncer/userlist.txt`

```
"narad_app"    "narad_app_password_here"
"narad_worker" "narad_worker_password_here"
```

Passwords must match `POSTGRES_APP_PASSWORD` and `POSTGRES_WORKER_PASSWORD` in `.env`. Both roles are created by `002_roles.sql`.

---

## Migration Files

### Execution order and responsibility

| File | Tables/Objects | Notes |
|---|---|---|
| `001_extensions.sql` | 6 extensions + `uuid_generate_v7()` | Attempts `pg_uuidv7` extension; falls back to PL/pgSQL if unavailable |
| `002_roles.sql` | 5 roles | `narad_app_reader`, `narad_ingest_writer`, `narad_projection_writer`, `narad_app` (login), `narad_worker` (login) |
| `003_schemas.sql` | 7 schemas | `core`, `workflow`, `geo_intelligence`, `corp_watch`, `lex_pulse`, `audit`, `projections` |
| `004_core_schema.sql` | 12 tables | Created in FK dependency order; all get RLS + `updated_at` trigger |
| `005_workflow_schema.sql` | 11 tables | `evidence_custody_log` is INSERT-only via trigger |
| `006_domain_schemas.sql` | 4 tables | `corp_watch.entity_profiles`, `lex_pulse.regulatory_events`, `lex_pulse.semantic_cache`, `geo_intelligence.layer_configs` |
| `007_audit_schema.sql` | 2 tables | `audit_log` monthly range-partitioned (current month + 2 future partitions pre-created); INSERT-only via REVOKE |
| `008_projections_schema.sql` | 4 tables | JSONB projection tables; no RLS (tenant isolation via JSONB content) |
| `009_timescaledb.sql` | 1 hypertable + aggregates | `core.telemetry_events` → hypertable; 7-day retention; 1-day compression; hourly + daily continuous aggregates |
| `010_grants.sql` | GRANT/REVOKE statements | Runs last — all tables must exist before grants are applied |

### UUID v7 fallback (001_extensions.sql)

```sql
-- Attempt extension; ignore error if not available
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_uuidv7;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Always create function — wraps extension if available, standalone if not
CREATE OR REPLACE FUNCTION uuid_generate_v7()
RETURNS uuid
LANGUAGE plpgsql
PARALLEL SAFE
AS $$
DECLARE
  unix_ts_ms bytea;
  uuid_bytes bytea;
BEGIN
  unix_ts_ms = substring(int8send(
    floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint
  ) FROM 3);
  uuid_bytes = unix_ts_ms || gen_random_bytes(10);
  uuid_bytes = set_byte(uuid_bytes, 6,
    (b'01110000'::int | (get_byte(uuid_bytes, 6) & b'00001111'::int)));
  uuid_bytes = set_byte(uuid_bytes, 8,
    (b'10000000'::int | (get_byte(uuid_bytes, 8) & b'00111111'::int)));
  RETURN encode(uuid_bytes, 'hex')::uuid;
END $$;
```

### INSERT-only enforcement (007_audit_schema.sql)

`audit.audit_log` and `workflow.evidence_custody_log` are INSERT-only:
1. `REVOKE UPDATE, DELETE ON TABLE audit.audit_log FROM PUBLIC;`
2. `REVOKE UPDATE, DELETE ON TABLE audit.audit_log FROM narad_ingest_writer;`
3. A `BEFORE UPDATE OR DELETE` trigger raises `EXCEPTION` as a second layer of defence.

### Audit log partitioning (007_audit_schema.sql)

```sql
CREATE TABLE audit.audit_log (...)
PARTITION BY RANGE (created_at);

-- Pre-create current month + 2 future months
CREATE TABLE audit.audit_log_2026_03
  PARTITION OF audit.audit_log
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
-- ... repeat for 04, 05
```

A cron job (Phase 2B, intelligence plane) creates the next month's partition on the 20th of each month. New partitions are never created by migrations after initial setup.

---

## Migration Runner (`migrate.sh`)

### Interface

```bash
./migrations/migrate.sh              # apply pending migrations
./migrations/migrate.sh --dry-run    # show what would run, no changes
./migrations/migrate.sh --reset      # DROP + recreate DB, run all (dev only, prompts for confirmation)
./migrations/migrate.sh --status     # show applied/pending status for all files
```

### Behaviour

1. Reads connection config from `.env` (or environment variables if set)
2. Connects to `localhost:5433` (direct Postgres, never PgBouncer)
3. Creates `public._migrations (filename TEXT, sha256 TEXT, applied_at TIMESTAMPTZ)` if not exists
4. For each `.sql` file in `migrations/` sorted lexicographically:
   - Checks if filename exists in `_migrations`
   - If yes: computes current sha256; warns if file changed since last run; skips
   - If no: runs file in a single `psql` call; on success inserts row into `_migrations`; on failure exits with non-zero code and prints the failing statement
5. Prints colored summary: `✓` applied, `→` skipped, `✗` failed

### Dependencies

- `psql` (PostgreSQL client)
- `sha256sum` (Linux) or `shasum -a 256` (macOS) — auto-detected
- No Python, Node, Java, or other runtimes required

### Script resolves its own path

```bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
```

Works correctly when called from any working directory.

---

## Verification Checklist

After running `docker compose up -d && ./migrations/migrate.sh`, the following must pass:

```bash
# 1. All 5 services healthy
docker compose ps

# 2. All 7 schemas exist
psql postgres://postgres:...@localhost:5433/narad_v2 \
  -c "\dn" | grep -E "core|workflow|audit|projections|corp_watch|lex_pulse|geo_intelligence"

# 3. Core tables exist (spot check)
psql ... -c "\dt core.*" | grep -E "events|entities|documents|claims"

# 4. RLS enabled on core.events
psql ... -c "SELECT relrowsecurity FROM pg_class WHERE relname='events';" | grep t

# 5. uuid_generate_v7() works
psql ... -c "SELECT uuid_generate_v7();"

# 6. PgBouncer accepts narad_app connection
psql postgres://narad_app:...@localhost:5432/narad_v2 -c "SELECT 1;"

# 7. TimescaleDB hypertable created
psql ... -c "SELECT hypertable_name FROM timescaledb_information.hypertables;"

# 8. pgAdmin accessible
curl -s -o /dev/null -w "%{http_code}" http://localhost:5050  # expect 200

# 9. RedisInsight accessible
curl -s -o /dev/null -w "%{http_code}" http://localhost:5540  # expect 200
```

---

## What Phase 2B Builds On Top Of This

- Python FastAPI app connects to PgBouncer on `localhost:5432` as `narad_worker`
- Next.js API routes connect to PgBouncer on `localhost:5432` as `narad_app`
- Celery workers use `narad_worker` role (ingest_writer + projection_writer permissions)
- Partition management cron creates `audit_log` partitions monthly

---

## Open Decisions Carried Forward

| Decision | Resolved default | When to revisit |
|---|---|---|
| PgBouncer `auth_type = plain` | Acceptable for dev | Switch to `scram-sha-256` before production |
| Audit log partition creation | Manual cron (Phase 2B) | Automate via pg_cron extension in Phase 7 |
| `userlist.txt` committed to repo | Dev only with placeholder passwords | Inject via secrets manager in production |
