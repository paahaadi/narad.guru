# Phase 2C: Presentation Plane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Dependencies:** `docs/architecture/canonical_ontology.md` (Phase 1), `docs/superpowers/specs/2026-03-27-phase-2a-data-plane-design.md`, `docs/superpowers/specs/2026-03-28-phase-2b-intelligence-plane-design.md`

**Goal:** Stand up the NARAD app plane with a shared authenticated shell, seven routed workspaces translated from the `narad/` prototypes, a separate Node WebSocket gateway, and full live integration for GeoStrat and PulseBoard.

**Architecture:** Next.js 15 App Router serves the web application in `apps/web`. A separate Node service in `apps/gateway` bridges Redis pub/sub to browser clients using JWT-authenticated WebSockets. The app plane reads through PgBouncer as `narad_app` with the tenant RLS contract from Phase 1/2A preserved. PulseBoard renders from `projections.pulseboard_feed` plus canonical detail tables. GeoStrat's Phase 2C baseline renders from `geo_intelligence.layer_configs` and `core.events` with MapLibre GL JS + Deck.gl + MVT, and uses the current `narad:pulseboard:event` stream as the live invalidation trigger until dedicated GeoStrat channels land. The remaining five workspace prototypes ship as production routes with staged adapter layers around the read models that already exist in schema.

**Tech Stack:** Next.js 15, TypeScript, React, Zustand, React Query, MapLibre GL JS, Deck.gl, Node WebSocket server, Redis client, jose, PostgreSQL via PgBouncer

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `apps/web/package.json` | Create | App dependencies and scripts |
| `apps/web/next.config.ts` | Create | Next.js config |
| `apps/web/tsconfig.json` | Create | TypeScript config |
| `apps/web/src/app/(authenticated)/layout.tsx` | Create | Shared authenticated shell |
| `apps/web/src/app/(authenticated)/geostrat/page.tsx` | Create | GeoStrat route |
| `apps/web/src/app/(authenticated)/pulseboard/page.tsx` | Create | PulseBoard route |
| `apps/web/src/app/(authenticated)/corpwatch/page.tsx` | Create | CorpWatch route |
| `apps/web/src/app/(authenticated)/lexpulse/page.tsx` | Create | LexPulse route |
| `apps/web/src/app/(authenticated)/watchlists/page.tsx` | Create | Watchlists route |
| `apps/web/src/app/(authenticated)/investigations/page.tsx` | Create | Investigations route |
| `apps/web/src/app/(authenticated)/briefings/page.tsx` | Create | Briefings route |
| `apps/web/src/app/api/session/me/route.ts` | Create | Session identity endpoint |
| `apps/web/src/app/api/pulseboard/**` | Create | PulseBoard app-plane reads |
| `apps/web/src/app/api/geostrat/**` | Create | GeoStrat app-plane reads and tiles |
| `apps/web/src/components/**` | Create | Shared shell and workspace primitives |
| `apps/web/src/features/**` | Create | Workspace-specific components |
| `apps/web/src/stores/**` | Create | Zustand stores |
| `apps/web/src/lib/auth.ts` | Create | JWT verification helpers |
| `apps/web/src/lib/db.ts` | Create | Read-only app-plane db access |
| `apps/web/src/styles/globals.css` | Create | Sovereign Midnight token layer |
| `apps/gateway/package.json` | Create | Gateway runtime dependencies |
| `apps/gateway/src/server.ts` | Create | WebSocket server boot |
| `apps/gateway/src/auth.ts` | Create | JWT validation at connect |
| `apps/gateway/src/redis.ts` | Create | Redis pub/sub client |
| `apps/gateway/src/contracts.ts` | Create | Delta payload contracts |
| `.env.example` | Modify | Add Phase 2C runtime variables |
| `docker-compose.yml` | Modify | Add `web` and `gateway` services |

---

## Task 1: Scaffold `apps/web` and `apps/gateway`

**Files:**
- Create: `apps/web/**`
- Create: `apps/gateway/**`

- [ ] **Step 1: Create app directories**

```bash
mkdir -p apps/web/src/{app,components,features,lib,stores,styles}
mkdir -p apps/gateway/src
```

- [ ] **Step 2: Add package manifests**

`apps/web` must include:
- next
- react
- react-dom
- zustand
- @tanstack/react-query
- maplibre-gl
- @deck.gl/core
- @deck.gl/layers
- jose
- pg or server-side postgres client

`apps/gateway` must include:
- ws
- redis
- jose
- typescript tooling

---

## Task 2: Translate the Design System From `narad/`

**Files:**
- Create: `apps/web/src/styles/globals.css`
- Create: `apps/web/src/components/shell/**`

- [ ] **Step 1: Extract common tokens from prototypes**

Source:
- `narad/sovereign_midnight/DESIGN.md`
- all `narad/*/code.html`

Translate into production CSS variables:
- surface ladder
- orange primary accent
- text / secondary / outline tokens
- spacing rhythm
- radius scale
- typography families

- [ ] **Step 2: Normalize shell patterns**

Build shared primitives for:
- left workspace rail
- top command header
- command search input
- notification/share/account cluster
- route-active visual treatment

- [ ] **Step 3: Keep route-specific composition out of the shell**

The shell is shared. Workspace bodies remain distinct.

---

## Task 3: Auth and Middleware

**Files:**
- Create: `apps/web/src/lib/auth.ts`
- Create: `apps/web/src/app/api/session/me/route.ts`
- Create: `apps/web/src/middleware.ts`
- Create: `apps/gateway/src/auth.ts`

- [ ] **Step 1: Implement JWT verification**

Rules:
- RS256
- issuer = `JWT_ISSUER`
- claims required:
  - `sub`
  - `tenant_id`
  - `role`
  - `clearance_level`
  - `iss`
  - `exp`

- [ ] **Step 2: Protect authenticated workspace routes**

Protected:
- `/geostrat`
- `/pulseboard`
- `/corpwatch`
- `/lexpulse`
- `/watchlists`
- `/investigations`
- `/briefings`

- [ ] **Step 3: Implement `/api/session/me`**

Return decoded user identity for shell/session bootstrap.

---

## Task 4: Shared Shell and Route Skeletons

**Files:**
- Create: `apps/web/src/app/(authenticated)/layout.tsx`
- Create: seven workspace page files

- [ ] **Step 1: Build the shared authenticated shell**

Reference:
- `narad/narad_sovereign_intelligence_app/code.html`

Must preserve:
- left rail
- top search header
- route identity
- notifications/share/account grouping

- [ ] **Step 2: Create all seven routes**

Routes:
- `/geostrat`
- `/pulseboard`
- `/corpwatch`
- `/lexpulse`
- `/watchlists`
- `/investigations`
- `/briefings`

- [ ] **Step 3: Translate each prototype into a production route**

Rules:
- keep panel hierarchy
- keep visual density
- keep authored route identity
- do not ship generic placeholders

---

## Task 5: PulseBoard Live Integration

**Files:**
- Create: `apps/web/src/app/api/pulseboard/route.ts`
- Create: `apps/web/src/app/api/pulseboard/[eventId]/route.ts`
- Create: `apps/web/src/features/pulseboard/**`
- Create: `apps/web/src/stores/pulseboard.ts`

- [ ] **Step 1: Implement app-plane PulseBoard reads**

Read source:
- `projections.pulseboard_feed`

- [ ] **Step 2: Render SSR feed**

Preserve:
- left narrative feed rail
- large story focus
- evidence/action zone

- [ ] **Step 3: Wire live delta patching**

Use gateway-delivered delta payloads to patch the selected and feed cards in place.

---

## Task 6: GeoStrat Live Integration

**Files:**
- Create: `apps/web/src/app/api/geostrat/kpis/route.ts`
- Create: `apps/web/src/app/api/geostrat/layers/route.ts`
- Create: `apps/web/src/app/api/geostrat/events/route.ts`
- Create: `apps/web/src/app/api/geostrat/tiles/[layer]/[z]/[x]/[y].mvt/route.ts`
- Create: `apps/web/src/features/geostrat/**`
- Create: `apps/web/src/stores/geostrat.ts`

- [ ] **Step 1: Implement KPI and layer APIs**

GeoStrat must read through the app plane, never from raw ingestion.

Baseline sources already delivered by completed phases:
- `geo_intelligence.layer_configs` for the layer registry
- `core.events` for KPI, event list, and tile generation
- all queries execute as `narad_app` and preserve tenant RLS via `app.current_tenant_id`

- [ ] **Step 2: Implement map canvas**

Use:
- MapLibre GL JS
- Deck.gl overlays
- MVT-backed delivery

- [ ] **Step 3: Preserve authored command-center composition**

Keep:
- KPI strip
- map-dominant layout
- floating controls
- bottom live feed
- right-side district detail rail

---

## Task 7: Realtime Gateway

**Files:**
- Create: `apps/gateway/src/server.ts`
- Create: `apps/gateway/src/redis.ts`
- Create: `apps/gateway/src/contracts.ts`

- [ ] **Step 1: Implement Node gateway boot**

Requirements:
- subscribe to Redis `narad:*`
- preserve compatibility with the Phase 2B delta envelope and the current `narad:pulseboard:event` publisher
- multiplex client subscriptions by tenant/workspace
- validate JWT on socket connect

- [ ] **Step 2: Lock delta payload shape**

Payload:
- `channel`
- `tenant_id`
- `entity_type`
- `entity_id`
- `changes`
- `timestamp`

- [ ] **Step 3: Add throttling hooks for high-velocity map updates**

Rules:
- start with interval-based channel throttling
- add viewport-aware filters only when dedicated GeoStrat delta channels are introduced
- delta-only

---

## Task 8: Production Routes for CorpWatch, LexPulse, Watchlists, Investigations, Briefings

**Files:**
- Create: route pages and feature components for each workspace

- [ ] **Step 1: Translate the prototypes faithfully**

Reference:
- `narad/corpwatch_intelligence_desk/code.html`
- `narad/lexpulse_intelligence_terminal/code.html`
- `narad/watchlists_workspace/code.html`
- `narad/investigations_workspace/code.html`
- `narad/briefings_workspace/code.html`

- [ ] **Step 2: Introduce stable route-level data adapters**

These adapters may begin staged or read-only, but the route composition must be final enough that later backend work plugs in without redesign.

Alignment rules:
- prefer `projections.entity_summaries`, `projections.watchlist_deltas`, and `projections.regulatory_digest` where those reads are available
- where Phase 2B rebuilders are still stubbed, use explicit staged adapters over read-only `core` / `workflow` sources or route-local static fixtures
- do not let route code depend directly on unfinished backend orchestration paths

- [ ] **Step 3: Apply the visual refinement brief**

Allowed refinements:
- consistency
- scanability
- hierarchy
- shell normalization

Not allowed:
- generic template replacement
- aesthetic reset

---

## Task 9: Compose and Runtime Wiring

**Files:**
- Modify: `.env.example`
- Modify: `docker-compose.yml`

- [ ] **Step 1: Add Phase 2C environment variables**

Add:

```bash
WEB_PORT=3000
GATEWAY_PORT=3001
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_WS_URL=ws://localhost:3001
NEXT_PUBLIC_GATEWAY_WS_URL=ws://localhost:3001
APP_AUTH_COOKIE_NAME=narad_session
NEXT_PUBLIC_APP_AUTH_COOKIE_NAME=narad_session
JWT_PUBLIC_KEY_PEM=
JWT_PUBLIC_KEY_URL=
```

- [ ] **Step 2: Add `web` and `gateway` services**

Rules:
- both use Docker DNS for backend dependencies
- `web` reads through PgBouncer as `narad_app`
- `gateway` reads Redis directly

- [ ] **Step 3: Validate compose**

```bash
docker compose config --quiet && echo "OK: compose valid"
```

---

## Task 10: Verification Checklist

- [ ] **Step 1: Seven routes resolve**

```bash
curl -I http://localhost:3000/pulseboard
curl -I http://localhost:3000/geostrat
curl -I http://localhost:3000/corpwatch
curl -I http://localhost:3000/lexpulse
curl -I http://localhost:3000/watchlists
curl -I http://localhost:3000/investigations
curl -I http://localhost:3000/briefings
```

- [ ] **Step 2: Session endpoint responds**

```bash
curl -s http://localhost:3000/api/session/me
```

- [ ] **Step 3: PulseBoard API responds**

```bash
curl -s http://localhost:3000/api/pulseboard | jq '.'
```

- [ ] **Step 4: GeoStrat API responds**

```bash
curl -s http://localhost:3000/api/geostrat/kpis | jq '.'
curl -s http://localhost:3000/api/geostrat/layers | jq '.'
```

- [ ] **Step 5: Gateway boot visible**

```bash
docker compose logs gateway | grep -E "listening|subscribed|connected"
```

- [ ] **Step 6: Manual visual verification**

Confirm:
- all seven routes preserve the look and feel from `narad/`
- PulseBoard updates in place on delta events
- GeoStrat remains map-first and readable
- shell remains mounted during route changes

---

## Commit Sequence

Suggested commit sequence:

1. `feat: scaffold app plane web and gateway packages`
2. `feat: translate sovereign midnight tokens into production shell`
3. `feat: add shared auth middleware and session endpoint`
4. `feat: add pulseboard route and live data integration`
5. `feat: add geostrat route and tile-backed map integration`
6. `feat: add websocket gateway for redis delta events`
7. `feat: translate remaining workspace prototypes into routed screens`
8. `feat: wire app plane services into docker compose`
