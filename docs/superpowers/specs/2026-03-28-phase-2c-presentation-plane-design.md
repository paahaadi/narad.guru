# NARAD V2 — Phase 2C Design Spec
## Presentation Plane (Next.js 15 + WebSocket Gateway)

**Date:** 2026-03-28  
**Session:** 2C of Phase 2  
**Status:** Approved — locked for implementation  
**Depends on:** Phase 1 Canonical Ontology, Phase 2A Data Plane, Phase 2B Intelligence Plane  
**Builds on:** `docs/architecture/canonical_ontology.md`, `docs/superpowers/specs/2026-03-27-phase-2a-data-plane-design.md`, `docs/superpowers/specs/2026-03-28-phase-2b-intelligence-plane-design.md`

---

## 1. Scope

This session produces the NARAD app plane:
- Shared application shell across all seven workspaces
- Seven routed screens translated from the `narad/` prototypes
- Full live integration for GeoStrat and PulseBoard
- JWT-authenticated Next.js application
- Separate Node WebSocket gateway subscribed to Redis `narad:*`
- Read-only app-plane API layer through PgBouncer as `narad_app`
- Production design token layer implementing Sovereign Midnight

**Out of scope for this session:** Full backend completion for every workspace, advanced Watchlist workflows, full Investigations case engine, Briefings publishing orchestration, CorpWatch graph analytics depth, full LexPulse RAG orchestration.

### Phase-Lineage Alignment

Phase 2C must stay aligned with the contracts already established in completed work:

- Phase 1 defines the canonical ontology, CQRS read model boundaries, tenant isolation model, and the rule that the UI reads precomputed projections or read-safe canonical tables rather than raw ingestion.
- Phase 2A materializes those contracts in PostgreSQL, PgBouncer, Redis, RLS, and the `narad_app` / `narad_worker` role split.
- Phase 2B currently provides the concrete live read/write baseline that Phase 2C can depend on today:
  - `projections.pulseboard_feed` is actively rebuilt and published for PulseBoard.
  - `geo_intelligence.layer_configs` exists as the GeoStrat layer registry.
  - `core.events`, `core.story_capsules`, `core.event_document_links`, and `core.sources` are the read-safe canonical sources currently used by app-plane detail surfaces.
  - Redis delta envelopes already exist with the shape `channel`, `tenant_id`, `entity_type`, `entity_id`, `changes`, `timestamp`.
  - The current live channel implemented by the intelligence plane is `narad:pulseboard:event`.

Engineering rule:
- Phase 2C may introduce stronger presentation-side adapters and route-local caches, but it must not invent a new canonical read contract that conflicts with Phase 1, 2A, or 2B.

---

## 2. Frontend Source of Truth

The `narad/` directory is the visual and interaction source of truth for Phase 2C.

| Artifact | Responsibility |
|---|---|
| `narad/narad_sovereign_intelligence_app/code.html` | Shared shell reference |
| `narad/geostrat_command_center/code.html` | GeoStrat route |
| `narad/pulseboard_intelligence_feed/code.html` | PulseBoard route |
| `narad/corpwatch_intelligence_desk/code.html` | CorpWatch route |
| `narad/lexpulse_intelligence_terminal/code.html` | LexPulse route |
| `narad/watchlists_workspace/code.html` | Watchlists route |
| `narad/investigations_workspace/code.html` | Investigations route |
| `narad/briefings_workspace/code.html` | Briefings route |
| `narad/sovereign_midnight/DESIGN.md` | Design-system authority |

Implementation rule:
- Production React code must translate these prototypes faithfully.
- Shared shell patterns may be normalized.
- Route-level composition, panel hierarchy, visual density, and workspace identity must remain intact.
- Refinements are allowed only to improve consistency, scanability, and hierarchy without changing the core authored aesthetic.

---

## 3. Directory Structure

```text
apps/
├── web/
│   ├── package.json
│   ├── next.config.ts
│   ├── tsconfig.json
│   ├── src/
│   │   ├── app/
│   │   │   ├── (authenticated)/
│   │   │   │   ├── layout.tsx
│   │   │   │   ├── geostrat/page.tsx
│   │   │   │   ├── pulseboard/page.tsx
│   │   │   │   ├── corpwatch/page.tsx
│   │   │   │   ├── lexpulse/page.tsx
│   │   │   │   ├── watchlists/page.tsx
│   │   │   │   ├── investigations/page.tsx
│   │   │   │   └── briefings/page.tsx
│   │   │   └── api/
│   │   │       ├── session/me/route.ts
│   │   │       ├── pulseboard/route.ts
│   │   │       ├── pulseboard/[eventId]/route.ts
│   │   │       ├── geostrat/kpis/route.ts
│   │   │       ├── geostrat/layers/route.ts
│   │   │       ├── geostrat/events/route.ts
│   │   │       └── geostrat/tiles/[layer]/[z]/[x]/[y].mvt/route.ts
│   │   ├── components/
│   │   ├── features/
│   │   ├── lib/
│   │   ├── stores/
│   │   └── styles/
│   └── public/
└── gateway/
    ├── package.json
    ├── tsconfig.json
    └── src/
        ├── server.ts
        ├── auth.ts
        ├── redis.ts
        ├── channels.ts
        └── contracts.ts
```

---

## 4. Docker Integration

Phase 2C adds two services:

- `web` — Next.js 15 app
- `gateway` — long-lived Node WebSocket bridge

Both services:
- run on the `narad` Docker network
- use Docker-internal `pgbouncer:5432`
- use Docker-internal `redis:6379`
- authenticate with JWT public key + issuer from `.env`

---

## 5. Shared Shell Architecture

The shared shell is derived from `narad/narad_sovereign_intelligence_app/code.html`.

Required persistent elements:
- left workspace rail
- top header with global command search
- notification / share / account cluster
- workspace-local active-state treatment
- consistent bottom or route-local status strips only where authored

Rules:
- Route switches must preserve shell state.
- Workspace identity is expressed through content composition and active state, not shell rebuilds.
- The command bar remains universal across all workspaces.

---

## 6. Workspace Route Mapping

| Route | Prototype Source | Integration Depth in Phase 2C |
|---|---|---|
| `/geostrat` | `narad/geostrat_command_center/code.html` | Full live integration |
| `/pulseboard` | `narad/pulseboard_intelligence_feed/code.html` | Full live integration |
| `/corpwatch` | `narad/corpwatch_intelligence_desk/code.html` | Production route + staged data adapter |
| `/lexpulse` | `narad/lexpulse_intelligence_terminal/code.html` | Production route + staged data adapter |
| `/watchlists` | `narad/watchlists_workspace/code.html` | Production route + staged data adapter |
| `/investigations` | `narad/investigations_workspace/code.html` | Production route + staged data adapter |
| `/briefings` | `narad/briefings_workspace/code.html` | Production route + staged data adapter |

No route ships as a generic placeholder page.

---

## 7. Visual Refinement Brief

### 7.1 Global

- Normalize the shell across routes.
- Consolidate all prototype color ladders into one Sovereign Midnight token system.
- Increase contrast between dominant content, secondary panels, and metadata.
- Reduce unnecessary hard borders; prefer tonal separation.
- Strengthen active states for workspace, tabs, cards, and filters.

### 7.2 GeoStrat

- Preserve the map-first command-center posture.
- Increase map dominance by slightly reducing overlay weight.
- Keep KPI strip, bottom intelligence strip, and right district rail.
- Use lighter chrome around floating controls and map tools.

### 7.3 PulseBoard

- Preserve split feed + story focus.
- Calm the event cards by reducing competing accents.
- Make selected card state, severity, and confidence easier to scan.
- Preserve evidence/action area and editorial reading flow.

### 7.4 CorpWatch

- Preserve entity hero, graph panel, tabbed center, and monitoring rail.
- Clarify reading order between risk summary, graph, executive data, and finance tiles.

### 7.5 LexPulse

- Preserve query-first regulatory terminal identity.
- Improve hierarchy between direct answer, change summary, why-it-matters, and evidence pack.
- Keep watchlists rail and evidence rail intact.

### 7.6 Watchlists

- Preserve directory rail, top metrics, center watchlist surface, and assistant rail.
- Strengthen the main watch object’s visual dominance and rule/action clarity.

### 7.7 Investigations

- Preserve investigation directory, hero, tab strip, evidence card, and case-integrity rail.
- Sharpen the case-status and evidence-vs-timeline hierarchy.

### 7.8 Briefings

- Preserve library rail, central publication reading surface, and briefing AI rail.
- Increase the dominance of the central reading surface to feel more editorial and less dashboard-like.

---

## 8. State Management

State stack:
- Zustand for shared UI and workspace-local interaction state
- React Query for fetch caching and transition smoothness
- Route params for deep-linkable workspace context

Store domains:
- shell state
- auth/session state
- GeoStrat viewport and layer state
- PulseBoard selection and drawer state
- per-workspace local UI state

---

## 9. Real-Time Gateway

The realtime layer is a separate Node service.

Responsibilities:
- validate JWT at socket connect
- subscribe to Redis `narad:*`
- preserve the Phase 2B delta envelope contract and current `narad:pulseboard:event` baseline
- multiplex tenant/workspace channels
- forward delta-only payloads
- support interval-based throttling immediately; viewport-aware map throttling is an incremental Phase 2C refinement once dedicated GeoStrat channels exist

The Next.js app remains stateless at the server tier and patches client state via Zustand.

---

## 10. Authentication and Authorization

Auth is enabled in Phase 2C.

Rules:
- JWT algorithm: RS256
- verify `iss` against `JWT_ISSUER`
- shared claims contract:
  - `sub`
  - `tenant_id`
  - `role`
  - `clearance_level`
  - `iss`
  - `exp`
- Next.js middleware protects authenticated routes and API routes
- intelligence admin endpoints share the same public-key / issuer contract

---

## 11. API Route Contracts

Required app-plane routes:

- `GET /api/session/me`
- `GET /api/pulseboard`
- `GET /api/pulseboard/[eventId]`
- `GET /api/geostrat/kpis`
- `GET /api/geostrat/layers`
- `GET /api/geostrat/events`
- `GET /api/geostrat/tiles/[layer]/[z]/[x]/[y].mvt`

Read-path rules:
- all reads execute as `narad_app` through PgBouncer and preserve tenant isolation via `app.current_tenant_id`
- PulseBoard reads from `projections.pulseboard_feed` for feed cards and from canonical evidence/story tables for detail hydration
- GeoStrat Phase 2C baseline reads from `geo_intelligence.layer_configs` and `core.events` for KPI, event, and MVT tile delivery; a dedicated spatial projection/view is a follow-on optimization, not a Phase 2C entry dependency
- CorpWatch / LexPulse / Watchlists / Investigations / Briefings use stable adapter contracts that can begin with staged or read-only sources because only the PulseBoard projection rebuild is fully implemented in Phase 2B today

---

## 12. Design Tokens and Typography

Base token decisions:
- primary accent: sovereign orange from prototypes
- surface hierarchy: `surface`, `surface-container-low`, `surface-container`, `surface-container-high`, `surface-container-highest`
- text: `on-surface`, `secondary`, `outline-variant`
- display/headline font: Manrope
- body/metadata font: Inter

Engineering rule:
- Extract tokens from the prototypes into production CSS variables
- Do not let route-local Tailwind config drift into multiple incompatible token systems

---

## 13. Verification Checklist

After the Phase 2C implementation is complete, the following must pass:

```bash
# 1. All authenticated routes resolve
curl -I http://localhost:3000/pulseboard
curl -I http://localhost:3000/geostrat
curl -I http://localhost:3000/corpwatch
curl -I http://localhost:3000/lexpulse
curl -I http://localhost:3000/watchlists
curl -I http://localhost:3000/investigations
curl -I http://localhost:3000/briefings

# 2. Session endpoint
curl -s http://localhost:3000/api/session/me

# 3. PulseBoard app-plane API
curl -s http://localhost:3000/api/pulseboard | jq 'length'

# 4. GeoStrat KPI API
curl -s http://localhost:3000/api/geostrat/kpis | jq '.'

# 5. Gateway health / startup
docker compose logs gateway | grep -E "listening|connected|subscribed"
```

Manual verification:
- all seven routes preserve the authored visual identity from `narad/`
- GeoStrat map loads and remains readable
- PulseBoard delta updates patch in place
- shell remains mounted across route switches

---

## 14. Open Decisions Carried Forward

| Decision | Locked Default | When to Revisit |
|---|---|---|
| Route fidelity vs refactor | Prototype-faithful production translation | Revisit only after all seven routes are stable in code |
| Realtime transport | Separate Node WebSocket gateway | Revisit only if infra constraints require SSE fallback |
| Non-core workspace data depth | Production route + staged adapters | Replace staged adapters as backend capability lands |
| Design token system | Consolidated from prototypes + `DESIGN.md` | Revisit only if design owner changes the visual language |

---

## 15. What Phase 3 Will Build On Top Of This

- Deeper CorpWatch entity graph and compliance views
- Full LexPulse RAG workflow
- Advanced Watchlists rule management and alert triage
- Full Investigations workflow engine
- Full Briefings publication and approval orchestration
