# NARAD V2 — Phase 3C Implementation Plan
## Watchlists Engine + GeoStrat Optimization + Tier 2 Sources

**Date:** 2026-03-28
**Design Spec:** `docs/superpowers/specs/2026-03-28-phase-3c-watchlists-geostrat-design.md`
**Estimated Tasks:** 20 implementation steps

---

## Task Sequence

### Task 1: Database Migration `014_phase_3c_watchlists_geostrat.sql`

**What:** Add GeoStrat projection table, watchlist folder/priority columns, and alert episode support.

**Files:**
- Create `migrations/014_phase_3c_watchlists_geostrat.sql`

**Details:**
- CREATE TABLE `projections.geostrat_events` with GiST index on geometry
- ALTER TABLE `workflow.watchlists` — add `category`, `is_priority`, `folder_path`
- ALTER TABLE `workflow.watchlist_alerts` — add `episode_id`
- Indexes for category, priority, and episode queries
- GRANT permissions

**Depends on:** Phase 3B complete

---

### Task 2: JSON Logic Rule Evaluation Engine

**What:** Build the core rule evaluation service that fires alerts when conditions match.

**Files:**
- Create `apps/intelligence/src/narad/services/rule_evaluation.py`
- Edit `apps/intelligence/pyproject.toml` (add `json-logic-qubit` dependency)

**Details:**
- Install `json-logic-qubit` (Python JSON Logic evaluator)
- `evaluate_watchlist_rules(tenant_id, trigger)`:
  1. Fetch all active rules: `SELECT * FROM workflow.watchlist_rules WHERE watchlist_id IN (SELECT id FROM workflow.watchlists WHERE tenant_id = $1 AND is_active = TRUE) AND is_active = TRUE`
  2. Build evaluation context from trigger (event or entity fields)
  3. For each rule: evaluate JSON Logic condition against context
  4. If match: create alert with severity, title, summary
  5. Check for episode grouping (same watchlist, same trigger cluster, within 1 hour)
  6. Assign `episode_id` if episode exists, else create new episode
- Rate limit: max 1000 rule evaluations per event to prevent cascade

**Depends on:** Task 1

---

### Task 3: Wire Rule Evaluation into Pipeline

**What:** Hook rule evaluation into the enrichment pipeline so it fires automatically.

**Files:**
- Edit `apps/intelligence/src/narad/workers/enrichment_tasks.py`
- Edit `apps/intelligence/src/narad/workers/projection_tasks.py`

**Details:**
- After `canonicalize_event()` completes: enqueue `evaluate_rules_for_event(event_id)` on projection queue
- After entity risk_score/health_score changes: enqueue `evaluate_rules_for_entity(entity_id)`
- `evaluate_rules_for_event` task:
  1. Load event from DB
  2. Call `evaluate_watchlist_rules(tenant_id, event)`
  3. For each fired alert: enqueue `rebuild_watchlist_deltas(alert_id)`
  4. Publish delta to `narad:watchlist:delta`
- Celery retry: 3 attempts with exponential backoff

**Depends on:** Task 2

---

### Task 4: GeoStrat Projection Rebuilder

**What:** Build the projection rebuilder that populates `projections.geostrat_events`.

**Files:**
- Create `apps/intelligence/src/narad/projections/geostrat.py`
- Edit `apps/intelligence/src/narad/workers/projection_tasks.py`

**Details:**
- `upsert_geostrat_projection(database, tenant_id, event_id)`:
  1. Fetch event from `core.events` WHERE geometry IS NOT NULL AND status != 'invalidated'
  2. UPSERT into `projections.geostrat_events`
  3. Include `longitude` and `latitude` in delta envelope for viewport filtering
  4. Publish to `narad:geostrat:event`
- Wire into pipeline: after event canonicalization, parallel with pulseboard projection
- Backfill task: one-time task to project all existing geolocated events

**Depends on:** Task 1

---

### Task 5: GeoStrat Frontend Migration

**What:** Update GeoStrat data layer to read from projection table instead of `core.events`.

**Files:**
- Edit `apps/web/src/lib/geostrat.ts`

**Details:**
- `getGeoStratKpis()`: rewrite queries to use `projections.geostrat_events`
  - Simpler: no need for `WHERE status != 'invalidated' AND geometry IS NOT NULL` (projection guarantees these)
- `listGeoEvents()`: query `projections.geostrat_events` with bbox
- `renderEventTile()`: MVT generation from `projections.geostrat_events`
- `listGeoLayers()`: unchanged (already reads `geo_intelligence.layer_configs`)
- Verify all API routes still work with new data source

**Depends on:** Task 4

---

### Task 6: Viewport-Aware Gateway Filtering

**What:** Extend the WebSocket gateway to accept viewport bounds and filter GeoStrat events spatially.

**Files:**
- Edit `apps/gateway/src/contracts.ts` (add ViewportBounds type, viewport message type)
- Edit `apps/gateway/src/server.ts` (handle viewport messages, filter GeoStrat deltas)
- Edit `apps/gateway/src/channels.ts` (add viewport filtering logic)

**Details:**
- New message type: `{ type: "viewport", bounds: { west, south, east, north } }`
- Store viewport per client in `GatewayClientState`
- Extend `buildChannelPredicate()`:
  - For `narad:geostrat:event` channel: check if envelope's longitude/latitude falls within client viewport
  - Add 10% margin to viewport bounds (buffer for edge cases)
  - Non-geo channels: no viewport filtering (pass through as before)
- Delta envelope for GeoStrat must include `longitude` and `latitude` in `changes` object

**Depends on:** Task 4

---

### Task 7: Client-Side Viewport Reporting

**What:** Make the GeoStrat map send viewport updates to the gateway.

**Files:**
- Edit `apps/web/src/features/geostrat/geostrat-workspace.tsx`
- Edit `apps/web/src/stores/geostrat-store.ts`

**Details:**
- On map `moveend` event: update Zustand store with new bounds
- Debounce viewport updates to 500ms (prevent flooding during pan/zoom)
- Send viewport message to gateway WebSocket connection
- On initial connection: send viewport immediately after subscribe

**Depends on:** Task 6

---

### Task 8: ACLED Adapter

**What:** Build the ACLED conflict event adapter.

**Files:**
- Create `apps/intelligence/src/narad/adapters/tier2/acled.py`

**Details:**
- API endpoint: `https://api.acleddata.com/acled/read`
- Auth: API key + email in query params
- Query: `country=India`, `event_date_start=<since>`, paginated (limit=500)
- Extract: event_date, event_type, sub_event_type, actor1, actor2, fatalities, notes, latitude, longitude
- Map event types: battles → armed_conflict, protests → civil_unrest, riots → civil_unrest, strategic_developments → strategic_development
- Geometry: Point from lat/lon
- Severity: based on fatalities count (>10 = critical, >3 = high, >0 = medium, else low)
- Register in adapter registry

**Depends on:** Phase 3A adapter framework

---

### Task 9: NASA FIRMS Adapter

**What:** Build the fire/thermal anomaly adapter.

**Files:**
- Create `apps/intelligence/src/narad/adapters/tier2/firms.py`

**Details:**
- API endpoint: `https://firms.modaps.eosdis.nasa.gov/api/area/csv/<MAP_KEY>/VIIRS_SNPP_NRT/IND/1`
- Auth: MAP_KEY in URL path
- Format: CSV response
- Extract: latitude, longitude, brightness, confidence, acq_date, acq_time, satellite, frp
- Geometry: Point from lat/lon
- Event type: `fire_thermal_anomaly`
- Severity: based on confidence (>80% = high, >50% = medium, else low)
- Dedup: same lat/lon within 1km and 6 hours = same fire
- Register in adapter registry

**Depends on:** Phase 3A adapter framework

---

### Task 10: OpenSky Network Adapter

**What:** Build the aircraft telemetry adapter.

**Files:**
- Create `apps/intelligence/src/narad/adapters/tier2/opensky.py`

**Details:**
- API endpoint: `https://opensky-network.org/api/states/all?lamin=6&lomin=68&lamax=36&lomax=98`
- Auth: optional basic auth (anonymous = 100 req/day)
- Format: JSON state vectors
- Extract: icao24, callsign, origin_country, longitude, latitude, baro_altitude, velocity, heading, on_ground
- **Special handling:** Aircraft telemetry goes to TimescaleDB hypertable (`core.telemetry`), NOT `core.events`
  - Too high volume (~5000 positions per poll)
  - 7-day retention policy handles cleanup
  - GeoStrat reads from telemetry directly for aircraft layer
- Cadence: every 60 seconds
- Register in adapter registry

**Depends on:** Phase 3A adapter framework

---

### Task 11: GDELT Adapter

**What:** Build the global news event adapter.

**Files:**
- Create `apps/intelligence/src/narad/adapters/tier2/gdelt.py`

**Details:**
- API: GDELT 2.0 GKG API with India filter
- Format: Tab-delimited CSV
- Extract: date, source_url, themes, locations, tone, num_articles
- Geometry: from location coordinates (where available)
- Event type: map CAMEO codes to NARAD event types
- Filter: only India-related events (actor geo or event geo in India bounds)
- Cadence: every 15 minutes
- Dedup: by source_url + event_date
- Register in adapter registry

**Depends on:** Phase 3A adapter framework

---

### Task 12: Tier 2 Source Seed Data

**What:** Add Tier 2 source records to the database and config.

**Files:**
- Create `migrations/015_tier2_sources.sql`
- Edit `.env.example` (add ACLED, FIRMS, OpenSky, GDELT config)
- Edit `apps/intelligence/src/narad/config.py`

**Details:**
- INSERT 4 source records (ACLED, FIRMS, OpenSky, GDELT) into `core.sources`
- Trust tier: 2 for all
- Poll intervals: ACLED=3600s, FIRMS=900s, OpenSky=60s, GDELT=900s
- Add env vars: `ACLED_API_KEY`, `ACLED_EMAIL`, `FIRMS_MAP_KEY`, `OPENSKY_USERNAME`, `OPENSKY_PASSWORD`, `GDELT_ENABLED`

**Depends on:** Tasks 8–11

---

### Task 13: Watchlists API Routes (Backend)

**What:** Create Next.js API routes for the Watchlists workspace.

**Files:**
- Create `apps/web/src/app/api/watchlists/route.ts` (list watchlists)
- Create `apps/web/src/app/api/watchlists/[watchlistId]/route.ts` (detail)
- Create `apps/web/src/app/api/watchlists/[watchlistId]/alerts/route.ts` (alerts)
- Create `apps/web/src/app/api/watchlists/[watchlistId]/rules/route.ts` (rules CRUD)
- Create `apps/web/src/app/api/watchlists/[watchlistId]/items/route.ts` (tracked items)
- Create `apps/web/src/app/api/watchlists/[watchlistId]/deltas/route.ts` (change feed)
- Create `apps/web/src/app/api/watchlists/alerts/[alertId]/route.ts` (alert actions)
- Create `apps/web/src/app/api/watchlists/metrics/route.ts` (dashboard KPIs)

**Details:**
- List: paginated, filterable by category/priority/status
- Detail: watchlist + summary stats
- Alerts: paginated with status filter, PATCH for status transitions
- Rules: CRUD, POST validates JSON Logic syntax
- Items: list tracked entities/events
- Deltas: recent changes feed
- Alert actions: triage/assign/acknowledge/resolve/suppress
- Metrics: aggregate counts for dashboard strip
- All routes: auth required, tenant scoped
- Add `/api/watchlists` to middleware PROTECTED_PREFIXES

**Depends on:** Tasks 2, 3

---

### Task 14: Watchlists Data Layer (Frontend)

**What:** Rewrite the Watchlists data adapter for full functionality.

**Files:**
- Rewrite `apps/web/src/lib/workspaces/watchlists.ts`
- Create `apps/web/src/lib/workspaces/watchlists-types.ts`

**Details:**
- Types: `Watchlist`, `WatchlistAlert`, `WatchlistRule`, `WatchlistDelta`, `WatchlistMetrics`, `WatchlistItem`
- Fetch functions: `getWatchlists()`, `getWatchlistDetail()`, `getAlerts()`, `getRules()`, `getDeltas()`, `getMetrics()`
- Mutation functions: `updateAlertStatus()`, `createRule()`, `updateRule()`, `deleteRule()`
- React Query: cache watchlists for 2 min, alerts for 30s (near real-time)

**Depends on:** Task 13

---

### Task 15: Watchlists Workspace Page

**What:** Build the full Watchlists workspace matching the prototype.

**Files:**
- Rewrite `apps/web/src/app/(authenticated)/watchlists/page.tsx`
- Create `apps/web/src/features/watchlists/watchlists-workspace.tsx`
- Create `apps/web/src/features/watchlists/metrics-strip.tsx`
- Create `apps/web/src/features/watchlists/directory-panel.tsx`
- Create `apps/web/src/features/watchlists/watchlist-detail.tsx`
- Create `apps/web/src/features/watchlists/alert-list.tsx`
- Create `apps/web/src/features/watchlists/rule-builder.tsx`
- Create `apps/web/src/features/watchlists/assistant-rail.tsx`
- Create `apps/web/src/stores/watchlists-store.ts`

**Details:**
- 3-column layout: Directory (3) | Detail (6) | Assistant (3)
- Metrics strip: 5 KPI cards with real data
- Directory: hierarchical list with alert count badges
- Detail: 6 tabs (Overview, Changes, Items, Alerts, Rules, History)
- Alert list: filterable, with action buttons for status transitions
- Rule builder: form-based with JSON Logic preview
- Assistant rail: suggested rules + contextual documents
- Zustand store: selected watchlist, active tab, alert filters

**Depends on:** Task 14

---

### Task 16: Rule Builder Component

**What:** Build the form-based rule builder that generates JSON Logic.

**Files:**
- Create `apps/web/src/features/watchlists/rule-builder.tsx`
- Create `apps/web/src/features/watchlists/rule-condition-row.tsx`

**Details:**
- Each condition row: [field dropdown] [operator dropdown] [value input]
- Available fields: event_type, severity, confidence, state_code, district_code, entity_type, entity_name, risk_score, health_score, source_count
- Available operators: equals, not_equals, greater_than, less_than, is_one_of, contains
- AND/OR combinator toggle
- Add/remove condition buttons
- JSON Logic preview panel (read-only)
- "Test Rule" button: evaluate against last 100 events, show match count
- "Save" button: POST to API with generated JSON Logic
- Severity override selector

**Depends on:** Task 14

---

### Task 17: Alert Triage UI

**What:** Build the alert action UI for status transitions.

**Files:**
- Create `apps/web/src/features/watchlists/alert-actions.tsx`
- Create `apps/web/src/features/watchlists/alert-detail-drawer.tsx`

**Details:**
- Each alert row: severity badge, title, triggered time, assigned_to, status badge
- Action buttons per status (see spec Section 3.6)
- Click alert → opens detail drawer with full context:
  - Alert summary and metadata
  - Triggering event/entity details
  - Rule that fired
  - Episode context (other alerts in same episode)
  - Action buttons
- Bulk select: checkbox on each alert, bulk action bar at top
- Optimistic UI updates on status change

**Depends on:** Task 15

---

### Task 18: Integration Tests

**What:** Test rule evaluation, GeoStrat projection, viewport filtering, and Tier 2 adapters.

**Files:**
- Create `apps/intelligence/tests/test_rule_evaluation.py`
- Create `apps/intelligence/tests/test_geostrat_projection.py`
- Create `apps/intelligence/tests/test_tier2_adapters.py`

**Details:**
- Rule evaluation: create rules with various JSON Logic, fire test events, verify alerts created
- Episode grouping: fire related events, verify same episode_id
- GeoStrat projection: insert event with geometry, verify projection row created
- Viewport filtering: test gateway spatial filter function with known bounds
- Tier 2 adapters: parse fixture data, verify RawDocument output
- Alert lifecycle: transition through all states, verify timestamps set

**Depends on:** Tasks 2–11

---

### Task 19: Backfill Existing Events to GeoStrat Projection

**What:** One-time migration task to project all existing geolocated events.

**Files:**
- Create `apps/intelligence/src/narad/services/backfill.py`

**Details:**
- One-shot Celery task: `backfill_geostrat_projections()`
  1. SELECT all events from `core.events` WHERE geometry IS NOT NULL AND status != 'invalidated'
  2. For each: UPSERT into `projections.geostrat_events`
  3. Log progress every 100 events
- Idempotent: safe to run multiple times (upsert)
- Run once after migration 014 is applied

**Depends on:** Task 4

---

### Task 20: End-to-End Verification

**What:** Full system verification with all Phase 3C components.

**Steps:**
1. Apply migrations 014 + 015
2. Run GeoStrat backfill task
3. Start all services, verify Tier 2 sources begin polling
4. Verify ACLED events appear on GeoStrat map (conflict markers)
5. Verify FIRMS hotspots appear on GeoStrat (fire markers)
6. Verify OpenSky aircraft appear on GeoStrat (flight layer from telemetry)
7. Verify GeoStrat KPIs read from projection table (check query logs)
8. Create a watchlist with a simple rule (alert when severity=critical)
9. Wait for a critical event from any source
10. Verify alert fires and appears in Watchlists workspace
11. Triage the alert → verify status transitions work
12. Pan GeoStrat map → verify viewport-aware filtering (check gateway logs)
13. Type check: `npm run typecheck` on web and gateway (0 errors)
14. Build: `npm run build` (0 warnings)

**Depends on:** All previous tasks

---

## Dependency Graph

```
Task 1 (migration) ──────────────────────────────────────────┐
                                                              │
Task 2 (rule eval engine) ←── T1                              │
Task 3 (wire rules to pipeline) ←── T2                        │
                                                              │
Task 4 (GeoStrat projection rebuilder) ←── T1                │
Task 5 (GeoStrat frontend migration) ←── T4                  │
Task 6 (viewport gateway filtering) ←── T4                   │
Task 7 (client viewport reporting) ←── T6                    │
                                                              │
Task 8 (ACLED adapter) ──┐                                    │
Task 9 (FIRMS adapter) ──┤ (parallel, independent)            │
Task 10 (OpenSky adapter) ┤                                   │
Task 11 (GDELT adapter) ──┘                                   │
Task 12 (Tier 2 seed data) ←── T8–T11                        │
                                                              │
Task 13 (Watchlists API) ←── T2, T3                           │
Task 14 (Watchlists data layer) ←── T13                       │
Task 15 (Watchlists workspace page) ←── T14                   │
Task 16 (Rule builder UI) ←── T14                             │
Task 17 (Alert triage UI) ←── T15                             │
                                                              │
Task 18 (integration tests) ←── T2–T11                        │
Task 19 (GeoStrat backfill) ←── T4                            │
Task 20 (e2e verification) ←── all                            │
```

**Three parallel tracks:**
1. GeoStrat optimization (Tasks 4–7, 19)
2. Watchlists engine (Tasks 2–3, 13–17)
3. Tier 2 adapters (Tasks 8–12)

All three converge at integration tests (18) and final verification (20).

---

## Estimated Scope

| Category | New/Modified Files | Approximate Lines |
|---|---|---|
| Migrations | 2 new | ~80 |
| Backend services | 3 new | ~500 |
| Backend projections | 1 new | ~100 |
| Backend adapters | 4 new | ~600 |
| Backend workers | 2 modified | ~200 |
| Frontend API routes | 8 new | ~500 |
| Frontend data layer | 2 new/modified | ~350 |
| Frontend components | 10 new | ~2,000 |
| Frontend pages | 1 rewritten | ~200 |
| Gateway | 3 modified | ~100 |
| Stores | 1 new | ~80 |
| Tests | 3 new | ~500 |
| Config | 2 modified | ~40 |
| **Total** | **~42 files** | **~5,250 lines** |

---

## Phase 3 Cumulative Summary

| Sub-phase | Focus | Files | Lines |
|---|---|---|---|
| **3A** | Live Intelligence Loop | ~27 | ~2,800 |
| **3B** | CorpWatch + LexPulse | ~43 | ~4,390 |
| **3C** | Watchlists + GeoStrat + Tier 2 | ~42 | ~5,250 |
| **Phase 3 Total** | | **~112 files** | **~12,440 lines** |

This roughly doubles the application codebase from Phase 2's 10,510 lines to ~23,000 lines.
