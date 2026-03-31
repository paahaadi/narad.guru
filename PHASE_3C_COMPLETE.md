# Phase 3C Completion Report — Watchlists Engine, GeoStrat Optimization & Tier 2 Sources

**Date:** 2026-03-31
**Status:** Complete
**Scope:** 20-task implementation plan covering watchlists rule engine, GeoStrat spatial projection optimization, viewport-aware real-time filtering, Tier 2 data adapters, and full-stack workspace UI.

---

## Track 1: Watchlists Engine (Tasks 2–3, 13–17)

### Rule Evaluation Engine
- **`apps/intelligence/src/narad/services/rule_evaluation.py`** — JSON Logic rule evaluation via `json-logic-qubit`. Evaluates all active rules against event/entity trigger context, creates alerts with severity override support, and implements episode grouping (same watchlist + cluster + 1-hour window).
- **Pipeline wiring** — `projection_tasks.py` dispatches `evaluate_rules_for_event` and `evaluate_rules_for_entity` Celery tasks after enrichment completes.

### Watchlists API Layer
- **REST endpoints** — 6 routes under `/api/watchlists`:
  - `GET /api/watchlists` — list all watchlists
  - `POST /api/watchlists` — create watchlist
  - `GET /api/watchlists/:id` — detail view
  - `GET /api/watchlists/:id/rules` — list rules
  - `POST /api/watchlists/:id/rules` — create rule with JSON Logic condition
  - `PATCH /api/watchlists/alerts/:id` — alert status transition with state machine validation
  - `GET /api/watchlists/metrics` — aggregate KPIs
- **Authentication** — all endpoints protected via `requireApiSession` + middleware matcher.
- **Data layer** — `watchlists.ts` with full CRUD: `getWatchlistMetrics()`, `listWatchlists()`, `getWatchlist()`, `listWatchlistRules()`, `listWatchlistAlerts()`, `getWatchlistsWorkspaceData()`.
- **Client SDK** — `watchlists-client.ts` with typed fetch helpers for browser-side consumption.

### Interactive Workspace UI
- **Zustand store** (`stores/watchlists-store.ts`) — manages selected watchlist, active tab, alerts, rules, filters, and creation state.
- **Directory panel** — categorized watchlist list with inline creation form.
- **Watchlist detail** — 4-tab layout (Overview, Alerts, Rules, History) with full data binding.
- **Rule builder** — form-based JSON Logic condition builder with field/operator/value rows, severity override, and live JSON preview.
- **Alert list** — filterable by severity/status, expandable cards with episode/trigger details and triage action buttons implementing the full state machine (new → triaged → assigned → acknowledged → in_progress → resolved).
- **Assistant rail** — contextual insights (paused watchlists, missing rules, critical untriaged alerts) + server-generated recommendations.

### Alert Lifecycle State Machine
```
new → triaged → assigned → acknowledged → in_progress → resolved
  ↓        ↓         ↓           ↓              ↓
  └────────┴─────────┴───────────┴──────────────→ suppressed
```

---

## Track 2: GeoStrat Optimization (Tasks 4–7, 19)

### Spatial Projection
- **`projections/geostrat.py`** — `upsert_geostrat_projection()` materializes geolocated events into `projections.geostrat_events` with GiST spatial index, eliminating runtime geometry filters.
- **Celery task** (`rebuild_geostrat_projection`) publishes Redis deltas with longitude/latitude for viewport-aware filtering.
- **Frontend migration** — `listGeoEvents()`, `renderEventTile()`, and `getGeoStratKpis()` all now query `projections.geostrat_events` instead of `core.events`.

### Viewport-Aware Gateway
- **Gateway contracts** — `ViewportBounds`, `ViewportMessage`, `ClientMessage` types.
- **Server-side filtering** — `isWithinViewport()` with 10% margin buffer; `buildChannelPredicate()` checks viewport for `narad:geostrat:` channels.
- **Client reporting** — `geostrat-store.ts` tracks `viewportBounds` and sends viewport updates to gateway.

### Backfill Service
- **`services/backfill.py`** — one-shot `backfill_geostrat_projections()` migrates all existing geolocated events to the projection table.

---

## Track 3: Tier 2 Data Adapters (Tasks 8–12)

| Adapter | Source | Doc Type | Geometry | Frequency |
|---------|--------|----------|----------|-----------|
| `tier2/acled.py` | ACLED Conflict API | event | lat/lon from conflict records | Hourly |
| `tier2/firms.py` | NASA FIRMS | event | fire hotspot coordinates | Hourly |
| `tier2/opensky.py` | OpenSky Network | telemetry | aircraft position | 15 min |
| `tier2/gdelt.py` | GDELT Global News | article | N/A (text-only) | Hourly |

- **Config** — 6 new settings fields: `acled_api_key`, `acled_email`, `firms_map_key`, `opensky_username`, `opensky_password`, `gdelt_enabled`.
- **Seed migration** (`015_tier2_sources.sql`) — seeds 4 source records in `core.sources`.

---

## Database Migrations

| Migration | Purpose |
|-----------|---------|
| `014_phase_3c_watchlists_geostrat.sql` | GeoStrat projection table with GiST index, watchlist schema extensions (category, is_priority, folder_path, episode_id), RBAC grants |
| `015_tier2_sources.sql` | Seed records for ACLED, FIRMS, OpenSky, GDELT sources |

---

## Verification

| Check | Result |
|-------|--------|
| `ruff check src tests` | All checks passed |
| `tsc --noEmit` (typecheck) | Clean |
| `next build` | Successful — all routes compiled |
| `pytest` (39 tests) | 39 passed, 0 failed |

### New Tests
- `test_rule_evaluation.py` — 4 tests: matching rule fires alert, non-matching rule skips, entity context loading, empty rules returns empty
- `test_geostrat_projection.py` — 3 tests: geolocated upsert, non-geolocated delete, invalidated event handling
- `test_tier2_adapters.py` — 4 tests: ACLED conflict parsing, FIRMS hotspot parsing, OpenSky telemetry parsing, GDELT news parsing

---

## File Inventory

### New Files (30)
- `migrations/014_phase_3c_watchlists_geostrat.sql`
- `migrations/015_tier2_sources.sql`
- `apps/intelligence/src/narad/services/rule_evaluation.py`
- `apps/intelligence/src/narad/services/backfill.py`
- `apps/intelligence/src/narad/projections/geostrat.py`
- `apps/intelligence/src/narad/adapters/tier2/__init__.py`
- `apps/intelligence/src/narad/adapters/tier2/acled.py`
- `apps/intelligence/src/narad/adapters/tier2/firms.py`
- `apps/intelligence/src/narad/adapters/tier2/opensky.py`
- `apps/intelligence/src/narad/adapters/tier2/gdelt.py`
- `apps/intelligence/tests/test_rule_evaluation.py`
- `apps/intelligence/tests/test_geostrat_projection.py`
- `apps/intelligence/tests/test_tier2_adapters.py`
- `apps/web/src/lib/workspaces/watchlists-client.ts`
- `apps/web/src/app/api/watchlists/_helpers.ts`
- `apps/web/src/app/api/watchlists/route.ts`
- `apps/web/src/app/api/watchlists/metrics/route.ts`
- `apps/web/src/app/api/watchlists/[watchlistId]/route.ts`
- `apps/web/src/app/api/watchlists/[watchlistId]/rules/route.ts`
- `apps/web/src/app/api/watchlists/alerts/[alertId]/route.ts`
- `apps/web/src/stores/watchlists-store.ts`
- `apps/web/src/features/watchlists/watchlists-workspace.tsx`
- `apps/web/src/features/watchlists/directory-panel.tsx`
- `apps/web/src/features/watchlists/watchlist-detail.tsx`
- `apps/web/src/features/watchlists/alert-list.tsx`
- `apps/web/src/features/watchlists/rule-builder.tsx`
- `apps/web/src/features/watchlists/assistant-rail.tsx`

### Modified Files (8)
- `apps/intelligence/src/narad/config.py` — Tier 2 adapter settings
- `apps/intelligence/src/narad/workers/projection_tasks.py` — rule evaluation + geostrat projection tasks
- `apps/intelligence/src/narad/workers/enrichment_tasks.py` — rule evaluation dispatch
- `apps/intelligence/pyproject.toml` — json-logic-qubit dependency
- `apps/web/src/lib/workspaces/watchlists.ts` — workspace data type + function
- `apps/web/src/lib/geostrat.ts` — migrated to geostrat projection
- `apps/web/src/features/workspaces/live-workspaces.tsx` — delegates to interactive workspace
- `apps/web/src/middleware.ts` — API route protection
- `apps/gateway/src/contracts.ts` — viewport types
- `apps/gateway/src/server.ts` — viewport-aware filtering
- `apps/gateway/src/channels.ts` — isWithinViewport helper
- `apps/web/src/stores/geostrat-store.ts` — viewport bounds state

---

## Architecture Summary

Phase 3C completes the NARAD V2 three-plane architecture with production-ready:

1. **Watchlists Engine** — JSON Logic rule evaluation → automated alert generation → episode grouping → full lifecycle triage workflow
2. **GeoStrat Optimization** — CQRS projection + GiST index eliminates N+1 geometry queries; viewport-aware gateway filtering reduces WebSocket bandwidth
3. **Tier 2 Sources** — 4 new adapters expanding India coverage from government-only to conflict, fire, aviation, and global news signals
4. **Interactive Workspace** — Full CRUD workspace with directory, detail tabs, rule builder, alert triage, and contextual AI assistant rail
