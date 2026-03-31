# NARAD V2 — Phase 3B Complete: CorpWatch + LexPulse Workspace Deepening

**Phase:** 3B of 7  
**Session:** CorpWatch + LexPulse Workspace Deepening  
**Status:** Complete  
**Started:** 2026-03-28  
**Completed:** 2026-03-29  
**Depends on:** Phase 2C — Presentation Plane, Phase 3A — Live Intelligence Loop

---

## Table of Contents

1. [Direct Answer](#1-direct-answer)
2. [Purpose of Phase 3B](#2-purpose-of-phase-3b)
3. [What Phase 3B Produced](#3-what-phase-3b-produced)
4. [What Was Completed in the Final Phase 3B Pass](#4-what-was-completed-in-the-final-phase-3b-pass)
5. [Why This Work Was Done](#5-why-this-work-was-done)
6. [Technology Stack and Why It Was Used](#6-technology-stack-and-why-it-was-used)
7. [Verification Results](#7-verification-results)
8. [Key File Inventory](#8-key-file-inventory)
9. [Outcome](#9-outcome)

---

## 1. Direct Answer

**Yes. Phase 3B is complete.**

This means the locked Phase 3B contract is now satisfied:

- multilingual-aware ingest and translation support are wired into the intelligence plane
- entity narrative and regulatory answer generation are implemented on the backend
- CorpWatch now ships as an interactive search and entity-analysis workflow, not only a staged Phase 2C shell
- LexPulse now ships as an interactive regulatory terminal with query, digest, watchlist, forecast, and feedback flows
- dedicated web API routes and adapters exist for both workspaces
- the web app and intelligence service passed fresh verification after the final Phase 3B implementation pass

No new database migration was required for this phase because the work deepened behavior on top of the existing Phase 2C and 3A schema and projection contracts.

---

## 2. Purpose of Phase 3B

Phase 3B turns CorpWatch and LexPulse from routed presentation surfaces into real operating workspaces.

Its purpose is:

- to deepen the backend so entity narratives, translated evidence, and legal/regulatory answers can be generated from current intelligence data
- to expose those capabilities through explicit web API contracts instead of generic staged adapters
- to replace the old Phase 2C placeholder screens with interactive operator flows
- to prove that the new workspace depth still compiles and builds cleanly in production mode

In practical terms, Phase 3B is where two important analyst workspaces stop being "present but shallow" and become usable investigation tools.

---

## 3. What Phase 3B Produced

### Intelligence and synthesis depth

- translation-aware ingest support
- entity narrative generation
- regulatory question-answer synthesis
- sector forecast projection support for LexPulse
- backend tests covering translation, narratives, and RAG-style answer generation

### CorpWatch depth

- dedicated entity search API
- dedicated entity profile, graph, filings, events, and narrative APIs
- interactive `/corpwatch` search desk
- interactive `/corpwatch/[entityId]` entity workspace

### LexPulse depth

- dedicated regulatory query API
- dedicated watchlists, digests, digest detail, sectors, and feedback APIs
- interactive `/lexpulse` terminal experience
- digest evidence, sector exposure, and analyst feedback handling

### Delivery hardening

- tenant-aware web adapters for both workspaces
- browser-safe client API modules for interactive screens
- browser-safe formatting helpers so Node-only database code is not pulled into the client bundle

---

## 4. What Was Completed in the Final Phase 3B Pass

### 4.1 Backend intelligence services were completed for translation, narratives, and regulatory answers

The intelligence plane was extended across translation, ingest enrichment, narrative generation, and regulatory synthesis.

What this achieved:

- translated or normalized text can participate in downstream processing
- CorpWatch can request a current narrative for an entity instead of only showing read-model fragments
- LexPulse can answer analyst questions through a dedicated backend path rather than only surfacing digest cards

### 4.2 CorpWatch and LexPulse web APIs were completed

Route handlers were added and aligned for:

- CorpWatch search, profile, graph, filings, events, and narrative
- LexPulse query, watchlists, digests, digest detail, sectors, and feedback

What this achieved:

- both workspaces now have explicit route-level contracts
- the UI no longer depends on the generic Phase 2C staged-only surface
- backend depth is exposed through clear tenant-aware APIs

### 4.3 CorpWatch was upgraded from a staged route to an interactive workspace

The old `/corpwatch` page was replaced with an interactive search desk and a new `/corpwatch/[entityId]` route was added for entity detail.

What this achieved:

- analysts can search entities directly
- analysts can inspect profile, graph, filings, events, and narrative in one flow
- the route now behaves like a real workspace instead of a Phase 2C placeholder shell

### 4.4 LexPulse was upgraded from a staged route to an interactive regulatory terminal

The old `/lexpulse` page was replaced with an interactive terminal-style workspace backed by the new API layer.

What this achieved:

- analysts can submit regulatory questions directly from the workspace
- answer panels now include direct answer, what changed, why it matters, affected sectors, and confidence
- digest detail, watchlists, sector forecasts, and feedback are now part of one integrated surface

### 4.5 A real client/server boundary bug was found and fixed during the closeout

The first integrated production build exposed a Next.js bundling failure: client components were importing modules that also pulled in `pg` through shared server-side helpers.

The final pass fixed this by:

- creating browser-safe client API modules for CorpWatch and LexPulse
- moving date/metric formatting helpers into a browser-safe utility module
- keeping projection/database helpers on the server side

Why this mattered:

- the feature could not be considered complete while production build still failed
- this correction keeps the architecture honest: server reads on the server, interactive fetch logic in client-safe modules

### 4.6 Verification was rerun against the final integrated state

The final pass reran intelligence verification and web verification after all backend and UI changes were in place.

What this achieved:

- the backend changes are covered by passing checks and tests
- the web app now typechecks and builds successfully with the new interactive workspaces
- protected route resolution was validated on a live local server

---

## 5. Why This Work Was Done

The completion work had one goal: remove the gap between "CorpWatch and LexPulse exist as routes" and "CorpWatch and LexPulse are complete Phase 3B workspaces."

Each completed item served that goal:

- **translation-aware ingest support** was done so multilingual and normalized evidence can flow into downstream intelligence features
- **narrative and regulatory synthesis** were done so workspace depth comes from backend reasoning instead of only UI formatting
- **dedicated API routes** were done so both workspaces have stable contracts rather than relying on generic staged adapters
- **interactive route upgrades** were done so the operator experience matches the intended Phase 3B scope
- **client/server boundary fixes** were done so production build health matches implementation intent
- **fresh verification** was done so Phase 3B completion is backed by evidence, not by partial implementation

In short:

- the work was done to make CorpWatch and LexPulse operationally deeper
- it was also done to preserve good boundaries between backend intelligence, route APIs, and interactive UI composition

---

## 6. Technology Stack and Why It Was Used

### Intelligence services

- **Python 3.12**
  - used for the intelligence plane, ingest services, synthesis logic, and verification
- **Celery workers**
  - used for ingest and enrichment execution paths that support the live intelligence loop
- **FastAPI-backed intelligence APIs**
  - used for backend service contracts around CorpWatch and LexPulse behavior

Why:

- Phase 3B needed to deepen intelligence behavior where the data and enrichment pipelines already live

### Data and projections

- **PostgreSQL read models and projections**
  - used for entity summaries, regulatory digests, and workspace-facing state
- **tenant-aware server reads through `pg`**
  - used for authenticated route data and API handlers

Why:

- both workspaces depend on stable read models rather than ad hoc in-memory composition

### Web application

- **Next.js 15**
  - used for App Router pages, protected route composition, and route handlers
- **React 19**
  - used for the interactive CorpWatch and LexPulse client surfaces
- **TypeScript**
  - used to keep workspace, API, and evidence contracts explicit

Why:

- Phase 3B required route-level interactivity without abandoning the existing protected application shell

### Verification tooling

- **`ruff`**
  - used for backend lint/static verification
- **`pytest`**
  - used for backend behavior verification
- **`compileall`**
  - used to catch Python syntax/import problems
- **`tsc --noEmit`**
  - used for strict web type verification
- **`next build`**
  - used to validate the production web bundle and route graph

These technologies were chosen because they directly match the Phase 3B problem:

- Python services for intelligence depth
- Postgres projections for stable workspace reads
- Next.js and React for interactive protected routes
- strict verification to prove the final integrated state

---

## 7. Verification Results

### Backend verification

- `uv run --directory apps/intelligence ruff check src tests`
  - passed
- `uv run --directory apps/intelligence pytest -q`
  - passed: `28 passed, 1 warning`
- `uv run --directory apps/intelligence python -m compileall src tests`
  - passed

### Web verification

- `npm --prefix apps/web run typecheck`
  - passed
- `npm --prefix apps/web run build`
  - passed

### Route-resolution smoke checks

The built Next.js server was started locally on port `3100` and the new protected Phase 3B routes were checked with `curl -I`.

Observed result:

- `/corpwatch` -> `307 Temporary Redirect` to `/access-denied?from=%2Fcorpwatch`
- `/corpwatch/staged-corpwatch` -> `307 Temporary Redirect` to `/access-denied?from=%2Fcorpwatch%2Fstaged-corpwatch`
- `/lexpulse` -> `307 Temporary Redirect` to `/access-denied?from=%2Flexpulse`

This is the correct unauthenticated behavior for the protected route contract because middleware intercepted the requests before page rendering.

### What this verification proves

- the intelligence service changes compile and pass their current regression suite
- the web app typechecks and builds successfully after the interactive CorpWatch and LexPulse upgrades
- the new protected routes resolve correctly through the application shell and middleware layer

### Verification scope note

An authenticated browser walkthrough was **not** run in this session because the workspace does not provide a local test issuer/private-key path for minting a valid session token. Phase 3B closure is therefore based on:

- passing backend verification
- passing production web verification
- live route-resolution checks against the built local server

### Residual non-blocking warning

- the backend pytest run still emits the existing `google.generativeai` deprecation warning from the intelligence service
- this does not block Phase 3B completion

---

## 8. Key File Inventory

### Intelligence services and tests

- `apps/intelligence/src/narad/config.py`
- `apps/intelligence/src/narad/services/translation.py`
- `apps/intelligence/src/narad/services/ingestion.py`
- `apps/intelligence/src/narad/commands/ingest_document.py`
- `apps/intelligence/src/narad/workers/ingest_tasks.py`
- `apps/intelligence/src/narad/workers/enrichment_tasks.py`
- `apps/intelligence/src/narad/services/rag_query.py`
- `apps/intelligence/src/narad/projections/sector_forecasts.py`
- `apps/intelligence/src/narad/api/corpwatch.py`
- `apps/intelligence/src/narad/api/lexpulse.py`
- `apps/intelligence/tests/test_translation.py`
- `apps/intelligence/tests/test_entity_narrative.py`
- `apps/intelligence/tests/test_rag_query.py`
- `apps/intelligence/tests/test_ingestion.py`

### Web API routes and adapters

- `apps/web/src/app/api/corpwatch/search/route.ts`
- `apps/web/src/app/api/corpwatch/[entityId]/route.ts`
- `apps/web/src/app/api/corpwatch/[entityId]/graph/route.ts`
- `apps/web/src/app/api/corpwatch/[entityId]/filings/route.ts`
- `apps/web/src/app/api/corpwatch/[entityId]/events/route.ts`
- `apps/web/src/app/api/corpwatch/[entityId]/narrative/route.ts`
- `apps/web/src/app/api/lexpulse/query/route.ts`
- `apps/web/src/app/api/lexpulse/watchlists/route.ts`
- `apps/web/src/app/api/lexpulse/digests/route.ts`
- `apps/web/src/app/api/lexpulse/digests/[digestId]/route.ts`
- `apps/web/src/app/api/lexpulse/sectors/route.ts`
- `apps/web/src/app/api/lexpulse/feedback/route.ts`
- `apps/web/src/lib/workspaces/corpwatch.ts`
- `apps/web/src/lib/workspaces/lexpulse.ts`
- `apps/web/src/lib/workspaces/corpwatch-client.ts`
- `apps/web/src/lib/workspaces/lexpulse-client.ts`
- `apps/web/src/lib/workspaces/formatting.ts`

### Interactive workspace routes and components

- `apps/web/src/app/(authenticated)/corpwatch/page.tsx`
- `apps/web/src/app/(authenticated)/corpwatch/[entityId]/page.tsx`
- `apps/web/src/features/corpwatch/corpwatch-search-page.tsx`
- `apps/web/src/features/corpwatch/corpwatch-entity-page.tsx`
- `apps/web/src/app/(authenticated)/lexpulse/page.tsx`
- `apps/web/src/features/lexpulse/lexpulse-terminal.tsx`

---

## 9. Outcome

Phase 3B is complete.

NARAD now has materially deeper CorpWatch and LexPulse workspaces:

- backend synthesis exists for entity narrative, translation-aware ingest, and regulatory answers
- web API contracts exist for both workspaces
- the old staged route shells have been replaced with interactive analyst-facing flows
- the final integrated system passes backend checks, web typecheck/build, and protected-route runtime resolution

This closes the Phase 3B contract and leaves the system ready for the next phase with both workspaces materially closer to their full analyst operating form.
