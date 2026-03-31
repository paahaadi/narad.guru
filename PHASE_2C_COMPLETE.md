# NARAD V2 — Phase 2C Complete: Presentation Plane

**Phase:** 2C of 7  
**Session:** Presentation Plane  
**Status:** Complete  
**Started:** 2026-03-28  
**Completed:** 2026-03-28  
**Depends on:** Phase 2A — Data Plane + Infrastructure, Phase 2B — Intelligence Plane

---

## Table of Contents

1. [Direct Answer](#1-direct-answer)
2. [Purpose of Phase 2C](#2-purpose-of-phase-2c)
3. [What Phase 2C Produced](#3-what-phase-2c-produced)
4. [What Was Completed in the Final Phase 2C Pass](#4-what-was-completed-in-the-final-phase-2c-pass)
5. [Why This Work Was Done](#5-why-this-work-was-done)
6. [Technology Stack and Why It Was Used](#6-technology-stack-and-why-it-was-used)
7. [Verification Results](#7-verification-results)
8. [Key File Inventory](#8-key-file-inventory)
9. [Outcome](#9-outcome)

---

## 1. Direct Answer

**Yes. Phase 2C is complete.**

This means the NARAD presentation plane now satisfies the locked Phase 2C contract:

- the authenticated application shell exists
- all seven workspace routes exist as production routes
- PulseBoard is live-integrated
- GeoStrat ships with the Phase 2C live baseline
- the remaining five workspaces ship as real routed screens backed by staged adapters on current read models
- the standalone WebSocket gateway is wired to Redis pub/sub with JWT-aware session handling

Because Phase 2A and Phase 2B were already complete, **Phase 2 as a whole is now complete**.

---

## 2. Purpose of Phase 2C

Phase 2C turns the system from a backend platform into an operator-facing intelligence application.

Its purpose is:

- to give analysts a real working application shell instead of isolated prototypes
- to translate the `narad/` authored interfaces into maintainable production routes
- to connect live backend projections and Redis events to usable workspaces
- to preserve the visual identity of the designed prototypes while making them operational

In practical terms, Phase 2C is the layer where:

- backend intelligence becomes visible
- realtime updates become actionable
- analysts can move between workspaces inside one coherent app plane

---

## 3. What Phase 2C Produced

### Application plane

- `apps/web` Next.js 15 application
- shared authenticated shell with left rail, top bar, route framing, and access control
- seven routed workspaces:
  - `/geostrat`
  - `/pulseboard`
  - `/corpwatch`
  - `/lexpulse`
  - `/watchlists`
  - `/investigations`
  - `/briefings`

### API plane for the web app

- session bootstrap route
- PulseBoard collection and detail routes
- GeoStrat KPI route
- GeoStrat layer route
- GeoStrat events route
- GeoStrat MVT tile route

### Realtime delivery plane

- `apps/gateway` Node WebSocket gateway
- Redis pub/sub bridge from backend events to browser clients
- JWT-aware websocket connection validation
- channel filtering and throttling baseline for presentation traffic

### Workspace integration depth

| Route | Integration depth in Phase 2C | Status |
|---|---|---|
| `/pulseboard` | Live production integration from projections + detail reads + websocket updates | Complete |
| `/geostrat` | Live Phase 2C baseline from `geo_intelligence.layer_configs` + `core.events` + MVT tiles | Complete |
| `/corpwatch` | Production route with staged adapter backed by current read models and core/workflow data | Complete |
| `/lexpulse` | Production route with staged adapter backed by regulatory digest/read fallbacks | Complete |
| `/watchlists` | Production route with staged adapter backed by workflow + watchlist delta reads | Complete |
| `/investigations` | Production route with staged adapter backed by workflow evidence/note reads | Complete |
| `/briefings` | Production route with staged adapter backed by workflow briefing/version reads | Complete |

### Important implementation note

The five non-core workspaces are complete **because the locked Phase 2C spec explicitly allowed them to ship as production routes with staged adapters**. The requirement was not to wait for future backend expansion, but to ship the final routed composition now so later backend depth can plug in without redesign.

---

## 4. What Was Completed in the Final Phase 2C Pass

The final pass closed the remaining gaps between "mostly implemented" and "complete".

### 4.1 Route-specific workspace adapters were finished

The remaining five workspaces were moved off the generic staged surface and onto route-specific server adapters:

- `apps/web/src/lib/workspaces/lexpulse.ts`
- `apps/web/src/lib/workspaces/watchlists.ts`
- `apps/web/src/lib/workspaces/investigations.ts`
- `apps/web/src/lib/workspaces/briefings.ts`

These adapters now read from the current schema instead of relying on a generic placeholder translation layer.

What this achieved:

- each route now has its own data contract
- route code is easier to evolve without breaking unrelated workspaces
- backend read-model upgrades can land behind a stable route interface

### 4.2 Production workspace components were added for the remaining routes

A new route-level workspace component module was added:

- `apps/web/src/features/workspaces/live-workspaces.tsx`

This now renders:

- `CorpWatchWorkspace`
- `LexPulseWorkspace`
- `WatchlistsWorkspace`
- `InvestigationsWorkspace`
- `BriefingsWorkspace`

Why this mattered:

- the visual prototype translation now lives in production code, not in a shared fallback page
- the non-core routes keep their authored identity while still being maintainable

### 4.3 Remaining route pages were rewired to real adapters

The following route pages were updated to read the authenticated principal and fetch route-specific workspace data:

- `apps/web/src/app/(authenticated)/corpwatch/page.tsx`
- `apps/web/src/app/(authenticated)/lexpulse/page.tsx`
- `apps/web/src/app/(authenticated)/watchlists/page.tsx`
- `apps/web/src/app/(authenticated)/investigations/page.tsx`
- `apps/web/src/app/(authenticated)/briefings/page.tsx`

Why this mattered:

- route identity is now backed by real server reads
- tenant-aware data access is preserved through the existing auth and database contract

### 4.4 Intelligence projection rebuilders were completed for presentation reads

The presentation plane depended on stronger backend rebuild hooks for staged routes. Those were completed in:

- `apps/intelligence/src/narad/workers/projection_tasks.py`

Added rebuild tasks:

- `rebuild_watchlist_delta_projection`
- `rebuild_entity_summary_projection`
- `rebuild_regulatory_digest_projection`

Redis delta publication was also completed for:

- `narad:watchlist:delta`
- `narad:entity:updated`
- `narad:regulatory:digest_updated`

Why this mattered:

- the presentation layer now has proper backend refresh hooks for the main staged read paths
- route-local adapters can depend on a clearer projection lifecycle

### 4.5 Projection outputs were strengthened for workspace consumption

The following backend projection files were refined:

- `apps/intelligence/src/narad/projections/watchlist_deltas.py`
- `apps/intelligence/src/narad/projections/entity_summaries.py`
- `apps/intelligence/src/narad/projections/regulatory_digest.py`

What changed:

- watchlist delta summaries were made more useful for alert-driven UI rendering
- entity summaries now expose relationship target fields expected by the CorpWatch workspace
- regulatory digest output now includes richer document and regulator detail for LexPulse

Why this mattered:

- the UI should not need to reconstruct missing semantics that the projection layer should already provide
- this reduces coupling between UI formatting and backend domain logic

### 4.6 Build/test alignment issues were closed

Two final correctness issues were addressed:

- a web build failure in `apps/web/src/lib/workspaces/corpwatch.ts` caused by invalid mixing of `??` and `||`
- a stale intelligence smoke test that still expected a removed `/` route

Why this mattered:

- Phase 2C could not be declared complete while automated verification still had contract drift

---

## 5. Why This Work Was Done

The completion work had one goal: remove the gap between "the UI exists" and "the presentation plane is complete against the approved Phase 2C design".

Each completed item served that goal:

- **route-specific adapters** were done so each workspace has a stable, explicit read path
- **production route components** were done so the authored workspace designs exist as final routed screens
- **projection rebuilders** were done so backend changes can update presentation-facing read models cleanly
- **Redis event publication** was done so the UI can react to backend state changes instead of polling blindly
- **test/build fixes** were done so completion is backed by evidence rather than by assumption

In short:

- the work was done to make the app plane operational
- it was also done to keep the architecture honest: backend semantics in the backend, presentation composition in the web app, realtime fan-out in the gateway

---

## 6. Technology Stack and Why It Was Used

### Web application

- **Next.js 15**
  - used for the App Router, server-rendered route composition, API routes, and middleware-based protection
- **React 19**
  - used for workspace composition and client-side live surfaces
- **TypeScript**
  - used to keep route contracts, workspace data shapes, and gateway payload handling explicit

### Geospatial UI

- **MapLibre GL JS**
  - used for sovereign-friendly map rendering without locking the app to a proprietary map vendor
- **Deck.gl**
  - used for overlay rendering and map visualization composition in GeoStrat
- **MVT tile delivery**
  - used so GeoStrat can render scalable tile-backed event layers rather than forcing all spatial data through one large payload

### Data access and state

- **PostgreSQL read models through `pg`**
  - used for server-side route data reads against the existing Phase 2A/2B schema
- **TanStack React Query**
  - used where client-side fetch and cache control is needed for live surfaces
- **Zustand**
  - used for lightweight route-local client state

### Realtime and auth

- **Node.js + `ws`**
  - used for the standalone websocket gateway so realtime fan-out stays separate from the Next.js request lifecycle
- **Redis**
  - used as the pub/sub bridge between backend workers and browser subscribers
- **`jose`**
  - used for JWT validation in both the web and gateway layers

### Backend presentation support

- **FastAPI**
  - provides typed backend routes in the intelligence plane
- **Celery**
  - provides background rebuild and orchestration tasks
- **Python 3.12**
  - provides the runtime for projection rebuilders and backend services

These technologies were chosen because they match the shape of the problem:

- Next.js for routed application delivery
- Redis and websockets for low-latency updates
- Postgres read models for stable server-rendered workspace data
- Python workers for backend projection rebuild and orchestration

---

## 7. Verification Results

### Automated verification

The following checks passed:

| Check | Result |
|---|---|
| `npm run build` in `apps/web` | Passed |
| `npm run typecheck` in `apps/web` | Passed |
| `npm run typecheck` in `apps/gateway` | Passed |
| `npm run build` in `apps/gateway` | Passed |
| `python3 -m compileall src` in `apps/intelligence` | Passed |
| `uv run --python 3.12 pytest -q` in `apps/intelligence` | Passed (`1 passed`) |
| `docker compose --env-file .env.example config --quiet` | Passed |

### Route-resolution smoke checks

The built Next.js server was started locally on port `3100` and the seven protected workspace routes were checked with `curl -I`.

Observed result:

- `/geostrat` -> `307 Temporary Redirect`
- `/pulseboard` -> `307 Temporary Redirect`
- `/corpwatch` -> `307 Temporary Redirect`
- `/lexpulse` -> `307 Temporary Redirect`
- `/watchlists` -> `307 Temporary Redirect`
- `/investigations` -> `307 Temporary Redirect`
- `/briefings` -> `307 Temporary Redirect`

This is the correct unauthenticated behavior for the protected route contract because middleware redirected each request to `/access-denied`.

### What this verification proves

- the web app compiles
- the gateway compiles
- the intelligence service compiles and passes its current test suite
- docker compose configuration is valid
- all seven protected routes resolve through the application shell and middleware layer

---

## 8. Key File Inventory

### New or completed web data adapters

- `apps/web/src/lib/workspaces/lexpulse.ts`
- `apps/web/src/lib/workspaces/watchlists.ts`
- `apps/web/src/lib/workspaces/investigations.ts`
- `apps/web/src/lib/workspaces/briefings.ts`

### New route-level workspace module

- `apps/web/src/features/workspaces/live-workspaces.tsx`

### Updated route pages

- `apps/web/src/app/(authenticated)/corpwatch/page.tsx`
- `apps/web/src/app/(authenticated)/lexpulse/page.tsx`
- `apps/web/src/app/(authenticated)/watchlists/page.tsx`
- `apps/web/src/app/(authenticated)/investigations/page.tsx`
- `apps/web/src/app/(authenticated)/briefings/page.tsx`

### Updated intelligence support

- `apps/intelligence/src/narad/projections/watchlist_deltas.py`
- `apps/intelligence/src/narad/projections/entity_summaries.py`
- `apps/intelligence/src/narad/projections/regulatory_digest.py`
- `apps/intelligence/src/narad/workers/projection_tasks.py`
- `apps/intelligence/tests/test_smoke.py`

### Minor correctness fix

- `apps/web/src/lib/workspaces/corpwatch.ts`

---

## 9. Outcome

Phase 2C is complete and the NARAD presentation plane is now in place as a real application layer, not just as a prototype translation exercise.

The system now has:

- infrastructure
- backend intelligence processing
- routed analyst workspaces
- live websocket delivery
- verified build and test health

That means **Phase 2 is complete** and the project is ready to move into the next phase with a stable full-stack baseline.
