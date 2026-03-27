# Phase 2A: Data Plane + Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a running, verified PostgreSQL + Redis data plane with all 30+ schema objects from the canonical ontology, served through PgBouncer, with migration runner and developer tooling.

**Architecture:** Docker Compose hosts 5 services (postgres, redis, pgbouncer, pgadmin, redisinsight). Ten ordered SQL migration files implement every table, index, trigger, RLS policy, and grant from `docs/architecture/canonical_ontology.md`. A shell-based migration runner (`migrate.sh`) tracks applied files via sha256 in `public._migrations`.

**Tech Stack:** timescale/timescaledb-ha:pg16-latest (Postgres+TimescaleDB+PostGIS+pgvector), Redis 7, edoburu/pgbouncer, dpage/pgadmin4, redis/redisinsight:2, bash, psql

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `apps/intelligence/.gitkeep` | Create | Phase 2B placeholder |
| `apps/web/.gitkeep` | Create | Phase 2C placeholder |
| `packages/.gitkeep` | Create | Shared config placeholder |
| `.env.example` | Modify | Add Phase 2A infrastructure variables |
| `docker-compose.yml` | Create | 5-service stack definition |
| `infra/pgbouncer/pgbouncer.ini` | Create | Transaction-mode pool config |
| `infra/pgbouncer/userlist.txt` | Create | Credential template (dev placeholder) |
| `infra/pgadmin/servers.json` | Create | Auto-register Postgres connections |
| `scripts/setup-dev.sh` | Create | One-command dev environment boot |
| `migrations/migrate.sh` | Create | Shell runner with idempotency tracking |
| `migrations/001_extensions.sql` | Create | 6 extensions + uuid_generate_v7() |
| `migrations/002_roles.sql` | Create | 5 roles with idempotency guards |
| `migrations/003_schemas.sql` | Create | 7 schemas + set_updated_at() trigger fn |
| `migrations/004_core_schema.sql` | Create | 12 core tables with RLS, indexes, triggers |
| `migrations/005_workflow_schema.sql` | Create | 11 workflow tables |
| `migrations/006_domain_schemas.sql` | Create | 4 domain tables |
| `migrations/007_audit_schema.sql` | Create | 2 audit tables, partitioned, INSERT-only |
| `migrations/008_projections_schema.sql` | Create | 4 CQRS projection tables |
| `migrations/009_timescaledb.sql` | Create | Hypertable + retention + aggregates |
| `migrations/010_grants.sql` | Create | All GRANT statements |

---

## Task 1: Monorepo Skeleton

**Files:**
- Create: `apps/intelligence/.gitkeep`
- Create: `apps/web/.gitkeep`
- Create: `packages/.gitkeep`

- [ ] **Step 1: Create monorepo skeleton directories and gitkeeps**

```bash
mkdir -p apps/intelligence apps/web packages
touch apps/intelligence/.gitkeep apps/web/.gitkeep packages/.gitkeep
```

- [ ] **Step 2: Verify structure**

```bash
find apps packages -name .gitkeep
```
Expected output:
```
apps/intelligence/.gitkeep
apps/web/.gitkeep
packages/.gitkeep
```

- [ ] **Step 3: Commit**

```bash
git add apps/intelligence/.gitkeep apps/web/.gitkeep packages/.gitkeep
git commit -m "feat: add monorepo skeleton for Phase 2B/2C"
```

---

## Task 2: Update .env.example with Phase 2A Variables

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Add Phase 2A infrastructure block to the top of .env.example**

Insert the following block immediately after the opening comment header (before `# ── Core Infrastructure ─────`):

```bash
# ── Phase 2A: Docker Stack ──────────────────────────────────────────────────

# Postgres superuser (used for migrations only — never by application)
POSTGRES_SUPERUSER=postgres
POSTGRES_SUPERUSER_PASSWORD=change_me_strong_password

# Application database
POSTGRES_DB=narad_v2

# Ports
# postgres is on 5433 (direct) — pgbouncer occupies 5432 on the host
POSTGRES_DIRECT_PORT=5433
POSTGRES_POOL_PORT=5432

# Application roles (used by PgBouncer userlist.txt and app connections)
POSTGRES_APP_USER=narad_app
POSTGRES_APP_PASSWORD=change_me_app_password
POSTGRES_WORKER_USER=narad_worker
POSTGRES_WORKER_PASSWORD=change_me_worker_password

# pgAdmin (desktop mode — no login required)
PGADMIN_EMAIL=admin@narad.local
PGADMIN_PASSWORD=admin
PGADMIN_PORT=5050

# RedisInsight
REDISINSIGHT_PORT=5540
```

Also update the existing `DATABASE_URL` line to reflect the new connection through PgBouncer:

Old:
```
DATABASE_URL=postgresql://narad_user:CHANGE_ME@localhost:5432/narad_v2
```

New:
```
# App connects through PgBouncer (port 5432). Migrations connect direct (port 5433).
DATABASE_URL=postgresql://narad_app:change_me_app_password@localhost:5432/narad_v2
DATABASE_DIRECT_URL=postgresql://postgres:change_me_strong_password@localhost:5433/narad_v2
```

- [ ] **Step 2: Verify the file still loads without syntax errors**

```bash
set -a && source .env.example && set +a && echo "OK: POSTGRES_DB=$POSTGRES_DB"
```
Expected: `OK: POSTGRES_DB=narad_v2`

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "feat: add Phase 2A docker stack variables to .env.example"
```

---

## Task 3: docker-compose.yml

**Files:**
- Create: `docker-compose.yml`

- [ ] **Step 1: Write docker-compose.yml**

```yaml
# narad.guru — Docker Compose (Phase 2A data plane)
# Requires: .env file copied from .env.example with real passwords

services:
  postgres:
    image: timescale/timescaledb-ha:pg16-latest
    environment:
      POSTGRES_USER: ${POSTGRES_SUPERUSER}
      POSTGRES_PASSWORD: ${POSTGRES_SUPERUSER_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
      PGDATA: /home/postgres/pgdata/data
    volumes:
      - narad_pgdata:/home/postgres/pgdata/data
    ports:
      - "${POSTGRES_DIRECT_PORT:-5433}:5432"
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "${POSTGRES_SUPERUSER:-postgres}", "-d", "${POSTGRES_DB:-narad_v2}"]
      interval: 5s
      timeout: 5s
      retries: 5
    networks:
      - narad
    env_file:
      - .env

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes --save 60 1
    volumes:
      - narad_redis:/data
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5
    networks:
      - narad

  pgbouncer:
    image: edoburu/pgbouncer:latest
    volumes:
      - ./infra/pgbouncer/pgbouncer.ini:/etc/pgbouncer/pgbouncer.ini:ro
      - ./infra/pgbouncer/userlist.txt:/etc/pgbouncer/userlist.txt:ro
    ports:
      - "${POSTGRES_POOL_PORT:-5432}:5432"
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - narad

  pgadmin:
    image: dpage/pgadmin4:latest
    environment:
      PGADMIN_DEFAULT_EMAIL: ${PGADMIN_EMAIL:-admin@narad.local}
      PGADMIN_DEFAULT_PASSWORD: ${PGADMIN_PASSWORD:-admin}
      PGADMIN_CONFIG_SERVER_MODE: 'False'
      PGADMIN_CONFIG_MASTER_PASSWORD_REQUIRED: 'False'
    volumes:
      - narad_pgadmin:/var/lib/pgadmin
      - ./infra/pgadmin/servers.json:/pgadmin4/servers.json:ro
    ports:
      - "${PGADMIN_PORT:-5050}:80"
    networks:
      - narad
    env_file:
      - .env

  redisinsight:
    image: redis/redisinsight:2
    volumes:
      - narad_redisinsight:/data
    ports:
      - "${REDISINSIGHT_PORT:-5540}:5540"
    networks:
      - narad

networks:
  narad:
    driver: bridge

volumes:
  narad_pgdata:
  narad_redis:
  narad_pgadmin:
  narad_redisinsight:
```

- [ ] **Step 2: Validate compose file syntax**

```bash
docker compose config --quiet && echo "OK: compose file valid"
```
Expected: `OK: compose file valid`

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml
git commit -m "feat: add docker-compose.yml with 5-service data plane stack"
```

---

## Task 4: PgBouncer Configuration

**Files:**
- Create: `infra/pgbouncer/pgbouncer.ini`
- Create: `infra/pgbouncer/userlist.txt`

- [ ] **Step 1: Create infra/pgbouncer directory and pgbouncer.ini**

```bash
mkdir -p infra/pgbouncer
```

Write `infra/pgbouncer/pgbouncer.ini`:

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

- [ ] **Step 2: Write userlist.txt template**

Write `infra/pgbouncer/userlist.txt`:

```
"narad_app"    "narad_app_password_here"
"narad_worker" "narad_worker_password_here"
```

Note: `scripts/setup-dev.sh` overwrites this file with real passwords from `.env` before starting Docker. The placeholder values are for the git-committed template only.

- [ ] **Step 3: Commit**

```bash
git add infra/pgbouncer/pgbouncer.ini infra/pgbouncer/userlist.txt
git commit -m "feat: add PgBouncer transaction-mode pool configuration"
```

---

## Task 5: pgAdmin Server Registration

**Files:**
- Create: `infra/pgadmin/servers.json`

- [ ] **Step 1: Create infra/pgadmin directory and servers.json**

```bash
mkdir -p infra/pgadmin
```

Write `infra/pgadmin/servers.json`:

```json
{
  "Servers": {
    "1": {
      "Name": "NARAD Postgres (direct :5433)",
      "Group": "NARAD V2",
      "Host": "postgres",
      "Port": 5432,
      "MaintenanceDB": "narad_v2",
      "Username": "postgres",
      "SSLMode": "prefer",
      "Comment": "Direct connection — use for admin and migrations"
    },
    "2": {
      "Name": "NARAD PgBouncer (pooled :5432)",
      "Group": "NARAD V2",
      "Host": "pgbouncer",
      "Port": 5432,
      "MaintenanceDB": "narad_v2",
      "Username": "narad_app",
      "SSLMode": "prefer",
      "Comment": "App connection through PgBouncer transaction pool"
    }
  }
}
```

- [ ] **Step 2: Verify JSON is valid**

```bash
python3 -m json.tool infra/pgadmin/servers.json > /dev/null && echo "OK: valid JSON"
```
Expected: `OK: valid JSON`

- [ ] **Step 3: Commit**

```bash
git add infra/pgadmin/servers.json
git commit -m "feat: add pgAdmin server auto-registration for NARAD V2"
```

---

## Task 6: setup-dev.sh

**Files:**
- Create: `scripts/setup-dev.sh`

- [ ] **Step 1: Create scripts directory and write setup-dev.sh**

```bash
mkdir -p scripts
```

Write `scripts/setup-dev.sh`:

```bash
#!/usr/bin/env bash
# setup-dev.sh — one-command dev environment boot for NARAD V2
# Usage: ./scripts/setup-dev.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# ── Check prerequisites ───────────────────────────────────────────────────────
for cmd in docker psql; do
  if ! command -v "$cmd" > /dev/null 2>&1; then
    echo "ERROR: $cmd is required but not installed"
    exit 1
  fi
done

# ── Load .env ─────────────────────────────────────────────────────────────────
if [[ ! -f "$PROJECT_ROOT/.env" ]]; then
  echo "ERROR: .env not found. Copy .env.example to .env and fill in passwords."
  exit 1
fi
set -a
# shellcheck disable=SC1091
source "$PROJECT_ROOT/.env"
set +a

# ── Generate userlist.txt from env vars ───────────────────────────────────────
USERLIST="$PROJECT_ROOT/infra/pgbouncer/userlist.txt"
cat > "$USERLIST" <<EOF
"${POSTGRES_APP_USER}" "${POSTGRES_APP_PASSWORD}"
"${POSTGRES_WORKER_USER}" "${POSTGRES_WORKER_PASSWORD}"
EOF
echo "✓ Generated $USERLIST"

# ── Start Docker Compose stack ────────────────────────────────────────────────
echo "→ Starting Docker Compose stack..."
docker compose -f "$PROJECT_ROOT/docker-compose.yml" up -d
echo "✓ Services started"

# ── Wait for Postgres to accept connections ───────────────────────────────────
echo "→ Waiting for Postgres on port ${POSTGRES_DIRECT_PORT:-5433}..."
RETRIES=30
until PGPASSWORD="${POSTGRES_SUPERUSER_PASSWORD}" psql \
  -h localhost \
  -p "${POSTGRES_DIRECT_PORT:-5433}" \
  -U "${POSTGRES_SUPERUSER}" \
  -d "${POSTGRES_DB}" \
  -c "SELECT 1" > /dev/null 2>&1; do
  RETRIES=$((RETRIES - 1))
  if [[ $RETRIES -eq 0 ]]; then
    echo "ERROR: Postgres did not become ready after 60 seconds"
    docker compose -f "$PROJECT_ROOT/docker-compose.yml" logs postgres | tail -20
    exit 1
  fi
  echo "  still waiting... ($RETRIES attempts left)"
  sleep 2
done
echo "✓ Postgres is ready"

# ── Run migrations ────────────────────────────────────────────────────────────
"$PROJECT_ROOT/migrations/migrate.sh"
```

- [ ] **Step 2: Make executable and verify syntax**

```bash
chmod +x scripts/setup-dev.sh
bash -n scripts/setup-dev.sh && echo "OK: bash syntax valid"
```
Expected: `OK: bash syntax valid`

- [ ] **Step 3: Commit**

```bash
git add scripts/setup-dev.sh
git commit -m "feat: add setup-dev.sh one-command dev environment boot"
```

---

## Task 7: migrations/migrate.sh

**Files:**
- Create: `migrations/migrate.sh`

- [ ] **Step 1: Create migrations directory and write migrate.sh**

```bash
mkdir -p migrations
```

Write `migrations/migrate.sh`:

```bash
#!/usr/bin/env bash
# migrate.sh — idempotent SQL migration runner for NARAD V2
# Usage:
#   ./migrations/migrate.sh              # apply pending migrations
#   ./migrations/migrate.sh --dry-run    # show what would run
#   ./migrations/migrate.sh --status     # show applied/pending status
#   ./migrations/migrate.sh --reset      # DROP+recreate DB, run all (dev only)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# ── Colors ────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
RESET='\033[0m'

# ── Load .env ─────────────────────────────────────────────────────────────────
if [[ -f "$PROJECT_ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$PROJECT_ROOT/.env"
  set +a
fi

# ── Connection config (always direct Postgres, never PgBouncer) ───────────────
DB_HOST="${POSTGRES_HOST:-localhost}"
DB_PORT="${POSTGRES_DIRECT_PORT:-5433}"
DB_NAME="${POSTGRES_DB:-narad_v2}"
DB_USER="${POSTGRES_SUPERUSER:-postgres}"
export PGPASSWORD="${POSTGRES_SUPERUSER_PASSWORD:-}"

PSQL_CONN="-h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME"

# ── SHA256 detection ──────────────────────────────────────────────────────────
if command -v sha256sum > /dev/null 2>&1; then
  sha256_file() { sha256sum "$1" | awk '{print $1}'; }
elif command -v shasum > /dev/null 2>&1; then
  sha256_file() { shasum -a 256 "$1" | awk '{print $1}'; }
else
  echo "ERROR: sha256sum or shasum required"
  exit 1
fi

# ── Parse flags ───────────────────────────────────────────────────────────────
DRY_RUN=false
RESET=false
STATUS=false
for arg in "$@"; do
  case $arg in
    --dry-run) DRY_RUN=true ;;
    --reset)   RESET=true ;;
    --status)  STATUS=true ;;
  esac
done

# ── Reset mode ────────────────────────────────────────────────────────────────
if [[ "$RESET" == "true" ]]; then
  echo -e "${YELLOW}WARNING: --reset will DROP DATABASE $DB_NAME and recreate it.${RESET}"
  read -rp "Type 'yes' to confirm: " CONFIRM
  if [[ "$CONFIRM" != "yes" ]]; then
    echo "Aborted."
    exit 0
  fi
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS $DB_NAME;"
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "CREATE DATABASE $DB_NAME;"
  echo -e "${GREEN}✓ Database reset${RESET}"
fi

# ── Ensure migration tracking table ───────────────────────────────────────────
psql $PSQL_CONN -c "
  CREATE TABLE IF NOT EXISTS public._migrations (
    filename   TEXT        NOT NULL PRIMARY KEY,
    sha256     TEXT        NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );" > /dev/null

# ── Status mode ───────────────────────────────────────────────────────────────
if [[ "$STATUS" == "true" ]]; then
  echo "Migration status:"
  for file in "$SCRIPT_DIR"/*.sql; do
    [[ -f "$file" ]] || continue
    filename=$(basename "$file")
    applied=$(psql $PSQL_CONN -t -c \
      "SELECT to_char(applied_at, 'YYYY-MM-DD HH24:MI') FROM public._migrations WHERE filename = '$filename';" \
      | tr -d ' \n')
    if [[ -n "$applied" ]]; then
      echo -e "  ${GREEN}✓${RESET} $filename  (applied $applied)"
    else
      echo -e "  ${YELLOW}→${RESET} $filename  (pending)"
    fi
  done
  exit 0
fi

# ── Apply migrations ──────────────────────────────────────────────────────────
APPLIED=0
SKIPPED=0

for file in "$SCRIPT_DIR"/*.sql; do
  [[ -f "$file" ]] || continue
  filename=$(basename "$file")
  current_sha=$(sha256_file "$file")

  stored_sha=$(psql $PSQL_CONN -t -c \
    "SELECT sha256 FROM public._migrations WHERE filename = '$filename';" \
    | tr -d ' \n')

  if [[ -n "$stored_sha" ]]; then
    if [[ "$stored_sha" != "$current_sha" ]]; then
      echo -e "${YELLOW}⚠  $filename  sha256 changed since last run — skipping (run --reset to reapply)${RESET}"
    else
      echo -e "   → $filename  (already applied)"
    fi
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  if [[ "$DRY_RUN" == "true" ]]; then
    echo -e "   ${YELLOW}[dry-run]${RESET} $filename"
    continue
  fi

  printf "   Applying %-40s" "$filename..."

  if psql $PSQL_CONN -v ON_ERROR_STOP=1 -f "$file" > /dev/null 2>&1; then
    psql $PSQL_CONN -c \
      "INSERT INTO public._migrations (filename, sha256) VALUES ('$filename', '$current_sha');" \
      > /dev/null
    echo -e "${GREEN}✓${RESET}"
    APPLIED=$((APPLIED + 1))
  else
    echo -e "${RED}✗${RESET}"
    echo ""
    echo -e "${RED}ERROR in $filename:${RESET}"
    psql $PSQL_CONN -v ON_ERROR_STOP=1 -f "$file" || true
    exit 1
  fi
done

# ── Sync role passwords from env vars ─────────────────────────────────────────
if [[ "$DRY_RUN" == "false" ]]; then
  if [[ -n "${POSTGRES_APP_PASSWORD:-}" ]]; then
    psql $PSQL_CONN -c "ALTER ROLE narad_app PASSWORD '${POSTGRES_APP_PASSWORD}';" > /dev/null 2>&1 || true
  fi
  if [[ -n "${POSTGRES_WORKER_PASSWORD:-}" ]]; then
    psql $PSQL_CONN -c "ALTER ROLE narad_worker PASSWORD '${POSTGRES_WORKER_PASSWORD}';" > /dev/null 2>&1 || true
  fi
  [[ -n "${POSTGRES_APP_PASSWORD:-}" || -n "${POSTGRES_WORKER_PASSWORD:-}" ]] && \
    echo -e "   ${GREEN}✓${RESET} Role passwords synced from .env"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}✓ Applied: $APPLIED${RESET}   → Skipped: $SKIPPED"
```

- [ ] **Step 2: Make executable and verify bash syntax**

```bash
chmod +x migrations/migrate.sh
bash -n migrations/migrate.sh && echo "OK: bash syntax valid"
```
Expected: `OK: bash syntax valid`

- [ ] **Step 3: Commit**

```bash
git add migrations/migrate.sh
git commit -m "feat: add migrate.sh shell runner with sha256 idempotency tracking"
```

---

## Task 8: 001_extensions.sql

**Files:**
- Create: `migrations/001_extensions.sql`

- [ ] **Step 1: Write 001_extensions.sql**

```sql
-- 001_extensions.sql
-- Install required PostgreSQL extensions.
-- timescale/timescaledb-ha:pg16-latest includes: timescaledb, postgis, vector, pg_trgm, pg_stat_statements.
-- pg_uuidv7 is not guaranteed; we attempt it and fall back to a PL/pgSQL implementation.

-- Core extensions (all available in timescale/timescaledb-ha:pg16-latest)
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- pg_uuidv7: attempt install; ignore if not available in this image
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_uuidv7;
EXCEPTION WHEN OTHERS THEN
  NULL; -- fallback function below covers this
END $$;

-- uuid_generate_v7(): PL/pgSQL fallback — always created regardless of extension status.
-- Produces RFC 4122 v7 UUIDs: 48-bit Unix ms timestamp + 4-bit version + 74-bit random.
-- Time-ordered for B-tree index locality (avoids fragmentation from random UUIDv4).
CREATE OR REPLACE FUNCTION uuid_generate_v7()
RETURNS uuid
LANGUAGE plpgsql
PARALLEL SAFE
AS $$
DECLARE
  unix_ts_ms bytea;
  uuid_bytes bytea;
BEGIN
  unix_ts_ms := substring(int8send(
    floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint
  ) FROM 3);
  uuid_bytes := unix_ts_ms || gen_random_bytes(10);
  uuid_bytes := set_byte(uuid_bytes, 6,
    (b'01110000'::int | (get_byte(uuid_bytes, 6) & b'00001111'::int)));
  uuid_bytes := set_byte(uuid_bytes, 8,
    (b'10000000'::int | (get_byte(uuid_bytes, 8) & b'00111111'::int)));
  RETURN encode(uuid_bytes, 'hex')::uuid;
END $$;
```

- [ ] **Step 2: Commit**

```bash
git add migrations/001_extensions.sql
git commit -m "feat: add 001_extensions.sql with pg_uuidv7 fallback"
```

---

## Task 9: 002_roles.sql

**Files:**
- Create: `migrations/002_roles.sql`

- [ ] **Step 1: Write 002_roles.sql**

```sql
-- 002_roles.sql
-- Create RBAC role hierarchy for NARAD V2.
-- Roles are cluster-level objects. Guards prevent errors on --reset (DB drop/recreate
-- leaves roles intact at the cluster level).
-- Passwords for login roles are set by migrate.sh after this file runs.

-- ── Non-login group roles ────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE ROLE narad_app_reader NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE ROLE narad_ingest_writer NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE ROLE narad_projection_writer NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Login roles (passwords replaced by migrate.sh from env vars) ─────────────
DO $$ BEGIN
  CREATE ROLE narad_app LOGIN PASSWORD 'placeholder_replaced_by_migrate_sh';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE ROLE narad_worker LOGIN PASSWORD 'placeholder_replaced_by_migrate_sh';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Grant group memberships ───────────────────────────────────────────────────
GRANT narad_app_reader TO narad_app;
GRANT narad_ingest_writer TO narad_worker;
GRANT narad_projection_writer TO narad_worker;
```

- [ ] **Step 2: Commit**

```bash
git add migrations/002_roles.sql
git commit -m "feat: add 002_roles.sql with 5 RBAC roles"
```

---

## Task 10: 003_schemas.sql

**Files:**
- Create: `migrations/003_schemas.sql`

- [ ] **Step 1: Write 003_schemas.sql**

```sql
-- 003_schemas.sql
-- Create all 7 application schemas and the shared updated_at trigger function.

CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS workflow;
CREATE SCHEMA IF NOT EXISTS geo_intelligence;
CREATE SCHEMA IF NOT EXISTS corp_watch;
CREATE SCHEMA IF NOT EXISTS lex_pulse;
CREATE SCHEMA IF NOT EXISTS audit;
CREATE SCHEMA IF NOT EXISTS projections;

-- Shared trigger function for all updated_at columns.
-- Created once here; applied per-table in subsequent migrations.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;
```

- [ ] **Step 2: Commit**

```bash
git add migrations/003_schemas.sql
git commit -m "feat: add 003_schemas.sql with 7 schemas and set_updated_at trigger"
```

---

## Task 11: 004_core_schema.sql

**Files:**
- Create: `migrations/004_core_schema.sql`

This is the largest migration. It creates 12 core tables in FK dependency order. `core.events` and `core.story_capsules` have a circular FK; we resolve this by creating `core.events` first without `story_capsule_id`, then adding it via ALTER after `core.story_capsules` is created.

- [ ] **Step 1: Write 004_core_schema.sql**

```sql
-- 004_core_schema.sql
-- Core schema: 12 tables in FK dependency order.
-- Every table gets: UUID v7 PK, tenant_id, RLS, updated_at trigger (where applicable).
-- RLS uses subselect pattern to evaluate current_setting once per query, not per row.
-- current_setting 2nd arg TRUE = return NULL (not error) when setting is unset.

-- ── 1. core.tenants ──────────────────────────────────────────────────────────
CREATE TABLE core.tenants (
  id         UUID        NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
  name       TEXT        NOT NULL,
  slug       TEXT        NOT NULL UNIQUE,
  config     JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER set_tenants_updated_at
  BEFORE UPDATE ON core.tenants
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
-- No RLS on tenants: it is the root of the tenant hierarchy; app_current_tenant_id
-- is looked up from this table, so RLS here would be a chicken-and-egg problem.

-- ── 2. core.users ────────────────────────────────────────────────────────────
CREATE TABLE core.users (
  id              UUID        NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
  tenant_id       UUID        NOT NULL REFERENCES core.tenants(id) ON DELETE RESTRICT,
  email           TEXT        NOT NULL,
  display_name    TEXT        NOT NULL,
  role            TEXT        NOT NULL CHECK (role IN ('viewer','analyst','senior_analyst','approver','admin','dpo')),
  clearance_level TEXT        NOT NULL DEFAULT 'unclassified' CHECK (clearance_level IN ('unclassified','restricted','confidential','secret')),
  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
  password_hash   TEXT        NOT NULL,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ON core.users (tenant_id, email);
CREATE INDEX ON core.users (tenant_id);

CREATE TRIGGER set_users_updated_at
  BEFORE UPDATE ON core.users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE core.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON core.users
  FOR ALL USING (tenant_id = (SELECT current_setting('app.current_tenant_id', TRUE)::uuid));

-- ── 3. core.sources ──────────────────────────────────────────────────────────
CREATE TABLE core.sources (
  id                     UUID        NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
  tenant_id              UUID        NOT NULL REFERENCES core.tenants(id) ON DELETE RESTRICT,
  name                   TEXT        NOT NULL,
  slug                   TEXT        NOT NULL,
  source_type            TEXT        NOT NULL CHECK (source_type IN ('rss','api','portal','wms','sftp','manual','satellite')),
  trust_tier             SMALLINT    NOT NULL CHECK (trust_tier IN (1,2,3)),
  authority_level        TEXT        NOT NULL,
  license                TEXT,
  update_cadence_seconds INTEGER,
  base_url               TEXT,
  config                 JSONB       NOT NULL DEFAULT '{}',
  governance_approved    BOOLEAN     NOT NULL DEFAULT FALSE,
  is_active              BOOLEAN     NOT NULL DEFAULT TRUE,
  last_successful_fetch  TIMESTAMPTZ,
  last_error             TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ON core.sources (tenant_id, slug);
CREATE INDEX ON core.sources (tenant_id);

CREATE TRIGGER set_sources_updated_at
  BEFORE UPDATE ON core.sources
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE core.sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON core.sources
  FOR ALL USING (tenant_id = (SELECT current_setting('app.current_tenant_id', TRUE)::uuid));

-- ── 4. core.documents ────────────────────────────────────────────────────────
CREATE TABLE core.documents (
  id                  UUID        NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
  tenant_id           UUID        NOT NULL REFERENCES core.tenants(id) ON DELETE RESTRICT,
  source_id           UUID        NOT NULL REFERENCES core.sources(id) ON DELETE RESTRICT,
  external_id         TEXT,
  doc_type            TEXT        NOT NULL CHECK (doc_type IN ('article','bulletin','filing','order','warning','forecast','telemetry','debate','bill','gazette','circular','press_release','report','media')),
  title               TEXT,
  body_text           TEXT,
  original_language   TEXT,
  translated_text     TEXT,
  translated_language TEXT        DEFAULT 'en',
  content_hash        TEXT        NOT NULL,
  fuzzy_hash          TEXT,
  fetch_url           TEXT,
  s3_key              TEXT,
  published_at        TIMESTAMPTZ,
  fetched_at          TIMESTAMPTZ NOT NULL,
  embedding           vector(768),
  tsv                 TSVECTOR,
  metadata            JSONB       NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ON core.documents (tenant_id, source_id, content_hash);
CREATE INDEX ON core.documents (tenant_id, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX ON core.documents (tenant_id);
CREATE INDEX ON core.documents (source_id);
CREATE INDEX ON core.documents USING GIN (tsv);
CREATE INDEX ON core.documents USING hnsw (embedding vector_cosine_ops) WHERE embedding IS NOT NULL;

CREATE OR REPLACE FUNCTION update_documents_tsv()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.tsv := to_tsvector('english',
    COALESCE(NEW.title, '') || ' ' ||
    COALESCE(NEW.body_text, '') || ' ' ||
    COALESCE(NEW.translated_text, ''));
  RETURN NEW;
END $$;

CREATE TRIGGER update_documents_tsv_trigger
  BEFORE INSERT OR UPDATE ON core.documents
  FOR EACH ROW EXECUTE FUNCTION update_documents_tsv();

CREATE TRIGGER set_documents_updated_at
  BEFORE UPDATE ON core.documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE core.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON core.documents
  FOR ALL USING (tenant_id = (SELECT current_setting('app.current_tenant_id', TRUE)::uuid));

-- ── 5. core.entities ─────────────────────────────────────────────────────────
CREATE TABLE core.entities (
  id             UUID        NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
  tenant_id      UUID        NOT NULL REFERENCES core.tenants(id) ON DELETE RESTRICT,
  entity_type    TEXT        NOT NULL CHECK (entity_type IN ('company','person','ministry','regulator','district','state','port','airport','railway_station','nuclear_facility','vessel','aircraft','parcel','project','organization','military_installation')),
  canonical_name TEXT        NOT NULL,
  aliases        TEXT[]      NOT NULL DEFAULT '{}',
  description    TEXT,
  geometry       GEOMETRY(Point, 4326),
  state_code     TEXT,
  district_code  TEXT,
  country_code   TEXT        DEFAULT 'IN',
  external_ids   JSONB       NOT NULL DEFAULT '{}',
  risk_score     NUMERIC(5,2),
  risk_inputs    JSONB       NOT NULL DEFAULT '{}',
  health_score   NUMERIC(5,2),
  health_inputs  JSONB       NOT NULL DEFAULT '{}',
  is_resolved    BOOLEAN     NOT NULL DEFAULT FALSE,
  resolved_at    TIMESTAMPTZ,
  resolved_from  UUID[]      NOT NULL DEFAULT '{}',
  embedding      vector(768),
  tsv            TSVECTOR,
  metadata       JSONB       NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON core.entities USING GIN (aliases);
CREATE INDEX ON core.entities USING GIN (external_ids jsonb_path_ops);
CREATE INDEX ON core.entities USING GIST (geometry);
CREATE INDEX ON core.entities USING GIN (tsv);
CREATE INDEX ON core.entities USING hnsw (embedding vector_cosine_ops) WHERE embedding IS NOT NULL;
CREATE INDEX ON core.entities (tenant_id, entity_type);
CREATE INDEX ON core.entities (tenant_id);

CREATE OR REPLACE FUNCTION update_entities_tsv()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.tsv := to_tsvector('english',
    COALESCE(NEW.canonical_name, '') || ' ' ||
    COALESCE(array_to_string(NEW.aliases, ' '), '') || ' ' ||
    COALESCE(NEW.description, ''));
  RETURN NEW;
END $$;

CREATE TRIGGER update_entities_tsv_trigger
  BEFORE INSERT OR UPDATE ON core.entities
  FOR EACH ROW EXECUTE FUNCTION update_entities_tsv();

CREATE TRIGGER set_entities_updated_at
  BEFORE UPDATE ON core.entities
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE core.entities ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON core.entities
  FOR ALL USING (tenant_id = (SELECT current_setting('app.current_tenant_id', TRUE)::uuid));

-- ── 6. core.events (initial — without story_capsule_id) ──────────────────────
-- story_capsule_id is added via ALTER after core.story_capsules is created below.
CREATE TABLE core.events (
  id                UUID         NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
  tenant_id         UUID         NOT NULL REFERENCES core.tenants(id) ON DELETE RESTRICT,
  event_type        TEXT         NOT NULL CHECK (event_type IN ('conflict','protest','disaster','weather','regulatory','corporate','legislative','infrastructure','security','environment','transport','economic','health','political','judicial','fire','maritime','aviation')),
  event_subtype     TEXT,
  title             TEXT         NOT NULL,
  summary           TEXT,
  severity          TEXT         NOT NULL DEFAULT 'medium' CHECK (severity IN ('critical','high','medium','low','informational')),
  confidence        NUMERIC(3,2) NOT NULL DEFAULT 0.50 CHECK (confidence BETWEEN 0.00 AND 1.00),
  status            TEXT         NOT NULL DEFAULT 'ingested' CHECK (status IN ('ingested','canonicalized','enriched','in_investigation','resolved','invalidated')),
  geometry          GEOMETRY(Point, 4326),
  geometry_area     GEOMETRY(Polygon, 4326),
  state_code        TEXT,
  district_code     TEXT,
  occurred_at       TIMESTAMPTZ,
  reported_at       TIMESTAMPTZ,
  cluster_id        UUID,
  source_count      INTEGER      NOT NULL DEFAULT 1,
  primary_source_id UUID         REFERENCES core.sources(id) ON DELETE SET NULL,
  embedding         vector(768),
  tsv               TSVECTOR,
  metadata          JSONB        NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX ON core.events (tenant_id, status, severity);
CREATE INDEX ON core.events (tenant_id, occurred_at DESC);
CREATE INDEX ON core.events (tenant_id, event_type);
CREATE INDEX ON core.events USING GIST (geometry);
CREATE INDEX ON core.events USING GIST (geometry_area) WHERE geometry_area IS NOT NULL;
CREATE INDEX ON core.events USING GIN (tsv);
CREATE INDEX ON core.events USING hnsw (embedding vector_cosine_ops) WHERE embedding IS NOT NULL;
CREATE INDEX ON core.events (cluster_id) WHERE cluster_id IS NOT NULL;
CREATE INDEX ON core.events (tenant_id);
CREATE INDEX ON core.events (primary_source_id) WHERE primary_source_id IS NOT NULL;

CREATE OR REPLACE FUNCTION update_events_tsv()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.tsv := to_tsvector('english',
    COALESCE(NEW.title, '') || ' ' || COALESCE(NEW.summary, ''));
  RETURN NEW;
END $$;

CREATE TRIGGER update_events_tsv_trigger
  BEFORE INSERT OR UPDATE ON core.events
  FOR EACH ROW EXECUTE FUNCTION update_events_tsv();

CREATE TRIGGER set_events_updated_at
  BEFORE UPDATE ON core.events
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE core.events ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON core.events
  FOR ALL USING (tenant_id = (SELECT current_setting('app.current_tenant_id', TRUE)::uuid));

-- ── 7. core.story_capsules ────────────────────────────────────────────────────
CREATE TABLE core.story_capsules (
  id               UUID         NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
  tenant_id        UUID         NOT NULL REFERENCES core.tenants(id) ON DELETE RESTRICT,
  event_id         UUID         NOT NULL REFERENCES core.events(id) ON DELETE CASCADE,
  headline         TEXT         NOT NULL,
  explanation      TEXT         NOT NULL,
  key_facts        JSONB        NOT NULL DEFAULT '[]',
  evidence_bundle  JSONB        NOT NULL,
  ai_model         TEXT         NOT NULL,
  ai_model_version TEXT,
  prompt_hash      TEXT         NOT NULL,
  confidence       NUMERIC(3,2) NOT NULL,
  generated_at     TIMESTAMPTZ  NOT NULL,
  expires_at       TIMESTAMPTZ,
  superseded_by    UUID         REFERENCES core.story_capsules(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX ON core.story_capsules (tenant_id, event_id);
CREATE INDEX ON core.story_capsules (tenant_id);
CREATE INDEX ON core.story_capsules (event_id);

ALTER TABLE core.story_capsules ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON core.story_capsules
  FOR ALL USING (tenant_id = (SELECT current_setting('app.current_tenant_id', TRUE)::uuid));

-- ── 8. Resolve circular FK: add story_capsule_id to core.events ──────────────
ALTER TABLE core.events
  ADD COLUMN story_capsule_id UUID REFERENCES core.story_capsules(id) ON DELETE SET NULL;
CREATE INDEX ON core.events (story_capsule_id) WHERE story_capsule_id IS NOT NULL;

-- ── 9. core.claims ────────────────────────────────────────────────────────────
CREATE TABLE core.claims (
  id                       UUID         NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
  tenant_id                UUID         NOT NULL REFERENCES core.tenants(id) ON DELETE RESTRICT,
  document_id              UUID         NOT NULL REFERENCES core.documents(id) ON DELETE CASCADE,
  event_id                 UUID         REFERENCES core.events(id) ON DELETE SET NULL,
  entity_id                UUID         REFERENCES core.entities(id) ON DELETE SET NULL,
  claim_text               TEXT         NOT NULL,
  claim_type               TEXT         NOT NULL CHECK (claim_type IN ('factual','opinion','prediction','regulatory','financial','spatial','temporal','causal')),
  confidence               NUMERIC(3,2) NOT NULL DEFAULT 0.50,
  is_verified              BOOLEAN      NOT NULL DEFAULT FALSE,
  verified_by              UUID         REFERENCES core.users(id) ON DELETE SET NULL,
  verified_at              TIMESTAMPTZ,
  lineage_hash             TEXT         NOT NULL,
  extraction_model         TEXT,
  extraction_model_version TEXT,
  embedding                vector(768),
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX ON core.claims (tenant_id, document_id);
CREATE INDEX ON core.claims (tenant_id, event_id) WHERE event_id IS NOT NULL;
CREATE INDEX ON core.claims (tenant_id, entity_id) WHERE entity_id IS NOT NULL;
CREATE INDEX ON core.claims (tenant_id);
CREATE INDEX ON core.claims (document_id);
CREATE INDEX ON core.claims USING hnsw (embedding vector_cosine_ops) WHERE embedding IS NOT NULL;

ALTER TABLE core.claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON core.claims
  FOR ALL USING (tenant_id = (SELECT current_setting('app.current_tenant_id', TRUE)::uuid));

-- ── 10. core.relationships ────────────────────────────────────────────────────
CREATE TABLE core.relationships (
  id                UUID         NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
  tenant_id         UUID         NOT NULL REFERENCES core.tenants(id) ON DELETE RESTRICT,
  source_entity_id  UUID         NOT NULL REFERENCES core.entities(id) ON DELETE CASCADE,
  target_entity_id  UUID         NOT NULL REFERENCES core.entities(id) ON DELETE CASCADE,
  relationship_type TEXT         NOT NULL CHECK (relationship_type IN ('ownership','directorship','subsidiary','parent','partner','supplier','customer','regulator','regulated_by','located_in','operates_at','successor','predecessor','affiliated','joint_venture','legal_action')),
  confidence        NUMERIC(3,2) NOT NULL DEFAULT 0.50,
  valid_from        TIMESTAMPTZ,
  valid_until       TIMESTAMPTZ,
  lineage_hash      TEXT         NOT NULL,
  source_document_id UUID        REFERENCES core.documents(id) ON DELETE SET NULL,
  metadata          JSONB        NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT no_self_relationship CHECK (source_entity_id != target_entity_id)
);

CREATE INDEX ON core.relationships (tenant_id, source_entity_id);
CREATE INDEX ON core.relationships (tenant_id, target_entity_id);
CREATE INDEX ON core.relationships (tenant_id, relationship_type);
CREATE INDEX ON core.relationships (tenant_id);
CREATE INDEX ON core.relationships (source_entity_id);
CREATE INDEX ON core.relationships (target_entity_id);

CREATE TRIGGER set_relationships_updated_at
  BEFORE UPDATE ON core.relationships
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE core.relationships ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON core.relationships
  FOR ALL USING (tenant_id = (SELECT current_setting('app.current_tenant_id', TRUE)::uuid));

-- ── 11. core.event_entity_links ───────────────────────────────────────────────
CREATE TABLE core.event_entity_links (
  id          UUID         NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
  tenant_id   UUID         NOT NULL REFERENCES core.tenants(id) ON DELETE RESTRICT,
  event_id    UUID         NOT NULL REFERENCES core.events(id) ON DELETE CASCADE,
  entity_id   UUID         NOT NULL REFERENCES core.entities(id) ON DELETE CASCADE,
  role        TEXT         NOT NULL CHECK (role IN ('actor','target','location','regulator','reporter','affected','mentioned','owner','operator')),
  confidence  NUMERIC(3,2) NOT NULL DEFAULT 0.50,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ON core.event_entity_links (tenant_id, event_id, entity_id, role);
CREATE INDEX ON core.event_entity_links (tenant_id);
CREATE INDEX ON core.event_entity_links (event_id);
CREATE INDEX ON core.event_entity_links (entity_id);

ALTER TABLE core.event_entity_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON core.event_entity_links
  FOR ALL USING (tenant_id = (SELECT current_setting('app.current_tenant_id', TRUE)::uuid));

-- ── 12. core.event_document_links ────────────────────────────────────────────
CREATE TABLE core.event_document_links (
  id          UUID        NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
  tenant_id   UUID        NOT NULL REFERENCES core.tenants(id) ON DELETE RESTRICT,
  event_id    UUID        NOT NULL REFERENCES core.events(id) ON DELETE CASCADE,
  document_id UUID        NOT NULL REFERENCES core.documents(id) ON DELETE RESTRICT,
  link_type   TEXT        NOT NULL CHECK (link_type IN ('primary_source','corroboration','context','contradiction','update')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ON core.event_document_links (tenant_id, event_id, document_id, link_type);
CREATE INDEX ON core.event_document_links (tenant_id);
CREATE INDEX ON core.event_document_links (event_id);
CREATE INDEX ON core.event_document_links (document_id);

ALTER TABLE core.event_document_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON core.event_document_links
  FOR ALL USING (tenant_id = (SELECT current_setting('app.current_tenant_id', TRUE)::uuid));

-- ── 13. core.impacts ─────────────────────────────────────────────────────────
CREATE TABLE core.impacts (
  id                 UUID         NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
  tenant_id          UUID         NOT NULL REFERENCES core.tenants(id) ON DELETE RESTRICT,
  event_id           UUID         NOT NULL REFERENCES core.events(id) ON DELETE CASCADE,
  impact_type        TEXT         NOT NULL CHECK (impact_type IN ('human','economic','legal','infrastructure','environmental','political','social','reputational')),
  severity           TEXT         NOT NULL CHECK (severity IN ('critical','high','medium','low')),
  description        TEXT,
  quantitative_value NUMERIC,
  quantitative_unit  TEXT,
  confidence         NUMERIC(3,2) NOT NULL DEFAULT 0.50,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX ON core.impacts (tenant_id, event_id);
CREATE INDEX ON core.impacts (tenant_id);
CREATE INDEX ON core.impacts (event_id);

ALTER TABLE core.impacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON core.impacts
  FOR ALL USING (tenant_id = (SELECT current_setting('app.current_tenant_id', TRUE)::uuid));
```

- [ ] **Step 2: Commit**

```bash
git add migrations/004_core_schema.sql
git commit -m "feat: add 004_core_schema.sql with 12 core tables, RLS, indexes, triggers"
```

---

## Task 12: 005_workflow_schema.sql

**Files:**
- Create: `migrations/005_workflow_schema.sql`

- [ ] **Step 1: Write 005_workflow_schema.sql**

```sql
-- 005_workflow_schema.sql
-- Workflow schema: 11 tables for analyst operations.
-- workflow.evidence_custody_log is INSERT-only (trigger + REVOKE).

-- ── 1. workflow.watchlists ────────────────────────────────────────────────────
CREATE TABLE workflow.watchlists (
  id          UUID        NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
  tenant_id   UUID        NOT NULL REFERENCES core.tenants(id) ON DELETE RESTRICT,
  owner_id    UUID        NOT NULL REFERENCES core.users(id) ON DELETE RESTRICT,
  name        TEXT        NOT NULL,
  description TEXT,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON workflow.watchlists (tenant_id);
CREATE INDEX ON workflow.watchlists (owner_id);

CREATE TRIGGER set_watchlists_updated_at
  BEFORE UPDATE ON workflow.watchlists
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE workflow.watchlists ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON workflow.watchlists
  FOR ALL USING (tenant_id = (SELECT current_setting('app.current_tenant_id', TRUE)::uuid));

-- ── 2. workflow.watchlist_items ───────────────────────────────────────────────
CREATE TABLE workflow.watchlist_items (
  id           UUID        NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
  watchlist_id UUID        NOT NULL REFERENCES workflow.watchlists(id) ON DELETE CASCADE,
  target_type  TEXT        NOT NULL CHECK (target_type IN ('entity','event','geography','regulatory_subject','asset','company','ministry','district')),
  target_id    UUID        NOT NULL,
  added_by     UUID        NOT NULL REFERENCES core.users(id) ON DELETE RESTRICT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ON workflow.watchlist_items (watchlist_id, target_type, target_id);
CREATE INDEX ON workflow.watchlist_items (watchlist_id);

-- ── 3. workflow.watchlist_rules ───────────────────────────────────────────────
CREATE TABLE workflow.watchlist_rules (
  id                UUID        NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
  watchlist_id      UUID        NOT NULL REFERENCES workflow.watchlists(id) ON DELETE CASCADE,
  rule_name         TEXT        NOT NULL,
  condition         JSONB       NOT NULL,
  severity_override TEXT        CHECK (severity_override IN ('critical','high','medium','low')),
  is_active         BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON workflow.watchlist_rules (watchlist_id);

CREATE TRIGGER set_watchlist_rules_updated_at
  BEFORE UPDATE ON workflow.watchlist_rules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 4. workflow.watchlist_alerts ──────────────────────────────────────────────
CREATE TABLE workflow.watchlist_alerts (
  id                     UUID        NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
  tenant_id              UUID        NOT NULL REFERENCES core.tenants(id) ON DELETE RESTRICT,
  watchlist_id           UUID        NOT NULL REFERENCES workflow.watchlists(id) ON DELETE CASCADE,
  rule_id                UUID        REFERENCES workflow.watchlist_rules(id) ON DELETE SET NULL,
  triggered_by_event_id  UUID        REFERENCES core.events(id) ON DELETE SET NULL,
  triggered_by_entity_id UUID        REFERENCES core.entities(id) ON DELETE SET NULL,
  severity               TEXT        NOT NULL CHECK (severity IN ('critical','high','medium','low')),
  status                 TEXT        NOT NULL DEFAULT 'new' CHECK (status IN ('new','triaged','assigned','acknowledged','in_progress','resolved','suppressed')),
  title                  TEXT        NOT NULL,
  summary                TEXT,
  assigned_to            UUID        REFERENCES core.users(id) ON DELETE SET NULL,
  episode_id             UUID,
  triaged_at             TIMESTAMPTZ,
  resolved_at            TIMESTAMPTZ,
  metadata               JSONB       NOT NULL DEFAULT '{}',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON workflow.watchlist_alerts (tenant_id, status, severity);
CREATE INDEX ON workflow.watchlist_alerts (tenant_id);
CREATE INDEX ON workflow.watchlist_alerts (watchlist_id);
CREATE INDEX ON workflow.watchlist_alerts (triggered_by_event_id) WHERE triggered_by_event_id IS NOT NULL;
CREATE INDEX ON workflow.watchlist_alerts (triggered_by_entity_id) WHERE triggered_by_entity_id IS NOT NULL;

CREATE TRIGGER set_watchlist_alerts_updated_at
  BEFORE UPDATE ON workflow.watchlist_alerts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE workflow.watchlist_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON workflow.watchlist_alerts
  FOR ALL USING (tenant_id = (SELECT current_setting('app.current_tenant_id', TRUE)::uuid));

-- ── 5. workflow.investigations ────────────────────────────────────────────────
CREATE TABLE workflow.investigations (
  id             UUID         NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
  tenant_id      UUID         NOT NULL REFERENCES core.tenants(id) ON DELETE RESTRICT,
  owner_id       UUID         NOT NULL REFERENCES core.users(id) ON DELETE RESTRICT,
  title          TEXT         NOT NULL,
  description    TEXT,
  status         TEXT         NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','under_review','active','on_hold','closed','archived')),
  classification TEXT         NOT NULL DEFAULT 'unclassified' CHECK (classification IN ('unclassified','restricted','confidential','secret')),
  confidence     NUMERIC(3,2),
  hypothesis     TEXT,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX ON workflow.investigations (tenant_id, status);
CREATE INDEX ON workflow.investigations (tenant_id);
CREATE INDEX ON workflow.investigations (owner_id);

CREATE TRIGGER set_investigations_updated_at
  BEFORE UPDATE ON workflow.investigations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE workflow.investigations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON workflow.investigations
  FOR ALL USING (tenant_id = (SELECT current_setting('app.current_tenant_id', TRUE)::uuid));

-- ── 6. workflow.investigation_items ──────────────────────────────────────────
CREATE TABLE workflow.investigation_items (
  id               UUID        NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
  investigation_id UUID        NOT NULL REFERENCES workflow.investigations(id) ON DELETE CASCADE,
  item_type        TEXT        NOT NULL CHECK (item_type IN ('event','entity','document','claim')),
  item_id          UUID        NOT NULL,
  role             TEXT        NOT NULL DEFAULT 'evidence' CHECK (role IN ('key_evidence','supporting','context','lead','exculpatory','disputed')),
  added_by         UUID        NOT NULL REFERENCES core.users(id) ON DELETE RESTRICT,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON workflow.investigation_items (investigation_id);
CREATE INDEX ON workflow.investigation_items (item_type, item_id);

-- ── 7. workflow.investigation_evidence ───────────────────────────────────────
CREATE TABLE workflow.investigation_evidence (
  id               UUID        NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
  investigation_id UUID        NOT NULL REFERENCES workflow.investigations(id) ON DELETE CASCADE,
  document_id      UUID        NOT NULL REFERENCES core.documents(id) ON DELETE RESTRICT,
  evidence_hash    TEXT        NOT NULL,
  s3_key_worm      TEXT        NOT NULL,
  is_verified      BOOLEAN     NOT NULL DEFAULT FALSE,
  verified_by      UUID        REFERENCES core.users(id) ON DELETE SET NULL,
  verified_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON workflow.investigation_evidence (investigation_id);
CREATE INDEX ON workflow.investigation_evidence (document_id);

-- ── 8. workflow.evidence_custody_log (INSERT-only) ───────────────────────────
CREATE TABLE workflow.evidence_custody_log (
  id                      UUID        NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
  evidence_id             UUID        NOT NULL REFERENCES workflow.investigation_evidence(id) ON DELETE RESTRICT,
  user_id                 UUID        NOT NULL REFERENCES core.users(id) ON DELETE RESTRICT,
  action                  TEXT        NOT NULL CHECK (action IN ('ingested','viewed','exported','verified','challenged','transferred')),
  evidence_hash_at_action TEXT        NOT NULL,
  ip_address              INET,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON workflow.evidence_custody_log (evidence_id);

-- INSERT-only enforcement: trigger as second layer of defence
CREATE OR REPLACE FUNCTION prevent_custody_log_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'workflow.evidence_custody_log is INSERT-only: % is not permitted', TG_OP;
END $$;

CREATE TRIGGER prevent_custody_log_update
  BEFORE UPDATE OR DELETE ON workflow.evidence_custody_log
  FOR EACH ROW EXECUTE FUNCTION prevent_custody_log_mutation();

REVOKE UPDATE, DELETE ON TABLE workflow.evidence_custody_log FROM PUBLIC;

-- ── 9. workflow.investigation_notes ──────────────────────────────────────────
CREATE TABLE workflow.investigation_notes (
  id                  UUID        NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
  investigation_id    UUID        NOT NULL REFERENCES workflow.investigations(id) ON DELETE CASCADE,
  author_id           UUID        NOT NULL REFERENCES core.users(id) ON DELETE RESTRICT,
  note_type           TEXT        NOT NULL DEFAULT 'note' CHECK (note_type IN ('note','hypothesis','task','decision')),
  body                TEXT        NOT NULL,
  is_ai_generated     BOOLEAN     NOT NULL DEFAULT FALSE,
  verification_status TEXT        DEFAULT 'unverified' CHECK (verification_status IN ('unverified','pending_review','accepted','rejected')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON workflow.investigation_notes (investigation_id);

CREATE TRIGGER set_investigation_notes_updated_at
  BEFORE UPDATE ON workflow.investigation_notes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 10. workflow.briefings ────────────────────────────────────────────────────
CREATE TABLE workflow.briefings (
  id              UUID        NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
  tenant_id       UUID        NOT NULL REFERENCES core.tenants(id) ON DELETE RESTRICT,
  owner_id        UUID        NOT NULL REFERENCES core.users(id) ON DELETE RESTRICT,
  title           TEXT        NOT NULL,
  audience        TEXT,
  status          TEXT        NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','under_review','approved','published','superseded','withdrawn')),
  current_version INTEGER     NOT NULL DEFAULT 1,
  supersedes_id   UUID        REFERENCES workflow.briefings(id) ON DELETE SET NULL,
  approved_by     UUID        REFERENCES core.users(id) ON DELETE SET NULL,
  approved_at     TIMESTAMPTZ,
  published_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON workflow.briefings (tenant_id, status);
CREATE INDEX ON workflow.briefings (tenant_id);
CREATE INDEX ON workflow.briefings (owner_id);

CREATE TRIGGER set_briefings_updated_at
  BEFORE UPDATE ON workflow.briefings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE workflow.briefings ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON workflow.briefings
  FOR ALL USING (tenant_id = (SELECT current_setting('app.current_tenant_id', TRUE)::uuid));

-- ── 11. workflow.briefing_versions ───────────────────────────────────────────
CREATE TABLE workflow.briefing_versions (
  id                       UUID        NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
  briefing_id              UUID        NOT NULL REFERENCES workflow.briefings(id) ON DELETE CASCADE,
  version_number           INTEGER     NOT NULL,
  sections                 JSONB       NOT NULL,
  source_investigation_ids UUID[]      NOT NULL DEFAULT '{}',
  source_event_ids         UUID[]      NOT NULL DEFAULT '{}',
  source_watchlist_ids     UUID[]      NOT NULL DEFAULT '{}',
  ai_draft_model           TEXT,
  edited_by                UUID        NOT NULL REFERENCES core.users(id) ON DELETE RESTRICT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ON workflow.briefing_versions (briefing_id, version_number);
CREATE INDEX ON workflow.briefing_versions (briefing_id);
```

- [ ] **Step 2: Commit**

```bash
git add migrations/005_workflow_schema.sql
git commit -m "feat: add 005_workflow_schema.sql with 11 workflow tables"
```

---

## Task 13: 006_domain_schemas.sql

**Files:**
- Create: `migrations/006_domain_schemas.sql`

- [ ] **Step 1: Write 006_domain_schemas.sql**

```sql
-- 006_domain_schemas.sql
-- Domain-specific schemas: corp_watch, lex_pulse, geo_intelligence.
-- 4 tables.

-- ── 1. corp_watch.entity_profiles ────────────────────────────────────────────
CREATE TABLE corp_watch.entity_profiles (
  id                      UUID         NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
  entity_id               UUID         NOT NULL REFERENCES core.entities(id) ON DELETE CASCADE UNIQUE,
  incorporation_date      DATE,
  registered_office       TEXT,
  authorized_capital_inr  NUMERIC,
  paid_up_capital_inr     NUMERIC,
  company_status          TEXT,
  company_class           TEXT,
  listing_status          TEXT,
  sector                  TEXT,
  filing_completeness     NUMERIC(3,2),
  last_filing_date        DATE,
  directors               JSONB        NOT NULL DEFAULT '[]',
  shareholders            JSONB        NOT NULL DEFAULT '[]',
  compliance_breach_count INTEGER      NOT NULL DEFAULT 0,
  created_at              TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX ON corp_watch.entity_profiles (entity_id);

CREATE TRIGGER set_entity_profiles_updated_at
  BEFORE UPDATE ON corp_watch.entity_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 2. lex_pulse.regulatory_events ───────────────────────────────────────────
CREATE TABLE lex_pulse.regulatory_events (
  id               UUID        NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
  event_id         UUID        NOT NULL REFERENCES core.events(id) ON DELETE CASCADE UNIQUE,
  ministry         TEXT,
  regulator        TEXT,
  gazette_ref      TEXT,
  act_ref          TEXT,
  amendment_type   TEXT        CHECK (amendment_type IN ('new_act','amendment','repeal','notification','circular','order','rule','guideline')),
  effective_date   DATE,
  what_changed     TEXT,
  why_it_matters   TEXT,
  affected_sectors TEXT[]      NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON lex_pulse.regulatory_events (event_id);

CREATE TRIGGER set_regulatory_events_updated_at
  BEFORE UPDATE ON lex_pulse.regulatory_events
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 3. lex_pulse.semantic_cache ──────────────────────────────────────────────
CREATE TABLE lex_pulse.semantic_cache (
  id              UUID        NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
  tenant_id       UUID        NOT NULL REFERENCES core.tenants(id) ON DELETE CASCADE,
  query_text      TEXT        NOT NULL,
  query_embedding vector(768) NOT NULL,
  answer_text     TEXT        NOT NULL,
  citations       JSONB       NOT NULL,
  model_used      TEXT        NOT NULL,
  hit_count       INTEGER     NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL
);

CREATE INDEX ON lex_pulse.semantic_cache USING hnsw (query_embedding vector_cosine_ops);
CREATE INDEX ON lex_pulse.semantic_cache (tenant_id, expires_at);
CREATE INDEX ON lex_pulse.semantic_cache (tenant_id);

-- ── 4. geo_intelligence.layer_configs ────────────────────────────────────────
CREATE TABLE geo_intelligence.layer_configs (
  id                       UUID        NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
  tenant_id                UUID        NOT NULL REFERENCES core.tenants(id) ON DELETE RESTRICT,
  name                     TEXT        NOT NULL,
  slug                     TEXT        NOT NULL,
  layer_type               TEXT        NOT NULL CHECK (layer_type IN ('point','polygon','heatmap','movement','cluster','choropleth','tile_overlay')),
  presets                  TEXT[]      NOT NULL,
  data_query               TEXT,
  tile_url_template        TEXT,
  style_config             JSONB       NOT NULL DEFAULT '{}',
  min_zoom                 SMALLINT    DEFAULT 0,
  max_zoom                 SMALLINT    DEFAULT 18,
  refresh_interval_seconds INTEGER,
  is_active                BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ON geo_intelligence.layer_configs (tenant_id, slug);
CREATE INDEX ON geo_intelligence.layer_configs (tenant_id);

CREATE TRIGGER set_layer_configs_updated_at
  BEFORE UPDATE ON geo_intelligence.layer_configs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE geo_intelligence.layer_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON geo_intelligence.layer_configs
  FOR ALL USING (tenant_id = (SELECT current_setting('app.current_tenant_id', TRUE)::uuid));
```

- [ ] **Step 2: Commit**

```bash
git add migrations/006_domain_schemas.sql
git commit -m "feat: add 006_domain_schemas.sql with corp_watch, lex_pulse, geo_intelligence tables"
```

---

## Task 14: 007_audit_schema.sql

**Files:**
- Create: `migrations/007_audit_schema.sql`

- [ ] **Step 1: Write 007_audit_schema.sql**

```sql
-- 007_audit_schema.sql
-- Immutable audit trail: 2 tables.
-- audit.audit_log: monthly range-partitioned, INSERT-only.
-- audit.state_transitions: INSERT-only.
-- INSERT-only enforcement: REVOKE UPDATE/DELETE + BEFORE trigger (two layers).

-- ── 1. audit.audit_log ────────────────────────────────────────────────────────
CREATE TABLE audit.audit_log (
  id          UUID        NOT NULL DEFAULT uuid_generate_v7(),
  tenant_id   UUID        NOT NULL,
  user_id     UUID        NOT NULL,
  action      TEXT        NOT NULL,
  object_type TEXT        NOT NULL,
  object_id   UUID        NOT NULL,
  delta       JSONB,
  ip_address  INET,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
) PARTITION BY RANGE (created_at);

-- BRIN index: 10-100x smaller than B-tree; ideal for append-only time-series.
CREATE INDEX ON audit.audit_log USING BRIN (created_at);
CREATE INDEX ON audit.audit_log (tenant_id, created_at);

-- Pre-create current month (2026-03) + 2 future months.
-- A cron job (Phase 2B) creates the next partition on the 20th of each month.
CREATE TABLE audit.audit_log_2026_03
  PARTITION OF audit.audit_log
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

CREATE TABLE audit.audit_log_2026_04
  PARTITION OF audit.audit_log
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

CREATE TABLE audit.audit_log_2026_05
  PARTITION OF audit.audit_log
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

-- INSERT-only enforcement layer 1: REVOKE
REVOKE UPDATE, DELETE ON TABLE audit.audit_log FROM PUBLIC;

-- INSERT-only enforcement layer 2: trigger
CREATE OR REPLACE FUNCTION prevent_audit_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% on %.% is not permitted: this table is INSERT-only', TG_OP, TG_TABLE_SCHEMA, TG_TABLE_NAME;
END $$;

CREATE TRIGGER prevent_audit_log_mutation
  BEFORE UPDATE OR DELETE ON audit.audit_log
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();

-- ── 2. audit.state_transitions ────────────────────────────────────────────────
CREATE TABLE audit.state_transitions (
  id              UUID        NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
  tenant_id       UUID        NOT NULL,
  object_type     TEXT        NOT NULL,
  object_id       UUID        NOT NULL,
  from_state      TEXT,
  to_state        TEXT        NOT NULL,
  transitioned_by UUID        NOT NULL,
  reason          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON audit.state_transitions (tenant_id, object_type, object_id);
CREATE INDEX ON audit.state_transitions USING BRIN (created_at);

REVOKE UPDATE, DELETE ON TABLE audit.state_transitions FROM PUBLIC;

CREATE TRIGGER prevent_state_transitions_mutation
  BEFORE UPDATE OR DELETE ON audit.state_transitions
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
```

- [ ] **Step 2: Commit**

```bash
git add migrations/007_audit_schema.sql
git commit -m "feat: add 007_audit_schema.sql with partitioned INSERT-only audit tables"
```

---

## Task 15: 008_projections_schema.sql

**Files:**
- Create: `migrations/008_projections_schema.sql`

- [ ] **Step 1: Write 008_projections_schema.sql**

```sql
-- 008_projections_schema.sql
-- CQRS read-model projection tables: 4 tables.
-- No RLS — tenant isolation enforced by JSONB content and application-layer filtering.
-- All rows are idempotent upserts; stale projections are always overwritable.

-- ── 1. projections.pulseboard_feed ────────────────────────────────────────────
CREATE TABLE projections.pulseboard_feed (
  event_id      UUID        NOT NULL REFERENCES core.events(id) ON DELETE CASCADE PRIMARY KEY,
  tenant_id     UUID        NOT NULL,
  card          JSONB       NOT NULL,
  severity_rank SMALLINT    NOT NULL,
  occurred_at   TIMESTAMPTZ NOT NULL,
  projected_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Primary sort for PulseBoard feed: most severe + most recent first
CREATE INDEX ON projections.pulseboard_feed (tenant_id, severity_rank, occurred_at DESC);
CREATE INDEX ON projections.pulseboard_feed (tenant_id);

-- ── 2. projections.watchlist_deltas ──────────────────────────────────────────
CREATE TABLE projections.watchlist_deltas (
  id             UUID        NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
  tenant_id      UUID        NOT NULL,
  watchlist_id   UUID        NOT NULL REFERENCES workflow.watchlists(id) ON DELETE CASCADE,
  delta_type     TEXT        NOT NULL,
  summary        TEXT        NOT NULL,
  reference_id   UUID        NOT NULL,
  reference_type TEXT        NOT NULL,
  computed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON projections.watchlist_deltas (tenant_id, watchlist_id, computed_at DESC);
CREATE INDEX ON projections.watchlist_deltas (tenant_id);
CREATE INDEX ON projections.watchlist_deltas (watchlist_id);

-- ── 3. projections.entity_summaries ──────────────────────────────────────────
CREATE TABLE projections.entity_summaries (
  entity_id    UUID        NOT NULL REFERENCES core.entities(id) ON DELETE CASCADE PRIMARY KEY,
  tenant_id    UUID        NOT NULL,
  summary      JSONB       NOT NULL,
  projected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON projections.entity_summaries (tenant_id);

-- ── 4. projections.regulatory_digest ─────────────────────────────────────────
-- No FK on event_id: regulatory events may reference archived core events.
CREATE TABLE projections.regulatory_digest (
  event_id       UUID        NOT NULL PRIMARY KEY,
  tenant_id      UUID        NOT NULL,
  digest         JSONB       NOT NULL,
  effective_date DATE,
  projected_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON projections.regulatory_digest (tenant_id, effective_date DESC);
CREATE INDEX ON projections.regulatory_digest (tenant_id);
```

- [ ] **Step 2: Commit**

```bash
git add migrations/008_projections_schema.sql
git commit -m "feat: add 008_projections_schema.sql with 4 CQRS projection tables"
```

---

## Task 16: 009_timescaledb.sql

**Files:**
- Create: `migrations/009_timescaledb.sql`

- [ ] **Step 1: Write 009_timescaledb.sql**

```sql
-- 009_timescaledb.sql
-- TimescaleDB hypertable for high-velocity telemetry (aircraft positions, fire detections, etc.)
-- core.telemetry_events: no UUID PK (time-series append-only workload).
-- Retention: 7 days. Compression: after 1 day. Continuous aggregates: hourly + daily.

-- ── 1. core.telemetry_events ──────────────────────────────────────────────────
CREATE TABLE core.telemetry_events (
  time           TIMESTAMPTZ          NOT NULL,
  tenant_id      UUID                 NOT NULL,
  source_id      UUID                 NOT NULL REFERENCES core.sources(id) ON DELETE RESTRICT,
  telemetry_type TEXT                 NOT NULL,
  geometry       GEOMETRY(Point,4326) NOT NULL,
  payload        JSONB                NOT NULL
);

CREATE INDEX ON core.telemetry_events (tenant_id, telemetry_type, time DESC);
CREATE INDEX ON core.telemetry_events USING GIST (geometry);

-- ── 2. Convert to TimescaleDB hypertable ─────────────────────────────────────
SELECT create_hypertable('core.telemetry_events', 'time',
  chunk_time_interval => INTERVAL '1 day');

-- ── 3. Retention policy: drop chunks older than 7 days ───────────────────────
SELECT add_retention_policy('core.telemetry_events', INTERVAL '7 days');

-- ── 4. Compression: compress chunks older than 1 day ─────────────────────────
ALTER TABLE core.telemetry_events SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'tenant_id,telemetry_type',
  timescaledb.compress_orderby = 'time DESC'
);
SELECT add_compression_policy('core.telemetry_events', INTERVAL '1 day');

-- ── 5. Hourly continuous aggregate ───────────────────────────────────────────
CREATE MATERIALIZED VIEW core.telemetry_hourly
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 hour', time) AS bucket,
  tenant_id,
  telemetry_type,
  count(*) AS event_count
FROM core.telemetry_events
GROUP BY 1, 2, 3
WITH NO DATA;

SELECT add_continuous_aggregate_policy('core.telemetry_hourly',
  start_offset    => INTERVAL '3 days',
  end_offset      => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour');

-- ── 6. Daily continuous aggregate ────────────────────────────────────────────
CREATE MATERIALIZED VIEW core.telemetry_daily
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 day', time) AS bucket,
  tenant_id,
  telemetry_type,
  count(*) AS event_count
FROM core.telemetry_events
GROUP BY 1, 2, 3
WITH NO DATA;

SELECT add_continuous_aggregate_policy('core.telemetry_daily',
  start_offset    => INTERVAL '14 days',
  end_offset      => INTERVAL '1 day',
  schedule_interval => INTERVAL '1 day');
```

- [ ] **Step 2: Commit**

```bash
git add migrations/009_timescaledb.sql
git commit -m "feat: add 009_timescaledb.sql with hypertable, retention, compression, aggregates"
```

---

## Task 17: 010_grants.sql

**Files:**
- Create: `migrations/010_grants.sql`

- [ ] **Step 1: Write 010_grants.sql**

```sql
-- 010_grants.sql
-- Apply all GRANT statements LAST — all tables must exist before grants are applied.
-- Role structure:
--   narad_app_reader     → narad_app     (Next.js API routes — read-only)
--   narad_ingest_writer  → narad_worker  (Python Celery — writes to core + workflow)
--   narad_projection_writer → narad_worker (Projection workers — read core, write projections)

-- ── narad_app_reader ─────────────────────────────────────────────────────────
GRANT USAGE ON SCHEMA core, projections, geo_intelligence, corp_watch, lex_pulse
  TO narad_app_reader;

GRANT SELECT ON ALL TABLES IN SCHEMA core        TO narad_app_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA projections TO narad_app_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA geo_intelligence TO narad_app_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA corp_watch  TO narad_app_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA lex_pulse   TO narad_app_reader;

-- ── narad_ingest_writer ───────────────────────────────────────────────────────
GRANT USAGE ON SCHEMA core, audit, workflow, corp_watch, lex_pulse, geo_intelligence
  TO narad_ingest_writer;

-- core: SELECT + INSERT + UPDATE (no DELETE — dark archive protocol)
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA core TO narad_ingest_writer;

-- audit: INSERT only (tables are INSERT-only by policy)
GRANT INSERT ON ALL TABLES IN SCHEMA audit TO narad_ingest_writer;

-- workflow: full DML for EvaluateWatchlistRules and TransitionState commands
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA workflow TO narad_ingest_writer;

-- domain schemas: write access for enrichment workers
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA corp_watch     TO narad_ingest_writer;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA lex_pulse      TO narad_ingest_writer;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA geo_intelligence TO narad_ingest_writer;

-- ── narad_projection_writer ───────────────────────────────────────────────────
GRANT USAGE ON SCHEMA projections, core, workflow, corp_watch, lex_pulse, geo_intelligence
  TO narad_projection_writer;

-- projections: full DML (idempotent upserts)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA projections
  TO narad_projection_writer;

-- read access to source schemas for projection computation
GRANT SELECT ON ALL TABLES IN SCHEMA core             TO narad_projection_writer;
GRANT SELECT ON ALL TABLES IN SCHEMA workflow         TO narad_projection_writer;
GRANT SELECT ON ALL TABLES IN SCHEMA corp_watch       TO narad_projection_writer;
GRANT SELECT ON ALL TABLES IN SCHEMA lex_pulse        TO narad_projection_writer;
GRANT SELECT ON ALL TABLES IN SCHEMA geo_intelligence TO narad_projection_writer;
```

- [ ] **Step 2: Commit**

```bash
git add migrations/010_grants.sql
git commit -m "feat: add 010_grants.sql completing RBAC grant configuration"
```

---

## Task 18: Start Docker Stack and Run All Migrations

**Prerequisites:** Docker Desktop running, `.env` file created from `.env.example` with real passwords, `psql` installed on host.

- [ ] **Step 1: Copy .env.example to .env and set passwords**

```bash
cp .env.example .env
# Edit .env and set real values for:
# POSTGRES_SUPERUSER_PASSWORD, POSTGRES_APP_PASSWORD, POSTGRES_WORKER_PASSWORD
```

- [ ] **Step 2: Run setup-dev.sh (generates userlist.txt + starts Docker + runs migrations)**

```bash
./scripts/setup-dev.sh
```

Expected output (abridged):
```
✓ Generated infra/pgbouncer/userlist.txt
→ Starting Docker Compose stack...
✓ Services started
→ Waiting for Postgres on port 5433...
✓ Postgres is ready
   Applying 001_extensions.sql...                  ✓
   Applying 002_roles.sql...                        ✓
   Applying 003_schemas.sql...                      ✓
   Applying 004_core_schema.sql...                  ✓
   Applying 005_workflow_schema.sql...              ✓
   Applying 006_domain_schemas.sql...               ✓
   Applying 007_audit_schema.sql...                 ✓
   Applying 008_projections_schema.sql...           ✓
   Applying 009_timescaledb.sql...                  ✓
   Applying 010_grants.sql...                       ✓
   ✓ Role passwords synced from .env

✓ Applied: 10   → Skipped: 0
```

- [ ] **Step 3: If any migration fails, read the error output and fix the SQL file, then re-run**

```bash
# After fixing the SQL file, re-run (already-applied migrations are skipped):
./migrations/migrate.sh

# To start completely fresh (dev only):
./migrations/migrate.sh --reset
```

- [ ] **Step 4: Verify all 5 Docker services are healthy**

```bash
docker compose ps
```
Expected: all 5 services show `running` or `healthy` status.

---

## Task 19: Verification Suite

All 9 checks from the spec must pass.

- [ ] **Step 1: Set shell variable for direct Postgres connection**

```bash
source .env
PG="psql postgres://${POSTGRES_SUPERUSER}:${POSTGRES_SUPERUSER_PASSWORD}@localhost:${POSTGRES_DIRECT_PORT}/${POSTGRES_DB}"
```

- [ ] **Step 2: Check all 7 schemas exist**

```bash
$PG -c "\dn" | grep -E "core|workflow|audit|projections|corp_watch|lex_pulse|geo_intelligence"
```
Expected: 7 lines, one per schema.

- [ ] **Step 3: Check core tables exist (spot check)**

```bash
$PG -c "\dt core.*" | grep -E "events|entities|documents|claims|tenants|users"
```
Expected: at least 6 rows listed.

- [ ] **Step 4: Check RLS is enabled on core.events**

```bash
$PG -c "SELECT relrowsecurity FROM pg_class WHERE relname='events' AND relnamespace = 'core'::regnamespace;" | grep t
```
Expected: output contains `t`.

- [ ] **Step 5: Verify uuid_generate_v7() works**

```bash
$PG -c "SELECT uuid_generate_v7();"
```
Expected: a UUID in format `xxxxxxxx-xxxx-7xxx-xxxx-xxxxxxxxxxxx` (version digit is 7).

- [ ] **Step 6: Verify PgBouncer accepts narad_app connection**

```bash
psql "postgres://${POSTGRES_APP_USER}:${POSTGRES_APP_PASSWORD}@localhost:${POSTGRES_POOL_PORT}/${POSTGRES_DB}" -c "SELECT 1;"
```
Expected: `1` returned, no error.

- [ ] **Step 7: Verify TimescaleDB hypertable created**

```bash
$PG -c "SELECT hypertable_name FROM timescaledb_information.hypertables;"
```
Expected: `telemetry_events` listed.

- [ ] **Step 8: Verify pgAdmin is accessible**

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:${PGADMIN_PORT:-5050}
```
Expected: `200`

- [ ] **Step 9: Verify RedisInsight is accessible**

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:${REDISINSIGHT_PORT:-5540}
```
Expected: `200`

- [ ] **Step 10: Run migrate.sh --status to confirm all 10 applied**

```bash
./migrations/migrate.sh --status
```
Expected: all 10 files listed with `✓` and an applied timestamp.

- [ ] **Step 11: Commit final verification**

```bash
git add -A
git commit -m "feat(phase-2a): complete data plane — Docker stack + 10 migrations verified"
```

---

## Spec Coverage Self-Review

| Spec Requirement | Task |
|---|---|
| Docker Compose 5 services | Task 3 |
| postgres on 5433, pgbouncer on 5432 | Task 3 |
| PGDATA non-standard path for timescaledb-ha | Task 3 |
| pgbouncer transaction mode, max_client_conn=200, pool_size=20 | Task 4 |
| userlist.txt with placeholder passwords | Task 4 |
| pgAdmin desktop mode, no login | Task 3 |
| servers.json auto-registration | Task 5 |
| migrate.sh --dry-run / --reset / --status | Task 7 |
| migrate.sh connects to 5433 (never PgBouncer) | Task 7 |
| sha256 idempotency tracking | Task 7 |
| Role passwords set from env vars after migrations | Task 7 |
| 001: pg_uuidv7 extension with PL/pgSQL fallback | Task 8 |
| 002: 5 roles with idempotency guards | Task 9 |
| 003: 7 schemas + set_updated_at() | Task 10 |
| 004: 12 core tables, RLS subselect pattern, circular FK resolved | Task 11 |
| 005: 11 workflow tables, evidence_custody_log INSERT-only | Task 12 |
| 006: 4 domain tables | Task 13 |
| 007: audit_log monthly partitioned + INSERT-only (2 layers) + 3 partitions pre-created | Task 14 |
| 008: 4 CQRS projection tables, no RLS | Task 15 |
| 009: hypertable + 7-day retention + 1-day compression + hourly+daily aggregates | Task 16 |
| 010: grants run last, narad_ingest_writer gets workflow access | Task 17 |
| Verification checklist all 9 checks | Task 19 |
| Monorepo skeleton apps/ and packages/ | Task 1 |
| .env.example updated with Phase 2A variables | Task 2 |
