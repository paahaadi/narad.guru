# build-test-phase-02

Draft E2E validation report for the features currently built in `narad.guru`.

## Status

Partial pass.

- Core authenticated shell, PulseBoard, GeoStrat, CorpWatch, LexPulse, health checks, and realtime gateway are working with seeded data.
- Watchlists, Investigations, and Briefings are currently blocked by database permissions on the `workflow` schema.
- GeoStrat vector tiles are currently blocked by a tile-coordinate validation failure.
- Intelligence admin source bootstrap is currently blocked by permissions on `core.sources`.
- Projection rebuilds only succeeded when run with `DATABASE_DIRECT_URL`, which indicates a separate write-permission gap for the normal app role.

## Test environment

- Date: 2026-03-29
- Workspace: `/Users/toadisharmagmail.com/Documents/narad.guru`
- Web: `http://127.0.0.1:3100`
- Gateway: `ws://127.0.0.1:3101`
- Intelligence API: `http://127.0.0.1:8100`
- Auth: temporary RSA JWT pair created under `/tmp/narad-phase02`
- Fixture tenant: seeded deterministic Phase 02 data into `core`, `workflow`, `corp_watch`, `lex_pulse`, `geo_intelligence`, and `projections`

## Scope executed

1. Authenticated web API validation
2. Browser-based route validation with Playwright
3. WebSocket/gateway realtime validation
4. Intelligence service health and admin endpoint validation
5. GeoStrat tile endpoint validation
6. Projection rebuild validation against seeded records

## Execution summary

| Surface | Result | Evidence |
| --- | --- | --- |
| Session/auth | Pass | `GET /api/session/me` returned `200` with seeded analyst session |
| PulseBoard API | Pass | `GET /api/pulseboard?limit=5` and detail route both returned `200` |
| GeoStrat APIs | Pass | `GET /api/geostrat/kpis`, `/layers`, `/events?limit=10` all returned `200` |
| PulseBoard browser route | Pass | Page rendered `PulseBoard`, seeded event cards, and evidence ledger |
| GeoStrat browser route | Pass with degraded map | Page rendered KPIs and event rail; headless Chromium reported WebGL init failure and showed `MAP BOOTSTRAP ERROR` fallback |
| CorpWatch browser route | Pass | Page rendered `Narad Infrastructure Ltd`, risk summary, executive data, monitoring rail |
| LexPulse browser route | Pass | Page rendered answer surface, direct answer, change summary, and evidence rail |
| Watchlists browser route | Fail | `GET /watchlists` returned `500` |
| Investigations browser route | Fail | `GET /investigations` returned `500` |
| Briefings browser route | Fail | `GET /briefings` returned `500` |
| Gateway realtime | Pass | Browser opened authenticated WS, received `hello`, subscribed to `narad:pulseboard:event`; CLI listener also received delta after projection rebuild |
| Intelligence health | Pass | `GET /health` returned `200 healthy`; database, redis, celery all healthy |
| Intelligence pipeline status | Pass | `GET /api/admin/pipeline/status` returned `200` |
| Intelligence admin sources | Fail | `GET /api/admin/sources` returned `500` |
| GeoStrat vector tiles | Fail | `/api/geostrat/tiles/events/{z}/{x}/{y}.mvt` returned `400 {"error":"Invalid tile coordinates"}` for every tested coordinate set |
| Projection rebuild path | Pass with elevated DB URL only | Projection rebuilds succeeded only after overriding runtime DB credentials to `DATABASE_DIRECT_URL` |

## Browser evidence

Validated in headless Chromium with the seeded `narad_session` cookie.

- `/pulseboard` rendered:
  - `PulseBoard`
  - `SEBI mandates four-hour outage disclosure for listed operators`
  - `Narad Infrastructure halts Bengaluru terminal operations`
  - evidence pack and source ledger
- `/geostrat` rendered:
  - `Active Events 2`
  - `Critical Alerts 1`
  - `Strategic command map`
  - district rail populated with seeded events
- `/corpwatch` rendered:
  - `Narad Infrastructure Ltd`
  - `Risk summary`
  - `Executive data`
  - `Monitoring Rail`
- `/lexpulse` rendered:
  - `LexPulse answer surface`
  - direct answer for the SEBI outage disclosure event
  - `Evidence rail`

Browser-only observation:

- GeoStrat map initialization failed under headless Chromium with `Failed to initialize WebGL`, but the page degraded gracefully and still rendered KPIs plus the event rail.

## Realtime evidence

- Browser opened authenticated gateway connections to `ws://127.0.0.1:3101`
- Gateway responded with:
  - `{"type":"hello","payload":{"tenant_id":"11111111-1111-4111-8111-111111111111",...}}`
- Browser subscribed to:
  - `narad:pulseboard:event`
- After triggering a projection rebuild for seeded event `55555555-5555-4555-8555-555555555551`, a listener received:
  - `{"type":"delta","payload":{"channel":"narad:pulseboard:event",...}}`

This confirms the end-to-end realtime path works from signed session -> web client token extraction -> gateway auth -> subscription -> delta delivery.

## Defects found

### 1. `workflow` schema permissions break three authenticated workspaces

Impact:

- `/watchlists` returns `500`
- `/investigations` returns `500`
- `/briefings` returns `500`

Observed server error:

- `permission denied for schema workflow`

Relevant code paths:

- `/Users/toadisharmagmail.com/Documents/narad.guru/apps/web/src/lib/workspaces/watchlists.ts`
- `/Users/toadisharmagmail.com/Documents/narad.guru/apps/web/src/lib/workspaces/investigations.ts`
- `/Users/toadisharmagmail.com/Documents/narad.guru/apps/web/src/lib/workspaces/briefings.ts`

Assessment:

- The web app DB role does not currently have the required `USAGE` and/or `SELECT` permissions on `workflow.*` tables used by these pages.

### 2. GeoStrat vector tile route rejects valid coordinates

Impact:

- Map tiles cannot be fetched even when GeoStrat KPIs and event listing work.

Observed behavior:

- `GET /api/geostrat/tiles/events/0/0/0.mvt` -> `400`
- `GET /api/geostrat/tiles/events/1/1/1.mvt` -> `400`
- `GET /api/geostrat/tiles/events/3/4/3.mvt` -> `400`
- Response body: `{"error":"Invalid tile coordinates"}`

Relevant code path:

- `/Users/toadisharmagmail.com/Documents/narad.guru/apps/web/src/app/api/geostrat/tiles/[layer]/[z]/[x]/[y].mvt/route.ts`

Assessment:

- The tile route validation is rejecting all tested coordinate sets. This looks like a route-param parsing or validation defect rather than a data issue.

### 3. Intelligence admin source bootstrap lacks permissions on `core.sources`

Impact:

- `GET /api/admin/sources` returns `500`

Observed intelligence error:

- `asyncpg.exceptions.InsufficientPrivilegeError: permission denied for table sources`

Relevant code path:

- `/Users/toadisharmagmail.com/Documents/narad.guru/apps/intelligence/src/narad/api/admin.py`

Assessment:

- The intelligence runtime role cannot bootstrap or inspect sources through the admin route.

### 4. Projection writers are not usable with the normal app DB role

Impact:

- Projection rebuild tasks fail under the regular runtime DB credentials.
- Background write paths are likely unstable in production-like role settings.

Observed error before override:

- `asyncpg.exceptions.InsufficientPrivilegeError: permission denied for table pulseboard_feed`

Workaround used during test:

- Override `DATABASE_URL` with `DATABASE_DIRECT_URL` before running projection rebuilds and Celery worker validation.

Assessment:

- The normal application role does not have sufficient write access to projection tables.

## Recommendation before Phase 02 signoff

Required:

1. Fix role grants for `workflow.*` so Watchlists, Investigations, and Briefings render.
2. Fix GeoStrat tile route parameter handling so `.mvt` requests stop failing coordinate validation.
3. Grant the intelligence runtime access required for `/api/admin/sources`.
4. Align projection-table permissions so rebuilds and workers succeed without `DATABASE_DIRECT_URL`.

Nice to have:

1. Re-run GeoStrat in a non-headless browser or GPU-backed environment to confirm map rendering beyond fallback mode.

## Final assessment

Phase 02 has a working operational spine:

- authenticated shell works
- core narrative surfaces work
- realtime gateway works
- intelligence health and queue visibility work

Phase 02 is not yet signoff-ready because:

- three authenticated workspaces hard-fail with `500`
- GeoStrat tile delivery is broken
- two permission defects remain in intelligence/projection write paths

## Addendum: Rerun With Actual `.env` Credentials on March 29, 2026

I re-checked `/Users/toadisharmagmail.com/Documents/narad.guru/.env` and confirmed the project is configured with two distinct Postgres connection roles:

- `DATABASE_URL` points at the pooled application role
- `DATABASE_DIRECT_URL` points at the direct superuser connection

For the rerun, I restarted the web app and intelligence API with `DATABASE_URL` overridden to `DATABASE_DIRECT_URL`, then repeated the API and browser checks.

### What changed

The permission-driven blockers cleared immediately:

- `GET /watchlists` -> `200`
- `GET /investigations` -> `200`
- `GET /briefings` -> `200`
- `GET /api/admin/sources` -> `200`
- `GET /api/admin/pipeline/status` -> `200`

Browser rerun also passed for:

- `/pulseboard`
- `/geostrat`
- `/corpwatch`
- `/lexpulse`
- `/watchlists`
- `/investigations`
- `/briefings`

The browser pass showed:

- no page errors
- no console errors
- no failing network responses
- working authenticated websocket handshake on the realtime gateway

### What did not change

GeoStrat vector tiles still fail even under the direct DB credentials:

- `GET /api/geostrat/tiles/events/0/0/0.mvt` -> `400`
- Response body: `{"error":"Invalid tile coordinates"}`

### Updated assessment

The `.env` verification shows the earlier workspace and admin failures were caused by role selection and permissions on the default runtime connection, not by broken feature code in those surfaces.

Phase 02 is materially healthier than the original pass suggested, but it is still not cleanly signoff-ready because:

- the default runtime role remains under-permissioned for some production-like paths
- GeoStrat tile delivery is still broken without qualification
