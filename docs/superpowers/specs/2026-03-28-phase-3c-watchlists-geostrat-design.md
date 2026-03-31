# NARAD V2 — Phase 3C Design Spec
## Watchlists Engine + GeoStrat Optimization + Tier 2 Sources

**Date:** 2026-03-28
**Session:** 3C of Phase 3
**Status:** Draft — pending approval
**Depends on:** Phase 3A (live data flowing), Phase 3B (CorpWatch + LexPulse deepened)
**Builds on:** `narad/watchlists_workspace/code.html`, Phase 2C GeoStrat baseline

---

## 1. Scope

Phase 3C delivers the monitoring layer and closes all Phase 2 deferred optimizations:

**Watchlists Workspace:**
- Rule evaluation engine (JSON Logic against events/entities)
- Alert lifecycle UI (triage, assign, acknowledge, resolve, suppress)
- Watchlist directory with folder organization
- Rule builder interface
- Live alert stream via WebSocket
- Episode grouping for related alerts
- Dashboard metrics strip
- Intelligence assistant with rule suggestions

**GeoStrat Optimization:**
- Dedicated spatial projection (`projections.geostrat_events`) replacing raw `core.events` queries
- Viewport-aware gateway filtering (only send events within client's map bounds)
- GeoStrat projection rebuilder in intelligence plane

**Tier 2 Source Activation:**
- ACLED (conflict/protest events) — geolocated, feeds GeoStrat + PulseBoard
- NASA FIRMS (fire/thermal anomalies) — geolocated, feeds GeoStrat
- OpenSky Network (aircraft telemetry) — live flight data, feeds GeoStrat
- GDELT (global news events) — contextual layer, feeds PulseBoard

**Out of scope:**
- Investigations workspace deepening (Phase 4)
- Briefings workspace deepening (Phase 4)
- Tier 3 sources (Phase 4)
- Full AI assistant with LLM-powered rule generation (simplified version in 3C)

---

## 2. Watchlist Rule Evaluation Engine

### 2.1 JSON Logic Evaluator

The canonical ontology specifies JSON Logic for watchlist rule conditions. Phase 3C implements the evaluation engine.

**Library:** `json-logic-py` (Python implementation of JsonLogic.com standard)

**Evaluation context:** When an event is canonicalized or an entity is updated, the engine evaluates all active rules for the tenant:

```python
async def evaluate_watchlist_rules(tenant_id: UUID, trigger: EventOrEntity):
    """Evaluate all active watchlist rules against a trigger object."""
    rules = await fetch_active_rules(tenant_id)
    context = build_evaluation_context(trigger)

    for rule in rules:
        if json_logic(rule.condition, context):
            await create_alert(
                watchlist_id=rule.watchlist_id,
                rule_id=rule.id,
                severity=rule.severity_override or trigger.severity,
                title=format_alert_title(rule, trigger),
                summary=format_alert_summary(rule, trigger),
                triggered_by_event_id=trigger.id if is_event else None,
                triggered_by_entity_id=trigger.id if is_entity else None,
            )
```

**Evaluation context fields available to rules:**

| Field | Type | Source | Example |
|---|---|---|---|
| `event_type` | string | core.events | "weather_disaster" |
| `severity` | string | core.events | "critical" |
| `confidence` | number | core.events | 0.85 |
| `state_code` | string | core.events | "MH" |
| `district_code` | string | core.events | "Mumbai" |
| `source_count` | number | core.events | 3 |
| `entity_type` | string | core.entities | "company" |
| `entity_name` | string | core.entities | "Reliance Industries" |
| `risk_score` | number | core.entities | 74.5 |
| `health_score` | number | core.entities | 92.4 |
| `sector` | string | entity metadata | "energy" |

**Example rules:**

```json
// Alert when critical weather event in Maharashtra
{
  "and": [
    { "===": [{ "var": "event_type" }, "weather_disaster"] },
    { "===": [{ "var": "severity" }, "critical"] },
    { "===": [{ "var": "state_code" }, "MH"] }
  ]
}

// Alert when entity risk score exceeds threshold
{
  ">": [{ "var": "risk_score" }, 70]
}

// Alert when high-confidence multi-source event
{
  "and": [
    { ">=": [{ "var": "confidence" }, 0.8] },
    { ">=": [{ "var": "source_count" }, 3] }
  ]
}
```

### 2.2 Pipeline Integration

Rule evaluation hooks into the enrichment pipeline:

```
Event Canonicalized → evaluate_watchlist_rules(tenant_id, event)
Entity Updated → evaluate_watchlist_rules(tenant_id, entity)
Alert Created → rebuild_watchlist_deltas(alert_id) → Redis publish
```

The evaluation runs on the `projection` Celery queue (not `enrichment`) to avoid blocking enrichment tasks.

### 2.3 Episode Grouping

Related alerts are grouped into episodes for analyst convenience.

**Grouping criteria:**
- Same watchlist
- Same `triggered_by_event_id` (multiple rules fire on same event)
- OR same `cluster_id` on the triggering events (related events from dedup)
- Within 1-hour temporal window

**Implementation:**
- When creating an alert, check for recent alerts on the same watchlist with overlapping triggers
- If found: assign same `episode_id`
- If not: create new episode (episode_id = alert.id, the first alert)

---

## 3. Watchlists Workspace UI

### 3.1 Layout (matching prototype)

```
┌──────────────────────────────────────────────────────────────────────┐
│ METRICS STRIP (full width)                                            │
│ Watchlists: 142 | Alerts: 2,841 | High Priority: 67 | Regulatory: 12 │
├──────────────┬────────────────────────────────┬──────────────────────┤
│ DIRECTORY    │ WATCHLIST DETAIL               │ ASSISTANT RAIL       │
│ (3 cols)     │ (6 cols)                       │ (3 cols)             │
│              │                                │                      │
│ My Lists     │ [Overview] [Changes] [Items]   │ AI Suggestions       │
│ Team Folders │ [Alerts] [Rules] [History]     │ Suggested Rules      │
│ Geography    │                                │ Contextual Docs      │
│ Infra        │ Geographic map + Alert stream  │                      │
│              │ Risk Velocity + Entity Health   │                      │
│ Priority     │ Signal Quality + Sync Status   │                      │
│ Red Sea...   │                                │                      │
│ Semi-mats... │                                │                      │
└──────────────┴────────────────────────────────┴──────────────────────┘
```

### 3.2 Dashboard Metrics Strip

5 KPI cards computed from live data:

| Metric | Query | Source |
|---|---|---|
| Total Watchlists | `COUNT(*) FROM workflow.watchlists WHERE is_active = TRUE` | Direct query |
| Alerts Triggered (24h) | `COUNT(*) FROM workflow.watchlist_alerts WHERE created_at > now() - '24h'` | Direct query |
| High Priority Changes | Same query with `severity IN ('critical', 'high')` | Direct query |
| New Regulatory Hits | Alerts where `triggered_by_event.event_type IN ('regulatory_action', 'legislative')` | Join query |
| Entity Watch Changes | Alerts triggered by entity updates | Join query |

### 3.3 Directory Panel

Left rail with hierarchical watchlist organization:

- **My Watchlists:** Personal watchlists created by the current user
- **Team Folders:** Shared watchlists (filtered by tenant)
- **Geography / Infrastructure:** Tagged categories from `watchlist.metadata.category`
- **Priority Lists:** Watchlists marked `is_priority = TRUE`

Each entry shows: name, unresolved alert count badge.

Click a watchlist → loads detail in center panel.

### 3.4 Watchlist Detail — Tabbed View

**Tab: Overview (default)**
- Watchlist title, description, status badge, created_by
- Mini geographic heatmap (events from linked alerts, rendered with MapLibre)
- Live alert stream (last 10 alerts, severity-colored)
- Bento metrics: Risk Velocity, Entity Health, Signal Quality, Sync Status

**Tab: Changes**
- Feed of recent `projections.watchlist_deltas` for this watchlist
- Each delta: timestamp, delta_type badge, summary text

**Tab: Tracked Items**
- List of `workflow.watchlist_items` linked to this watchlist
- Each item: entity/event name, type, last activity

**Tab: Alerts**
- Full alert list with status filters (New, Triaged, In Progress, Resolved)
- Each alert: severity badge, title, triggered time, assigned_to, status
- Action buttons: Triage, Assign, Acknowledge, Resolve, Suppress
- Bulk actions: select multiple → batch status change

**Tab: Rules**
- List of `workflow.watchlist_rules` for this watchlist
- Each rule: name, description, severity override, is_active toggle
- Rule condition displayed as human-readable summary
- "Add Rule" button → opens rule builder

**Tab: History**
- Audit trail of watchlist changes (rules added/removed, items added/removed, configuration changes)

### 3.5 Rule Builder

A simplified rule builder for creating JSON Logic conditions:

**UI approach:** Form-based builder (not raw JSON editing)

```
┌─────────────────────────────────────────┐
│ IF                                       │
│  [event_type ▼] [equals ▼] [weather ▼]  │
│ AND                                      │
│  [severity ▼] [is one of ▼] [critical ▼]│
│ AND                                      │
│  [state_code ▼] [equals ▼] [MH ▼]      │
│                                          │
│ THEN alert with severity: [high ▼]       │
│                                          │
│ [+ Add Condition]  [Test Rule]  [Save]   │
└─────────────────────────────────────────┘
```

**Available operators:** equals, not equals, greater than, less than, is one of, contains
**Available fields:** All evaluation context fields from Section 2.2
**Test Rule:** Evaluate against last 100 events, show how many would have triggered

The form-based builder generates JSON Logic behind the scenes. Advanced users can toggle to raw JSON view.

### 3.6 Alert Triage Actions

Each alert supports these status transitions:

| Current Status | Available Actions |
|---|---|
| `new` | Triage, Suppress |
| `triaged` | Assign, Suppress |
| `assigned` | Acknowledge |
| `acknowledged` | Start (→ in_progress) |
| `in_progress` | Resolve |
| Any | Suppress |

Each action: updates `status`, sets timestamp (`triaged_at`, `resolved_at`), records in audit log.

### 3.7 Intelligence Assistant Rail

Simplified AI assistant (full LLM version in Phase 4):

**Rule Suggestions:** Based on recent alert patterns:
- Analyze alerts from last 7 days
- Identify frequent entity types, event types, geographic areas
- Generate 2-3 suggested rules in JSON Logic format
- Display as cards with "Add to Watchlist" button

**Contextual Documents:**
- Documents linked to the most recent alerts
- Displayed as compact cards with title, doc_type icon, source

---

## 4. GeoStrat Spatial Projection

### 4.1 New Projection Table

Replace raw `core.events` queries with a dedicated presentation projection:

```sql
CREATE TABLE projections.geostrat_events (
    event_id UUID PRIMARY KEY REFERENCES core.events(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    title TEXT NOT NULL,
    event_type TEXT NOT NULL,
    severity TEXT NOT NULL,
    confidence NUMERIC(3,2) NOT NULL,
    source_count INTEGER NOT NULL DEFAULT 1,
    occurred_at TIMESTAMPTZ NOT NULL,
    geometry GEOMETRY(Point, 4326) NOT NULL,
    state_code TEXT,
    district_code TEXT,
    cluster_label TEXT,
    projected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON projections.geostrat_events (tenant_id, severity);
CREATE INDEX ON projections.geostrat_events USING gist (geometry);
CREATE INDEX ON projections.geostrat_events (tenant_id, occurred_at DESC);
```

### 4.2 Projection Rebuilder

New projection in the intelligence plane:

```python
async def upsert_geostrat_projection(database, tenant_id, event_id):
    """Rebuild GeoStrat presentation row for one event."""
    event = await database.fetchrow("""
        SELECT id, title, event_type, severity, confidence, source_count,
               occurred_at, geometry, state_code, district_code
        FROM core.events
        WHERE tenant_id = $1 AND id = $2
          AND status != 'invalidated'
          AND geometry IS NOT NULL
    """, tenant_id, event_id)

    if not event:
        return

    await database.execute("""
        INSERT INTO projections.geostrat_events (...)
        VALUES (...)
        ON CONFLICT (event_id)
        DO UPDATE SET ...
    """, ...)

    # Publish delta for viewport-aware delivery
    await publish_delta("narad:geostrat:event", tenant_id, "event", event_id)
```

**Trigger:** Runs after event canonicalization, same as pulseboard projection.

### 4.3 Frontend Migration

Update `apps/web/src/lib/geostrat.ts` to read from `projections.geostrat_events` instead of `core.events`.

**Changes:**
- `getGeoStratKpis()` → query `projections.geostrat_events` for aggregates
- `listGeoEvents()` → query `projections.geostrat_events` with bbox filtering
- `renderEventTile()` → query `projections.geostrat_events` for MVT generation
- `listGeoLayers()` → unchanged (already reads `geo_intelligence.layer_configs`)

**Benefits:**
- Simpler queries (no status/geometry NULL filtering needed — projection only contains valid events)
- Better index utilization (dedicated GiST index on projection geometry)
- Decoupled from write-side schema changes

---

## 5. Viewport-Aware Gateway Filtering

### 5.1 Client Viewport Tracking

The browser sends its current map viewport to the gateway:

```json
{
  "type": "viewport",
  "bounds": {
    "west": 72.8,
    "south": 18.9,
    "east": 73.1,
    "north": 19.2
  }
}
```

The gateway stores viewport per client connection.

### 5.2 Spatial Filtering in Gateway

When a `narad:geostrat:event` delta arrives, the gateway checks if the event falls within each client's viewport:

```typescript
function isWithinViewport(
  viewport: ViewportBounds | null,
  envelope: DeltaEnvelope,
): boolean {
  if (!viewport) return true; // No viewport = send all
  const { longitude, latitude } = envelope.changes as GeoEventDelta;
  if (longitude == null || latitude == null) return true;
  return (
    longitude >= viewport.west &&
    longitude <= viewport.east &&
    latitude >= viewport.south &&
    latitude <= viewport.north
  );
}
```

**Delta envelope extension:** GeoStrat deltas include `longitude` and `latitude` in the `changes` object for viewport filtering without additional DB lookups.

### 5.3 Client-Side Changes

The GeoStrat Zustand store sends viewport updates to the gateway whenever the map viewport changes (debounced to 500ms):

```typescript
// In geostrat-workspace.tsx
useEffect(() => {
  const bounds = mapRef.current?.getBounds();
  if (bounds) {
    gateway.send(JSON.stringify({
      type: "viewport",
      bounds: {
        west: bounds.getWest(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        north: bounds.getNorth(),
      },
    }));
  }
}, [viewport]); // viewport from Zustand store, updated on map move
```

---

## 6. Tier 2 Source Activation

### 6.1 ACLED (Armed Conflict Location & Event Data)

**Access:** REST API with API key + email authentication
**Format:** JSON with structured fields
**Cadence:** Daily (new events published daily)
**Document type:** `article` (conflict/protest event reports)

**Adapter details:**
- Endpoint: `https://api.acleddata.com/acled/read`
- Query params: `country=India`, `event_date_start=<since>`, `limit=500`
- Auth: API key + email in params
- Extract: event_date, event_type, sub_event_type, actor1, actor2, fatalities, notes, latitude, longitude
- Geometry: directly from lat/lon fields
- Event type mapping: `battles` → `armed_conflict`, `protests` → `civil_unrest`, `riots` → `civil_unrest`

### 6.2 NASA FIRMS (Fire Information for Resource Management System)

**Access:** REST API with MAP_KEY
**Format:** CSV or JSON
**Cadence:** Every 15 minutes (near-real-time satellite passes)
**Document type:** `telemetry` (thermal anomaly detections)

**Adapter details:**
- Endpoint: `https://firms.modaps.eosdis.nasa.gov/api/area/csv/<MAP_KEY>/VIIRS_SNPP_NRT/<country>/<days>`
- Extract: latitude, longitude, brightness, confidence, acq_date, acq_time, satellite, frp
- Geometry: directly from lat/lon
- Event type: `fire_thermal_anomaly`
- Severity: based on confidence (>80% = high, >50% = medium, else low)

### 6.3 OpenSky Network (Aircraft Telemetry)

**Access:** REST API with rate limits (anonymous: 100 req/day, authenticated: higher)
**Format:** JSON state vectors
**Cadence:** Every 60 seconds (live flight positions)
**Document type:** `telemetry` (aircraft state vectors)

**Adapter details:**
- Endpoint: `https://opensky-network.org/api/states/all?lamin=6&lomin=68&lamax=36&lomax=98` (India bounding box)
- Extract: icao24, callsign, origin_country, longitude, latitude, baro_altitude, velocity, heading, on_ground
- Geometry: from longitude/latitude
- Event type: `aircraft_telemetry`
- Special handling: OpenSky data is ephemeral — stored in TimescaleDB hypertable, not as canonical events
  - INSERT into `core.telemetry` (hypertable with 7-day retention)
  - NOT inserted into `core.events` (too high volume, ~5000 aircraft at any time)
  - GeoStrat reads directly from telemetry hypertable for aircraft layer

### 6.4 GDELT (Global Database of Events, Language, and Tone)

**Access:** REST API / BigQuery / file download
**Format:** CSV (tab-delimited)
**Cadence:** Every 15 minutes
**Document type:** `article` (news event extractions)

**Adapter details:**
- Endpoint: GDELT 2.0 Events API with India country filter
- Extract: date, source_url, event_code, actor1, actor2, num_articles, tone, geo_lat, geo_lon
- Geometry: from geo_lat/geo_lon
- Event type mapping: CAMEO event codes → NARAD event types
- Filter: only events with India-related actors or geography

### 6.5 Configuration

```env
ACLED_API_KEY=
ACLED_EMAIL=
FIRMS_MAP_KEY=
OPENSKY_USERNAME=
OPENSKY_PASSWORD=
GDELT_ENABLED=true
```

---

## 7. Database Changes

### Migration: `014_phase_3c_watchlists_geostrat.sql`

```sql
-- GeoStrat projection table
CREATE TABLE projections.geostrat_events (
    event_id UUID PRIMARY KEY REFERENCES core.events(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    title TEXT NOT NULL,
    event_type TEXT NOT NULL,
    severity TEXT NOT NULL,
    confidence NUMERIC(3,2) NOT NULL,
    source_count INTEGER NOT NULL DEFAULT 1,
    occurred_at TIMESTAMPTZ NOT NULL,
    geometry GEOMETRY(Point, 4326) NOT NULL,
    state_code TEXT,
    district_code TEXT,
    cluster_label TEXT,
    projected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON projections.geostrat_events (tenant_id, severity);
CREATE INDEX ON projections.geostrat_events USING gist (geometry);
CREATE INDEX ON projections.geostrat_events (tenant_id, occurred_at DESC);

-- Watchlist folder/category support
ALTER TABLE workflow.watchlists ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE workflow.watchlists ADD COLUMN IF NOT EXISTS is_priority BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE workflow.watchlists ADD COLUMN IF NOT EXISTS folder_path TEXT DEFAULT '/';

CREATE INDEX ON workflow.watchlists (tenant_id, category);
CREATE INDEX ON workflow.watchlists (tenant_id, is_priority) WHERE is_priority = TRUE;

-- Alert episode support
ALTER TABLE workflow.watchlist_alerts ADD COLUMN IF NOT EXISTS episode_id UUID;
CREATE INDEX ON workflow.watchlist_alerts (episode_id) WHERE episode_id IS NOT NULL;

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON projections.geostrat_events TO narad_ingest_writer;
GRANT SELECT ON projections.geostrat_events TO narad_app;
```

---

## 8. Success Criteria

Phase 3C is complete when:

**Watchlists:**
1. Rule evaluation engine fires alerts when conditions match new events/entities
2. Alert lifecycle UI allows triage, assignment, and resolution
3. Watchlist directory shows organized lists with alert count badges
4. Rule builder creates valid JSON Logic conditions
5. Live alert stream updates via WebSocket
6. Episode grouping clusters related alerts
7. Dashboard metrics show real counts

**GeoStrat:**
1. All GeoStrat queries read from `projections.geostrat_events` (not `core.events`)
2. Viewport-aware gateway filtering reduces unnecessary WebSocket traffic
3. Query performance is measurably faster on projection table

**Tier 2 Sources:**
1. ACLED events appear on GeoStrat map and PulseBoard feed
2. NASA FIRMS hotspots render as a GeoStrat layer
3. OpenSky aircraft positions render on GeoStrat (from telemetry hypertable)
4. GDELT news events enrich PulseBoard with international context

---

## 9. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| JSON Logic complexity overwhelms analysts | Medium | Low adoption | Form-based builder abstracts JSON; raw mode for power users |
| Alert storm from Tier 2 high-volume sources | High | Alert fatigue | Default rules have minimum severity threshold; throttle evaluation |
| OpenSky rate limits (100/day anonymous) | High | Incomplete aircraft data | Register for authenticated access; cache aggressively |
| ACLED API key approval delay | Medium | No conflict data | GDELT provides partial coverage as fallback |
| Viewport filtering accuracy | Low | Events missed at boundaries | Add 10% viewport margin (buffer) |
| Alert volume exceeds projection rebuild speed | Medium | Stale dashboard | Batch projection rebuilds; priority queue for critical alerts |
