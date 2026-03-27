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
