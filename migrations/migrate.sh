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
if [[ -n "${POSTGRES_SUPERUSER_PASSWORD:-}" ]]; then
  export PGPASSWORD="$POSTGRES_SUPERUSER_PASSWORD"
else
  unset PGPASSWORD
fi

PSQL_CONN=(-h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME")

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

if [[ "$RESET" == "true" && "$DRY_RUN" == "true" ]]; then
  echo "ERROR: --reset and --dry-run are mutually exclusive" >&2
  exit 1
fi

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
psql "${PSQL_CONN[@]}" -c "
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
    applied=$(psql "${PSQL_CONN[@]}" -t -c \
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
WARNED=0

for file in "$SCRIPT_DIR"/*.sql; do
  [[ -f "$file" ]] || continue
  filename=$(basename "$file")
  current_sha=$(sha256_file "$file")

  stored_sha=$(psql "${PSQL_CONN[@]}" -t -c \
    "SELECT sha256 FROM public._migrations WHERE filename = '$filename';" \
    | tr -d ' \n')

  if [[ -n "$stored_sha" ]]; then
    if [[ "$stored_sha" != "$current_sha" ]]; then
      echo -e "${YELLOW}⚠  $filename  sha256 changed since last run — skipping (run --reset to reapply)${RESET}"
      WARNED=$((WARNED + 1))
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

  # TimescaleDB DDL (create_hypertable, add_retention_policy, etc.) cannot run
  # inside a transaction block — apply it directly without the wrapping BEGIN/COMMIT.
  if [[ "$filename" == "009_timescaledb.sql" ]]; then
    if error_output=$(psql "${PSQL_CONN[@]}" -v ON_ERROR_STOP=1 -f "$file" 2>&1); then
      psql_exit=0
    else
      psql_exit=$?
    fi
    if [[ $psql_exit -eq 0 ]]; then
      psql "${PSQL_CONN[@]}" -c \
        "INSERT INTO public._migrations (filename, sha256) VALUES ('$filename', '$current_sha');" \
        > /dev/null
      echo -e "${GREEN}✓${RESET}"
      APPLIED=$((APPLIED + 1))
    else
      echo -e "${RED}✗${RESET}"
      echo ""
      echo -e "${RED}ERROR in $filename:${RESET}"
      printf '%s\n' "$error_output"
      exit 1
    fi
  else
    # All other migrations: wrap apply + tracking INSERT in a single transaction
    # so that a killed process cannot leave a migration applied-but-untracked.
    if error_output=$(psql "${PSQL_CONN[@]}" -v ON_ERROR_STOP=1 2>&1 <<MIGRATION_EOF
BEGIN;
$(cat "$file")
INSERT INTO public._migrations (filename, sha256) VALUES ('$filename', '$current_sha');
COMMIT;
MIGRATION_EOF
    ); then
      psql_exit=0
    else
      psql_exit=$?
    fi
    if [[ $psql_exit -eq 0 ]]; then
      echo -e "${GREEN}✓${RESET}"
      APPLIED=$((APPLIED + 1))
    else
      echo -e "${RED}✗${RESET}"
      echo ""
      echo -e "${RED}ERROR in $filename:${RESET}"
      printf '%s\n' "$error_output"
      exit 1
    fi
  fi
done

# ── Sync role passwords from env vars ─────────────────────────────────────────
if [[ "$DRY_RUN" == "false" ]]; then
  if [[ -n "${POSTGRES_APP_PASSWORD:-}" ]]; then
    psql "${PSQL_CONN[@]}" -c "ALTER ROLE narad_app PASSWORD '${POSTGRES_APP_PASSWORD}';" > /dev/null 2>&1 || true
  fi
  if [[ -n "${POSTGRES_WORKER_PASSWORD:-}" ]]; then
    psql "${PSQL_CONN[@]}" -c "ALTER ROLE narad_worker PASSWORD '${POSTGRES_WORKER_PASSWORD}';" > /dev/null 2>&1 || true
  fi
  [[ -n "${POSTGRES_APP_PASSWORD:-}" || -n "${POSTGRES_WORKER_PASSWORD:-}" ]] && \
    echo -e "   ${GREEN}✓${RESET} Role passwords synced from .env"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
if [[ $WARNED -gt 0 ]]; then
  echo -e "${GREEN}✓ Applied: $APPLIED${RESET}   → Skipped: $SKIPPED   ${YELLOW}⚠ Warned: $WARNED${RESET}"
else
  echo -e "${GREEN}✓ Applied: $APPLIED${RESET}   → Skipped: $SKIPPED"
fi
