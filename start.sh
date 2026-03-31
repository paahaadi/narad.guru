#!/usr/bin/env bash
# start.sh — One-command launcher for NARAD V2
# Usage:
#   ./start.sh          # full stack (Docker)
#   ./start.sh --dev    # local dev (no Docker for web/gateway/intelligence)
#   ./start.sh --stop   # stop everything
#   ./start.sh --reset  # wipe DB + volumes, fresh start
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── Colors ────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

# ── Parse flags ───────────────────────────────────────────────────────────────
MODE="docker"
for arg in "$@"; do
  case $arg in
    --dev)   MODE="dev" ;;
    --stop)  MODE="stop" ;;
    --reset) MODE="reset" ;;
  esac
done

# ── Stop mode ─────────────────────────────────────────────────────────────────
if [[ "$MODE" == "stop" ]]; then
  echo -e "${YELLOW}Stopping all NARAD services...${RESET}"
  docker compose down 2>/dev/null || true
  # Kill local dev processes if any
  pkill -f "next dev" 2>/dev/null || true
  pkill -f "uvicorn narad.main" 2>/dev/null || true
  pkill -f "celery.*narad" 2>/dev/null || true
  pkill -f "tsx.*gateway" 2>/dev/null || true
  echo -e "${GREEN}All stopped.${RESET}"
  exit 0
fi

# ── Reset mode ────────────────────────────────────────────────────────────────
if [[ "$MODE" == "reset" ]]; then
  echo -e "${RED}${BOLD}WARNING: This will destroy ALL data (database, Redis, volumes).${RESET}"
  read -rp "Type 'yes' to confirm: " CONFIRM
  if [[ "$CONFIRM" != "yes" ]]; then
    echo "Aborted."
    exit 0
  fi
  echo -e "${YELLOW}Tearing down containers and volumes...${RESET}"
  docker compose down -v 2>/dev/null || true
  echo -e "${GREEN}Clean slate. Run ./start.sh again to rebuild.${RESET}"
  exit 0
fi

echo -e "${CYAN}${BOLD}"
echo "  ┌─────────────────────────────────────────────┐"
echo "  │        NARAD V2 — Sovereign Intelligence    │"
echo "  │              Starting up...                  │"
echo "  └─────────────────────────────────────────────┘"
echo -e "${RESET}"

# ── Step 1: Ensure .env exists ────────────────────────────────────────────────
echo -e "${BOLD}[1/7] Checking environment...${RESET}"

if [[ ! -f .env ]]; then
  echo -e "  ${YELLOW}No .env found — copying from .env.example${RESET}"
  cp .env.example .env
  echo -e "  ${YELLOW}!! Edit .env to set real passwords and API keys !!${RESET}"
fi

# Source .env for local use
set -a
# shellcheck disable=SC1091
source .env
set +a

echo -e "  ${GREEN}✓ .env loaded${RESET}"

# ── Step 2: Generate dev JWT keypair if missing ───────────────────────────────
echo -e "${BOLD}[2/7] Checking JWT keys...${RESET}"

mkdir -p keys

if [[ ! -f keys/jwt_private.pem ]]; then
  echo -e "  ${YELLOW}Generating RS256 dev keypair...${RESET}"
  openssl genpkey -algorithm RSA -out keys/jwt_private.pem -pkeyopt rsa_keygen_bits:2048 2>/dev/null
  openssl rsa -pubout -in keys/jwt_private.pem -out keys/jwt_public.pem 2>/dev/null
  echo -e "  ${GREEN}✓ Dev keypair created at keys/jwt_private.pem${RESET}"
else
  echo -e "  ${GREEN}✓ JWT keypair exists${RESET}"
fi

# Inject the public key PEM into .env if not already set
PUB_KEY_PEM=$(cat keys/jwt_public.pem)
if ! grep -q "^JWT_PUBLIC_KEY_PEM=.*-----" .env 2>/dev/null; then
  # Remove empty JWT_PUBLIC_KEY_PEM= line and add the real one
  sed -i.bak '/^JWT_PUBLIC_KEY_PEM=/d' .env 2>/dev/null || true
  rm -f .env.bak
  echo "JWT_PUBLIC_KEY_PEM=\"$PUB_KEY_PEM\"" >> .env
  echo -e "  ${GREEN}✓ JWT_PUBLIC_KEY_PEM injected into .env${RESET}"
fi

# Re-source after injection
set -a; source .env; set +a

# ── Step 3: Generate a dev session token ──────────────────────────────────────
echo -e "${BOLD}[3/7] Generating dev session token...${RESET}"

DEV_TOKEN_FILE=keys/dev_token.txt

# Generate a JWT signed with the private key for local dev access
if command -v node > /dev/null 2>&1; then
  node -e "
const crypto = require('crypto');
const fs = require('fs');
const privateKey = fs.readFileSync('keys/jwt_private.pem', 'utf8');

const header = { alg: 'RS256', typ: 'JWT' };
const now = Math.floor(Date.now() / 1000);
const payload = {
  sub: 'dev-user-001',
  tenant_id: '${DEFAULT_TENANT_ID:-00000000-0000-0000-0000-000000000001}',
  role: 'admin',
  clearance_level: 'sovereign',
  iss: '${JWT_ISSUER:-narad.guru}',
  iat: now,
  exp: now + (365 * 24 * 60 * 60),  // 1 year for dev
};

function base64url(obj) {
  return Buffer.from(JSON.stringify(obj))
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

const unsigned = base64url(header) + '.' + base64url(payload);
const sign = crypto.createSign('RSA-SHA256');
sign.update(unsigned);
const signature = sign.sign(privateKey, 'base64')
  .replace(/=/g, '')
  .replace(/\+/g, '-')
  .replace(/\//g, '_');

const token = unsigned + '.' + signature;
fs.writeFileSync('$DEV_TOKEN_FILE', token);
console.log('  Token tenant: ${DEFAULT_TENANT_ID:-00000000-0000-0000-0000-000000000001}');
" 2>/dev/null
  echo -e "  ${GREEN}✓ Dev token saved to $DEV_TOKEN_FILE${RESET}"
else
  echo -e "  ${YELLOW}⚠ Node.js not found — skip dev token generation${RESET}"
fi

# ── Step 4: Start infrastructure ──────────────────────────────────────────────
echo -e "${BOLD}[4/7] Starting infrastructure (Postgres, Redis, PgBouncer)...${RESET}"

docker compose up -d postgres redis pgbouncer 2>&1 | grep -E "Started|Running|Created" || true

# Wait for Postgres to be ready
echo -n "  Waiting for Postgres..."
for i in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U "${POSTGRES_SUPERUSER:-postgres}" -d "${POSTGRES_DB:-narad_v2}" > /dev/null 2>&1; then
    echo -e " ${GREEN}ready${RESET}"
    break
  fi
  if [[ $i -eq 30 ]]; then
    echo -e " ${RED}timeout!${RESET}"
    echo -e "${RED}Postgres failed to start. Check: docker compose logs postgres${RESET}"
    exit 1
  fi
  echo -n "."
  sleep 1
done

# Wait for Redis to be ready
echo -n "  Waiting for Redis..."
for i in $(seq 1 15); do
  if docker compose exec -T redis redis-cli ping > /dev/null 2>&1; then
    echo -e " ${GREEN}ready${RESET}"
    break
  fi
  if [[ $i -eq 15 ]]; then
    echo -e " ${RED}timeout!${RESET}"
    exit 1
  fi
  echo -n "."
  sleep 1
done

# ── Step 5: Run database migrations ──────────────────────────────────────────
echo -e "${BOLD}[5/7] Running database migrations...${RESET}"

# Ensure the default tenant exists before app starts
bash ./migrations/migrate.sh

# Seed the default dev tenant if it doesn't exist
TENANT_ID="${DEFAULT_TENANT_ID:-00000000-0000-0000-0000-000000000001}"
PGPASSWORD="${POSTGRES_SUPERUSER_PASSWORD}" psql \
  -h localhost -p "${POSTGRES_DIRECT_PORT:-5433}" \
  -U "${POSTGRES_SUPERUSER:-postgres}" -d "${POSTGRES_DB:-narad_v2}" \
  -c "
    INSERT INTO core.tenants (id, name, slug, is_active)
    VALUES ('$TENANT_ID', 'NARAD Dev', 'narad-dev', TRUE)
    ON CONFLICT (id) DO NOTHING;
  " 2>/dev/null || echo -e "  ${YELLOW}⚠ Tenant seed skipped (table may not exist yet)${RESET}"

echo -e "  ${GREEN}✓ Migrations complete${RESET}"

# ── Step 6: Start application services ────────────────────────────────────────
echo -e "${BOLD}[6/7] Starting application services...${RESET}"

if [[ "$MODE" == "dev" ]]; then
  # ── Local dev mode: run web/gateway/intelligence outside Docker ────────
  echo -e "  ${CYAN}Dev mode: infrastructure in Docker, apps running locally${RESET}"

  WORKER_DB_URL="postgresql://${POSTGRES_WORKER_USER:-narad_worker}:${POSTGRES_WORKER_PASSWORD:-narad_worker_dev}@localhost:${POSTGRES_POOL_PORT:-6432}/${POSTGRES_DB:-narad_v2}"

  # Start intelligence API
  echo -e "  Starting intelligence API (port 8000)..."
  (cd apps/intelligence && DATABASE_URL="$WORKER_DB_URL" uv run uvicorn narad.main:app --host 0.0.0.0 --port 8000 --reload) &
  INTEL_PID=$!

  # Start Celery worker
  echo -e "  Starting Celery worker..."
  (cd apps/intelligence && DATABASE_URL="$WORKER_DB_URL" uv run celery -A narad.workers.celery_app:celery worker --loglevel=INFO --concurrency=2) &
  CELERY_PID=$!

  # Start Celery beat
  echo -e "  Starting Celery beat..."
  (cd apps/intelligence && DATABASE_URL="$WORKER_DB_URL" uv run celery -A narad.workers.celery_app:celery beat --loglevel=INFO) &
  BEAT_PID=$!

  # Start gateway
  echo -e "  Starting WebSocket gateway (port 3001)..."
  (cd apps/gateway && npm run dev) &
  GW_PID=$!

  # Start Next.js
  echo -e "  Starting Next.js web app (port 3000)..."
  (cd apps/web && npm run dev) &
  WEB_PID=$!

  echo ""
  echo -e "  ${GREEN}✓ All dev processes launched${RESET}"
  echo -e "  PIDs: web=$WEB_PID gateway=$GW_PID intelligence=$INTEL_PID celery=$CELERY_PID beat=$BEAT_PID"

else
  # ── Docker mode: everything in containers ─────────────────────────────
  echo -e "  ${CYAN}Docker mode: building and starting all containers...${RESET}"

  # Start admin tools
  docker compose up -d pgadmin redisinsight 2>&1 | grep -E "Started|Running|Created" || true

  # Build and start application containers
  docker compose up -d --build web gateway intelligence celery-worker celery-beat 2>&1 | grep -E "Started|Running|Created|Building" || true

  echo -e "  ${GREEN}✓ All containers started${RESET}"
fi

# ── Step 7: Summary ──────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}${BOLD}  ┌─────────────────────────────────────────────┐"
echo "  │          NARAD V2 is running!               │"
echo "  └─────────────────────────────────────────────┘${RESET}"
echo ""
echo -e "  ${BOLD}Services:${RESET}"
echo -e "    Web app          ${GREEN}http://localhost:${WEB_PORT:-3000}${RESET}"
echo -e "    WebSocket gateway${GREEN} ws://localhost:${GATEWAY_PORT:-3001}${RESET}"
echo -e "    Intelligence API ${GREEN}http://localhost:${INTELLIGENCE_PORT:-8000}${RESET}"
echo -e "    Intelligence docs${GREEN}http://localhost:${INTELLIGENCE_PORT:-8000}/docs${RESET}"

if [[ "$MODE" != "dev" ]]; then
  echo -e "    pgAdmin          ${GREEN}http://localhost:${PGADMIN_PORT:-5050}${RESET}"
  echo -e "    RedisInsight     ${GREEN}http://localhost:${REDISINSIGHT_PORT:-5540}${RESET}"
fi

echo ""
echo -e "  ${BOLD}Auth (dev access):${RESET}"

if [[ -f "$DEV_TOKEN_FILE" ]]; then
  DEV_TOKEN=$(cat "$DEV_TOKEN_FILE")
  COOKIE_NAME="${APP_AUTH_COOKIE_NAME:-narad_session}"
  echo -e "    Set this cookie in your browser to access workspaces:"
  echo ""
  echo -e "    ${YELLOW}Open browser console (F12) on http://localhost:${WEB_PORT:-3000} and run:${RESET}"
  echo -e "    ${CYAN}document.cookie = '${COOKIE_NAME}=${DEV_TOKEN}; path=/'${RESET}"
  echo ""
  echo -e "    Or use curl:"
  echo -e "    ${CYAN}curl -H 'Authorization: Bearer ${DEV_TOKEN:0:20}...' http://localhost:${WEB_PORT:-3000}/api/session/me${RESET}"
fi

echo ""
echo -e "  ${BOLD}Commands:${RESET}"
echo "    ./start.sh --stop   Stop everything"
echo "    ./start.sh --reset  Wipe DB and start fresh"
echo "    ./start.sh --dev    Run apps locally (hot reload)"
echo ""

if [[ "$MODE" == "dev" ]]; then
  echo -e "  ${YELLOW}Press Ctrl+C to stop all dev processes.${RESET}"
  # Wait for any child to exit
  trap 'kill $WEB_PID $GW_PID $INTEL_PID $CELERY_PID $BEAT_PID 2>/dev/null; exit' INT TERM
  wait
fi
