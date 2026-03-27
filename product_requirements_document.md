Here is the fully formatted Markdown version of your PRD. I have structured the headings, lists, tables, and code blocks for clean scannability and readability.

***

# PRD: NARAD V2 — Sovereign Intelligence Operating System for India

## 1. Product Overview

**Product name:** NARAD V2  
**Expanded name:** National AI-powered Real-time Analysis Dashboard  
**Product type:** Seven-workspace sovereign intelligence operating system for India  
**Primary objective:** Build a low-latency, map-first, evidence-backed intelligence platform that unifies geospatial awareness, event intelligence, entity intelligence, regulatory intelligence, monitoring workflows, investigations, and briefings into one shared operating system.

---

## 1.5 Expert Panel Architectural Revisions (V2 Architecture)
Based on deep technical review, NARAD V2 is strictly enforcing the following architectural principles to achieve zero-redundancy, ultra-low-latency, and smooth 60fps rendering:
1. **Decoupled Ingestion Pipeline:** Python (FastAPI/Celery) handles heavy lifting for the 32 data sources, Bhashini AI translation, and entity extraction to keep the frontend API lightweight.
2. **High-Speed Cache API:** Next.js 15 acts strictly as the high-speed data delivery and UI cache layer, connecting to Postgres and Redis.
3. **MapLibre WebGL:** All spatial mapping (GeoStrat) will use MapLibre GL JS + Deck.gl for GPU-accelerated 60fps rendering of large datasets (5,000+ points).
4. **Data Retention:** TimescaleDB will be used to enforce a 7-day ephemeral retention policy for heavy live telemetry, falling back to aggregates to prevent database bloat.

---

## 2. Product Vision

NARAD V2 should be the core Indian intelligence workspace for analysts, researchers, journalists, enterprise risk teams, and government operators. It should ingest public and official information across India’s multilingual and multi-source environment, transform that information into canonical events and entities, and present them through a shared command shell that lets users answer four questions quickly:

1. What is happening?
2. Where is it happening?
3. Who is involved?
4. What changed in law, policy, infrastructure, or corporate behavior?

NARAD V2 must remain:
* sovereign in hosting and data governance
* evidence-backed in every major output
* multilingual by design
* low-latency by architecture
* simple to scan despite high information density

---

## 3. Product Principles

### 3.1 Ingest widely, present narrowly
NARAD should ingest many feeds and signals, but the user should not see raw feed chaos. The user should see canonical events, company profiles, regulatory changes, risk layers, and evidence-backed summaries, with raw evidence one click deeper.

### 3.2 One operating system, not seven separate apps
The seven pages are different workspaces inside one product. They must share:
* one design shell
* one command bar
* one ontology
* one evidence model
* one trust model
* one data core

> **Note:** To enforce this at the database level, the PostgreSQL monolith will use explicit schema boundaries for each logical module while relying on a centralized `core` schema for canonical objects.

### 3.3 One write model, many read projections
The platform should store facts once and project them in multiple surfaces. Watchlists, Investigations, and Briefings should reference the same canonical events, entities, and source documents used by GeoStrat, PulseBoard, CorpWatch, and LexPulse.

> **Note:** To achieve sub-5-second latency without frontend inconsistency, the system will use a CQRS-style pattern where writes update canonical tables first and then asynchronously update precomputed JSONB read models and materialized projections.

### 3.4 AI should not sit in the hot path
Map navigation, feed filtering, drawer opening, and page switching should be powered by indexed queries, cached projections, and precomputed story capsules. LLMs should primarily be used asynchronously for summarization, synthesis, reasoning, and publication workflows.

### 3.5 Trust must be shown, not claimed
Every important object must expose source provenance, confidence, and evidence.

### 3.6 Lowest latency, no redundancy
The system must be designed so that:
* no workspace owns duplicate business objects
* no hot path depends on live LLM inference
* no full JSON payloads are pushed when deltas are sufficient
* no large geospatial payloads are sent raw to the browser
* no inline embedding generation blocks ingest freshness

---

## 4. Users and Personas

### Primary users
* Intelligence analysts
* Investigative journalists
* Policy researchers
* Enterprise risk teams
* Government operators
* Regulated sector users needing due diligence and watch workflows

### Representative personas

#### Government / security operations
Need crisis-room situational awareness, district-level monitoring, escalation tracking, and multi-source corroboration.

#### Enterprise risk / compliance
Need corporate, regulatory, land, infrastructure, and reputational signals linked into a single risk workflow.

#### Investigative journalists / OSINT researchers
Need canonical event clustering, entity link analysis, evidence chains, and investigation workflows.

#### Policy / think-tank analysts
Need legislative, regulatory, and regional context with cited, explainable answers.

---

## 5. Scope

### 5.1 In scope for V2
* **Seven fully integrated workspaces:**
  * GeoStrat
  * PulseBoard
  * CorpWatch
  * LexPulse
  * Watchlists
  * Investigations
  * Briefings
* Shared command shell and navigation
* Shared canonical event/entity/regulatory data core
* Geospatial intelligence surface with multiple operational presets
* AI-synthesized event feed
* Corporate/entity intelligence
* Regulatory and legislative intelligence
* Monitoring workflows
* Analyst case workflows
* Briefing generation and publishing
* Shared RAG interface with citations
* Low-latency architecture built for minimal redundancy

### 5.2 Explicitly out of scope for first production release
* Fully distributed 10-service agent deployment as a mandatory day-one runtime
* Multiple duplicate storage systems for the same entities/events
* Unbounded SOCMINT ingestion without governance controls
* Heavy graph-database duplication before query profiling justifies it
* Multiple independent search stacks before the primary retrieval path is proven insufficient

---

## 6. Information Architecture: The 7 Workspaces

### 6.1 GeoStrat — Geospatial Command Center
**Primary question:** Where is something happening?

**Core components:**
* Full India map canvas
* Layer presets
* KPI strip
* Bottom intelligence strip
* Right-side detail drawer
* Asset and district context
* Time-range and region controls

**Layer presets:**
* Security
* Weather & Disaster
* Mobility & Logistics
* Corporate & Economic
* Legislative & Governance
* Environment & Land

**Product behavior:**
GeoStrat is the primary visualization interface. It renders canonical Events and layers, not raw feeds. Presets are configuration bundles of layers, filters, default zoom, and KPI logic, not separate pages.

**Performance implementation:**
To guarantee smooth rendering in high-density environments:
* raw GeoJSON payloads are banned from the client on national/regional views
* the backend generates Mapbox Vector Tiles (MVT)
* large polygons are subdivided during ingest
* geometry simplification is zoom-sensitive
* high-velocity moving layers use client-side worker-assisted clustering
* server-side tile caches and invalidation are used for hot layer delivery

**Mobility & Logistics preset includes:**
* aviation movements and airport operations
* maritime and coastal operations
* ports and congestion
* rail corridors and disruptions
* logistics anomalies
* related event drill-down

### 6.2 PulseBoard — Canonical Event Intelligence Feed
**Primary question:** What happened, and why does it matter?

**Core components:**
* Filter bar
* Canonical event card stream
* Story drawer
* AI summary panel
* Evidence and source pack
* Open-on-map and add-to-workflow actions

**Product behavior:**
PulseBoard is a continuously updated, AI-synthesized feed backed by canonical Events rather than raw feed entries. It is the central triage surface.

**Feed behavior (Each event card should surface):**
* severity
* confidence
* source trust
* title
* summary
* place
* time
* linked entities
* open evidence action
* open on map action
* add to Watchlist
* add to Investigation

**Realtime model:**
PulseBoard updates through delta-only pushes, not full event payload refreshes.

### 6.3 CorpWatch — Entity and Corporate Intelligence
**Primary question:** Who is involved?

**Core components:**
* Entity search
* Entity hero summary
* Ownership / relationship graph
* Filings and compliance tabs
* Geography and asset context
* Related events
* Risk scoring
* Monitoring controls

**Product behavior:**
CorpWatch is the entity intelligence workspace for company profiles, ownership graphs, related party relationships, compliance timelines, and linked events.

**Entity health:**
Entity scoring must prioritize deterministic, data-backed models over opaque heuristics. Scoring inputs may include:
* filings completeness
* compliance breach history
* solvency indicators
* director and ownership concentration
* linked regulatory actions
* risk velocity from related events

**Navigation behavior:**
Opening an entity from PulseBoard or GeoStrat should open a slide-over CorpWatch mini-profile without fully unmounting the current workspace.

### 6.4 LexPulse — Legislative and Regulatory Intelligence
**Primary question:** What changed in law, policy, or regulation?

**Core components:**
* Ask NARAD / regulatory query bar
* Watchlists by ministry/regulator/sector
* Legal event feed
* Direct answer panel
* “What changed” and “Why it matters” blocks
* Evidence and source pack
* Amendment timeline
* RegAlert controls

**Product behavior:**
LexPulse monitors the Gazette, parliamentary proceedings, and regulator notifications. It provides direct, cited answers to regulatory questions and tracked changes.

**Query behavior:**
LexPulse should use:
1. semantic cache lookup first
2. hybrid retrieval second
3. cited LLM answer generation third
4. graceful fallback to BM25-only results if vector/LLM steps exceed latency thresholds

### 6.5 Watchlists — Monitoring Workspace
**Primary question:** What changed in the things I care about?

**Core components:**
* Watchlist library
* Change feed
* Tracked items
* Alert history
* Rules
* AI watch summary
* Linked Investigations and Briefings

**Product behavior:**
Watchlists monitor canonical objects. They store references and rules, not object copies. Alerts are first-class objects with their own lifecycle and triage.

**Watch targets:**
* Events
* Entities
* Geographies
* Regulatory subjects
* Assets
* Companies
* Ministries
* Districts

**Monitoring intelligence computes:**
* entity health drift
* event frequency change
* risk velocity over rolling time windows
* rule-trigger confidence
* escalation trends

### 6.6 Investigations — Analyst Case Workspace
**Primary question:** What case am I building, and what evidence supports it?

**Core components:**
* Case directory
* Overview
* Timeline
* Entities
* Evidence
* Spatial map
* Notes and hypotheses
* Tasks
* Case integrity and confidence panel

**Product behavior:**
Investigations are structured OSINT workspaces. They link to canonical Events, Entities, Claims, and Documents, never duplicating them.

**Case integrity and evidence handling:**
Investigations must implement Digital Evidence Management principles:
* evidence hashing at ingest
* immutable evidence fingerprints
* fuzzy hashing for media where appropriate
* EXIF and manipulation inspection for visual media
* WORM-compliant storage for evidentiary artifacts
* tamper-evident chronological access logging
* chain-of-custody history exposed to authorized users

**Human-AI verification gate:**
Any AI-generated insight based on volatile or lower-trust sources must use a verification gate:
* visually marked as unverified
* underlying evidence must be opened before acceptance
* analyst acceptance logs user ID, timestamp, and document hash
* only then can the derived claim become canonical

### 6.7 Briefings — Intelligence Publication Workspace
**Primary question:** What do I need to communicate to decision-makers?

**Core components:**
* Briefing library
* AI draft controls
* Audience selector
* Sections
* Sources
* Distribution
* Versions
* Finalize and publish

**Product behavior:**
Briefings synthesize information from Watchlists, Investigations, Events, and regulatory changes into publishable outputs, with explicit lifecycle and versioning.

**Publishing flow:**
* draft generation
* human editing
* source inspection
* approval workflow
* scheduled or immediate distribution
* supersession/version tracking

---

## 7. Canonical Data Model

The platform revolves around canonical objects:

* **Source** — authority, license, trust tier, update cadence
* **Document** — raw text, PDF, HTML, telemetry snapshot, language, hash, fetch time
* **Claim** — extracted fact with provenance and confidence
* **Entity** — company, person, ministry, district, asset, parcel, vessel, aircraft, case, project
* **Event** — normalized incident with type, severity, time, geometry, status
* **Relationship** — entity-to-entity and event-to-entity links
* **Impact** — human, economic, legal, infrastructure, environmental
* **Story Capsule** — one event, one explanation, one evidence bundle
* **Investigation** — structured case over Events/Entities/Documents
* **Briefing** — publication synthesizing cases and events
* **Watchlist**
* **WatchlistAlert**

No workspace stores its own object types. All reference canonical tables.

### Extended relationship model
Relationships must support:
* `source_entity_uuid`
* `target_entity_uuid`
* `relationship_type`
* `valid_from`
* `valid_until`
* `confidence_score`
* `lineage_hash`

This adds directionality, temporal validity, confidence, and exact provenance linkage.

---

## 8. Data Transformation Model

All raw inputs are normalized into the canonical model:

| Raw Input | Canonical Object(s) | User Surface |
|---|---|---|
| Article / bulletin / PDF | Document → Claims → Event | PulseBoard, GeoStrat |
| Filing / order / announcement | Document → Claims → Entity + Event | CorpWatch, timelines |
| Warning / forecast / telemetry | Document → Risk signal + Event/Layer | GeoStrat, Watchlists |
| Debate / bill / gazette | Document → Claims → Regulatory Event | LexPulse, Briefings |

*Every step is lineage-tracked.*

---

## 9. Data Sources and Ingestion Tiers

### 9.1 Tier 1 — Source-of-record
* data.gov.in
* Bhuvan / NRSC
* PIB
* IMD
* CWC
* MCA21
* SEBI / BSE / NSE
* Digital Sansad / Parliament Digital Library
* Gazette of India / eGazette
* PARIVESH
* DILRMP / ULPIN / NGDRS
* INCOIS

### 9.2 Tier 2 — Structured enrichment
* ACLED
* NASA FIRMS
* OpenSky
* GDELT
* PRS India
* curated regional RSS

### 9.3 Tier 3 — Controlled / licensed / consent-based
* Commercial AIS
* deeper corporate and exchange feeds
* SOCMINT channels
* archived takedown content

*Tier 3 requires explicit governance and access controls.*

### 9.4 Multilingual real-time ingestion
To support India’s linguistic diversity without sacrificing latency:
* multilingual text and audio feeds are ingested asynchronously
* Bhashini-backed translation and STT can convert them into normalized English-layer canonical content
* original-language content remains preserved for evidence and audit

---

## 10. Product Architecture

### 10.1 Core architectural principle
One canonical Postgres-based intelligence core, one fast event backbone, one shared map/runtime stack, and seven UI workspaces that are projections of the same underlying objects.

### 10.2 Physical architecture: three planes

#### App Plane
Serves workspaces through a shared shell and low-latency web runtime.

**Recommended stack:**
* Next.js App Router
* TypeScript
* server-rendered scaffolding
* client-side interactivity where needed
* SSE or multiplexed WebSockets for live state
* MapLibre GL JS for maps
* MVT tiles served from a dedicated tile layer

#### Intelligence Plane
Runs operational workflows:
* ingestion adapters
* normalization
* deduplication and event canonicalization
* entity resolution
* Story Capsule generation
* RAG preparation
* Watchlist matching and alert generation
* Briefing generation
* scoring and triage assistance

*All jobs must be idempotent and retry-safe.*

#### Data Plane
Single durable source of truth:
* PostgreSQL
* TimescaleDB extension for event and telemetry hypertables
* PostGIS for spatial processing
* pgvector for embeddings
* object storage for evidence and dark archive
* Redis for hot cache and coordination only

### 10.3 Modular deployment model
For V2, use:
* modular monolith for core application domains
* worker plane for async intelligence jobs
* event-driven internal boundaries
* strict module interfaces and queue contracts

This preserves the logical 10-agent architecture without over-fragmenting deployment on day one.

### 10.4 Schema boundaries
Use explicit PostgreSQL schemas such as:
* `core`
* `geo_intelligence`
* `corp_watch`
* `lex_pulse`
* `osint_cases`
* `workflow`
* `audit`

Canonical objects remain centralized in `core`.

---

## 11. Event Backbone and Realtime Delivery

### 11.1 Event-driven processing
Asynchronous pipelines drive:
* ingestion
* deduplication
* enrichment
* Story Capsule generation
* vector indexing
* alert generation
* briefing preparation

### 11.2 CQRS read models
Write events update canonical tables first, then asynchronously materialize:
* JSONB feed projections
* map projections
* watchlist match tables
* entity summary views
* regulatory digest views

### 11.3 Realtime gateway standard
The app plane must implement a real-time gateway using a multiplexed WebSocket connection.

#### Delta-only payloads
Server pushes must contain only:
* canonical object UUID
* changed fields

```json
{ 
  "event_id": "abc-123", 
  "severity": "HIGH" 
}
```

#### Throttling and debouncing
High-velocity signals such as moving assets must be debounced by viewport and interval to protect client CPU and bandwidth.

---

## 12. Agent Ownership Model

**Logical domains:**
* Sovereign Infrastructure
* AI Cognitive Systems
* Knowledge & Semantic Retrieval
* Data Ingestion & OSINT
* Event Intelligence & Deduplication
* Corporate & Financial Intelligence
* Geospatial Intelligence
* Cybersecurity & Platform Integrity
* Governance & Compliance
* Ecosystem & Public Trust

*These are ownership boundaries, not mandatory day-one independent deployables.*

---

## 13. Low-Latency Strategy

### 13.1 Hot path (no live LLM)
**Never invoke LLMs for:**
* map movement
* layer toggling
* opening drawers
* feed filtering
* switching workspaces
* opening entity overview
* opening already-available regulatory answers
* loading Watchlists / Investigations / Briefings dashboards

**Serve via:**
* indexed SQL
* PostGIS / Timescale queries
* cached vector tiles
* read-optimized projections
* precomputed Story Capsules
* Redis hot cache where appropriate

### 13.2 Cold path (async AI allowed)
**LLMs and heavier computation are allowed for:**
* new Story Capsules
* Briefing draft synthesis
* deep reasoning queries
* regulatory synthesis
* entity synopsis generation
* long-form translation

*These always surface explicit pending / refreshed states.*

### 13.3 Precompute aggressively
**Precompute:**
* event summaries
* confidence values
* district and state rollups
* entity mini-profiles
* regulatory one-line gists
* watchlist deltas
* map-ready projections and vector tiles

### 13.4 Strict performance targets
* **Time to First Insight on shared briefing pages:** < 1.2s
* **Vector tile resolution during active pan/zoom:** < 150ms target
* **DB commit to UI delta reflection:** < 50ms target
* **RAG hard timeout fallback:** degrade to BM25 results instead of erroring

---

## 14. No-Redundancy Rules

* One canonical record per real-world object
* Workspaces store references and annotations, not copies
* Async steps must be idempotent
* Search remains inside the Postgres core unless proven insufficient
* Redis remains transient and is never a second source of truth
* Client state must be normalized to prevent duplicate payload storage
* Large geospatial payloads must be tile- or cluster-derived, never repeatedly serialized whole

---

## 15. Retrieval and AI / RAG

### 15.1 Retrieval path
* Query in user language
* Bhashini translation where needed
* embedding computation or lookup
* parallel vector + BM25 retrieval
* reranking
* source-aware context assembly
* cited answer generation
* translation back to user language when needed

### 15.2 Hybrid search
To overcome hallucination and exact-keyword failures, NARAD uses hybrid retrieval:
* KNN search over pgvector
* BM25 / tsvector keyword search
* Reciprocal Rank Fusion (RRF)
* recency weighting
* trust-tier weighting

### 15.3 Semantic cache
Before retrieval + generation:
* LexPulse and other answer surfaces should consult a semantic cache
* sufficiently similar recent answers can be returned immediately
* cache hits should avoid unnecessary LLM cycles

### 15.4 Embedding queues
Embeddings must not be generated inline on the ingest hot path:
* raw text lands first in canonical storage
* lexical retrieval becomes available immediately
* async queues batch embedding generation via dedicated workers

### 15.5 Graceful fallback
If vector retrieval or LLM generation times out:
* degrade to BM25 / document-first results
* never return a dead-end error page for answerable content

---

## 16. Data Trust and Governance

### 16.1 Data Trust
Every major object must display:
* source types and tiers
* trust level
* observation / ingestion / last-update timestamps
* confidence
* linked evidence

### 16.2 Case integrity
AI-generated insights based on volatile sources remain quarantined until human acceptance.

### 16.3 DPDPA compliance
NARAD must support:
* privacy by design
* data minimization
* accuracy controls
* storage limitation
* security safeguards
* rights management
* DPO-led governance

### 16.4 Purpose limitation and access control
Use:
* Row-Level Security
* role-based access control
* classification-aware access gating
* source-tier gating

### 16.5 Dark archive protocol
To preserve referential integrity while honoring erasure or volatility requirements:
* sensitive/erased content moves to dark archive storage
* operational systems retain only anonymized or cryptographic stubs where necessary
* user-facing access respects legal and clearance constraints

### 16.6 Credibility decay
Tier 3 sources should use dynamic credibility adjustment:
* repeated contradiction against Tier 1 reduces weight
* unreliable signals do not dominate hot-path summaries

---

## 17. UX Principles

NARAD should be high-density but easy to read.

**Rules:**
* put key information first
* use plain language
* prefer question-driven summaries
* use progressive disclosure
* show evidence and trust clearly
* keep raw documents one click deeper
* keep cards compact and scannable
* keep canonical event markers plus one contextual layer visible by default
* avoid full-page context switching when overlays can preserve analyst flow

**Interaction model:**
* use slide-over panels for adjacent context
* use universal command bar intent routing
* minimize unmount/remount penalties between workspaces
* isolate React updates so KPI changes do not re-render the map

---

## 18. Rollout Strategy

### Phase 1 — V2 foundation
* shared shell
* GeoStrat
* PulseBoard
* event story drawer
* source registry
* canonical schema
* Tier 1 sources first
* read-only LexPulse ingestion to build corpus

### Phase 2 — Intelligence expansion
* CorpWatch
* full LexPulse RAG
* Bhashini streaming integration
* Watchlist engine
* canonical dedup at production scale
* semantic cache and batched embeddings

### Phase 3 — Workflow expansion
* Watchlists UI and workflows
* Investigations
* Briefings
* advanced publication workflows
* full verification gate
* deeper ownership and relationship capabilities

### Phase 4 — Scale and optimization
* full 45-layer GeoStrat coverage
* larger source corpus
* advanced SOCMINT governance
* audit and performance hardening
* further decomposition if modular monolith boundaries prove ready

---

## 19. Success Metrics

### Product metrics
* user understands the top change in under 5 seconds
* reduced duplicate event noise
* higher Investigation creation from events
* repeat use of Watchlists, CorpWatch, LexPulse, and Briefings

### Technical metrics
* sub-second tile load behavior under normal load
* high cache hit rate for Story Capsules and semantic answers
* ingestion freshness by source SLA
* dedup precision / recall
* citation completeness
* Watchlist rule latency
* chain-of-custody integrity validation rate

### Strategic metrics
* depth of DPI integration
* sovereign-hosted path remains intact
* usability across civic, enterprise, journalist, and government users

---

## 20. End-to-End Incident Workflow

**Flow: GeoStrat → PulseBoard → Investigations → Briefings**

* **Detect** — Analyst sees an anomaly in GeoStrat
* **Contextualize** — Open event drawer and linked PulseBoard story
* **Triage** — Start/attach Investigation, add to Watchlist, or suppress as noise
* **Investigate** — Build case with CorpWatch and LexPulse context
* **Review** — Move Investigation through case states
* **Brief** — Generate and edit Briefing from Investigation
* **Monitor** — Feed outcomes back into Watchlist rules and triage logic

*Human–AI handoffs are explicit at triage, case review, and briefing approval.*

---

## 21. Lifecycle State Machines

* **Event:** Ingested → Canonicalized → Enriched → In Investigation → Resolved → Invalidated
* **Investigation:** Draft → Under Review → Active → On Hold → Closed → Archived
* **Briefing:** Draft → Under Review → Approved → Published → Superseded / Withdrawn
* **WatchlistAlert:** New → Triaged → Assigned → Acknowledged → In Progress → Resolved / Suppressed

*Each transition is logged with user, timestamp, and reason.*

---

## 22. Roles, RBAC, and Tenancy

### Roles
* Viewer
* Analyst
* Senior Analyst / Editor
* Approver / Manager
* Admin
* DPO / Compliance

### Tenancy
* `tenant_id` on all rows
* row-level security
* optional schema-per-tenant evolution path

### Access model
ABAC may combine:
* role
* source tier
* classification
* user clearance
* context constraints

---

## 23. Alert Triage and Noise Management

* hybrid automated scoring + human triage
* priority buckets: Critical, High, Medium, Low
* grouping of related alerts into episodes
* digest modes and thresholds to prevent fatigue
* policy/compliance-critical rules override weaker rules
* low-trust AI inferences require verification gate acceptance

---

## 24. Collaboration and Versioning

* collaborative Investigations and Briefings
* section-level edit controls where needed
* full version history
* revert capability
* explicit supersession links for Briefings

---

## 25. Data Lineage and Explainability

* source-level lineage
* transformation-level lineage
* model-level lineage for AI outputs
* every RAG answer and Story Capsule must expose the exact Documents and model/version lineage used

---

## 26. Failure Handling and Resilience

* all async jobs are idempotent
* retries are bounded with jittered backoff
* ingest freshness degradation is surfaced, not hidden
* if Story Capsule generation fails, canonical fields still render
* if RAG fails, keyword/document fallback still renders
* UI must never fabricate missing certainty

---

## 27. Human–AI Handoff Protocol

Each AI → human or team handoff includes:
* context summary
* key data points
* AI recommendation and rationale
* confidence score
* reason for low confidence where applicable
* explicit reason for handoff
* linked evidence bundle

*These handoffs are stored in Investigation and Briefing histories.*

---

## 28. Final Product Statement

NARAD V2 is a seven-workspace sovereign intelligence operating system for India. It combines GeoStrat, PulseBoard, CorpWatch, LexPulse, Watchlists, Investigations, and Briefings inside one shared command shell and one shared intelligence core. It is designed to ingest widely, present narrowly, stay evidence-backed, remain DPDPA-aware, and deliver low-latency intelligence without redundant data models or fragmented workflow silos.

***

