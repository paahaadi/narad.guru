# NARAD V2
## A Whitepaper on the Sovereign Intelligence Operating System for India

**Version:** 1.0
**Date:** March 2026
**Classification:** Public

---

> *"Narada, the sage, moved between worlds — carrying knowledge, connecting what was hidden, making the unseen visible. NARAD V2 is built in that tradition: an intelligence layer that sees across India's fragmented information landscape and surfaces what matters, when it matters, to those who need it."*

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [The Problem: India's Intelligence Gap](#2-the-problem-indias-intelligence-gap)
3. [What NARAD Is](#3-what-narad-is)
4. [The Seven Workspaces](#4-the-seven-workspaces)
5. [Knowledge Architecture: How Information Is Structured](#5-knowledge-architecture-how-information-is-structured)
6. [The Data Ecosystem: 32 Sources Across Three Trust Tiers](#6-the-data-ecosystem-32-sources-across-three-trust-tiers)
7. [How Intelligence Flows: From Raw Signal to Insight](#7-how-intelligence-flows-from-raw-signal-to-insight)
8. [AI Capabilities: Where Intelligence Is Amplified](#8-ai-capabilities-where-intelligence-is-amplified)
9. [Technical Architecture](#9-technical-architecture)
10. [Scalability: How NARAD Grows](#10-scalability-how-narad-grows)
11. [Trust, Security, and Governance](#11-trust-security-and-governance)
12. [Design Philosophy: Sovereign Midnight](#12-design-philosophy-sovereign-midnight)
13. [Who NARAD Serves](#13-who-narad-serves)
14. [What NARAD Is Not](#14-what-narad-is-not)
15. [The Roadmap](#15-the-roadmap)
16. [Conclusion](#16-conclusion)

---

## 1. Executive Summary

India produces more actionable intelligence data than almost any government on earth — gazette notifications, corporate filings, satellite imagery, parliamentary debates, coastal surveillance feeds, weather warnings, conflict monitoring reports. This data exists. It is public, structured, and authoritative.

The problem is not a lack of data. The problem is that this data is **dispersed across 30+ government portals, multiple agencies, five major languages, and half a dozen data formats**, with no unified layer to synthesize it into an operational intelligence picture.

Analysts today spend 60–80% of their time finding, normalizing, and cross-referencing sources. Watchlists are maintained in spreadsheets. Investigations are stitched together in email threads. Briefings are assembled by copy-pasting from a dozen browser tabs. Critical signals are missed because no one knows they exist.

**NARAD V2** is the answer. It is a **sovereign intelligence operating system for India** — a seven-workspace platform that ingests, processes, correlates, and presents unified intelligence across geospatial, event, corporate, regulatory, monitoring, investigation, and briefing domains. Built on a single canonical data model, powered by a real-time intelligence pipeline, and governed by India's data protection framework (DPDPA), NARAD transforms fragmented raw data into operational intelligence.

At scale, NARAD processes millions of documents per month, resolves entities across hundreds of sources without duplication, runs analyst workflows across thousands of concurrent users, and delivers intelligence to decision-makers in under five seconds — without ever requiring an LLM in the critical path of a decision.

---

## 2. The Problem: India's Intelligence Gap

### 2.1 The Scale of India's Information Landscape

India's information environment is uniquely complex:

- **Linguistic diversity** — 22 scheduled languages, hundreds of regional dialects, and multiple scripts mean that a factory fire reported in Odia and a regulatory order issued in Hindi may describe directly related events — yet no system connects them.
- **Source fragmentation** — government data is distributed across MCA21, SEBI's EDGAR, the eGazette portal, Digital Sansad, data.gov.in, Bhuvan, IMD, INCOIS, and dozens of other portals. Each has its own format, update cadence, and access model.
- **Latency** — a gazette notification is published in the morning. An enterprise risk team learns about it three days later from a consultant. By then, the affected party may have already filed for compliance or suffered a penalty.
- **Scale** — India produces roughly 30,000–50,000 company filings per month, hundreds of gazette notifications per week, live telemetry from thousands of aircraft and vessels at any moment, fire alerts from NASA FIRMS updated every ten minutes. No human team can process this volume manually.

### 2.2 How Analysts Work Today

A typical analyst building an intelligence picture of a corporate risk event in India:

1. Searches MCA21 for company registration data — downloads a PDF
2. Checks SEBI filings on NSE India's portal — manual navigation
3. Searches eGazette for regulatory references — keyword search, no semantic context
4. Cross-checks PIB for related government announcements — RSS scraping
5. Checks ACLED for conflict incidents in the region — CSV download
6. Opens Google Maps to understand the geography
7. Manually builds a timeline in a spreadsheet
8. Writes a report citing sources inconsistently

This process takes hours. It produces a static document. It cannot be monitored. It leaves no audit trail. And if a new event occurs tomorrow that changes the picture, no one knows until someone repeats the process.

### 2.3 The Missing Layer

What India's intelligence community — government analysts, enterprise risk teams, investigative journalists, policy researchers — needs is a **shared intelligence operating layer** that:

- Ingests all of these sources continuously and automatically
- Normalizes information into a common object model
- Resolves duplicate references to the same entity into one canonical record
- Clusters multiple reports of the same event into one deduplicated signal
- Surfaces the intelligence through purpose-built workspaces
- Maintains full provenance so every claim can be traced to its source
- Operates under India's data sovereignty and privacy framework
- Scales from a team of five analysts to an enterprise of five thousand

NARAD V2 is that layer.

---

## 3. What NARAD Is

**NARAD V2** stands for **National AI-powered Real-time Analysis Dashboard**, version 2.

It is not a search engine. It is not a news aggregator. It is not a BI dashboard. It is not a case management tool. It is all of these, integrated under one shared intelligence shell, operating on one shared data core.

### 3.1 The Core Idea: One OS, Seven Workspaces

NARAD is designed as a single operating system with seven workspaces — analogous to how Windows or macOS provides a shell with applications that share a file system, clipboard, and user model.

Every workspace in NARAD shares:
- One canonical object model (events, entities, documents, claims, relationships)
- One evidence layer (every claim traceable to a source document)
- One trust model (source tiers, confidence scores, verification gates)
- One governance model (RBAC, RLS, DPDPA compliance, dark archive)
- One design shell (the Sovereign Midnight command center interface)
- One command bar (universal intent routing across all seven workspaces)

This is architecturally deliberate. In most enterprise software stacks, a risk team's compliance system, a newsroom's investigation tracker, and a government analyst's situational awareness map are three separate products with three separate data models. An entity resolved in the compliance tool is unknown to the investigation tracker. A regulatory change tracked in the monitor is not visible in the situational awareness map. NARAD eliminates these silos at the data layer.

### 3.2 The Three Planes

NARAD operates across three separable planes:

| Plane | Role | Technology |
|---|---|---|
| **App Plane** | Delivers workspaces to users through a high-speed web runtime | Next.js 15, TypeScript, MapLibre GL JS, Zustand, Framer Motion |
| **Intelligence Plane** | Runs the ingestion, normalization, enrichment, and AI pipeline | Python, FastAPI, Celery, Bhashini, Gemini |
| **Data Plane** | Stores and serves the canonical truth | PostgreSQL 16, TimescaleDB, PostGIS, pgvector, Redis, S3 |

These planes are deliberately decoupled. The App Plane never reads from live ingestion — it only reads from precomputed projections. The Intelligence Plane never blocks on user-facing requests. The Data Plane is the single durable source of truth and can be queried by authorized systems independently of the UI.

### 3.3 The Core Principle: No LLM in the Hot Path

This is the most important architectural decision in NARAD.

Every action a user takes — opening a map, filtering the event feed, viewing a company profile, switching workspaces, loading a watchlist, opening an investigation — is served from indexed SQL queries and precomputed projections. No live LLM call is made.

AI processes data asynchronously, in the background, before the user ever asks for it:
- Story Capsules are generated when events are canonicalized, not when a user opens them
- Entity summaries are refreshed when source data changes, not on demand
- Regulatory digests are precomputed when gazette notifications arrive, not when LexPulse loads
- Embeddings are generated in batch queues, not inline during ingestion

The result: NARAD feels instant. Intelligence surfaces in under one second for all hot-path queries. AI richness is always present. AI latency is never felt.

---

## 4. The Seven Workspaces

### 4.1 GeoStrat — Geospatial Command Center

**The question GeoStrat answers:** Where is something happening?

GeoStrat is the spatial intelligence surface — a full India map canvas that renders canonical events, live telemetry (aircraft, vessels, fire detections), infrastructure layers, and geopolitical risk signals simultaneously.

**What GeoStrat knows:**

At any given moment, GeoStrat can render:
- Live aircraft positions over India and surrounding airspace (OpenSky ADS-B feed, updated every 10 seconds)
- Active vessel traffic in Indian coastal waters and major ports (AIS feed)
- Real-time wildfire detections from NASA FIRMS (updated every 10 minutes)
- District-level event density — how many canonical events in the last 24/48/72 hours
- Infrastructure risk layers — nuclear facilities, major ports, railway junctions, highway corridors
- Regulatory action geography — which ministries and regulators are active in which states
- Weather warnings overlaid from IMD
- Land use and environmental change signals from Bhuvan/NRSC satellite data

**Six operational presets** configure GeoStrat for different intelligence missions:
1. **Security** — conflict events, protest locations, infrastructure incidents, security-related entity clusters
2. **Weather & Disaster** — IMD warnings, NDMA alerts, fire perimeters, flood inundation
3. **Mobility & Logistics** — aviation movements, maritime traffic, port congestion, rail disruptions
4. **Corporate & Economic** — company headquarters, SEZ locations, infrastructure projects, regulatory geography
5. **Legislative & Governance** — ministry-wise event density, regulatory action geography, parliamentary constituency overlays
6. **Environment & Land** — land use change, ULPIN-linked parcel events, environmental compliance events

**Performance architecture:** GeoStrat uses Mapbox Vector Tiles (MVT) served server-side, never sending raw GeoJSON to the browser. At national zoom levels, geometry is simplified. High-velocity moving layers (aircraft, vessels) are clustered client-side in Web Workers. The result is smooth 60fps rendering of 5,000+ simultaneous data points on the map without crashing the browser.

---

### 4.2 PulseBoard — Canonical Event Intelligence Feed

**The question PulseBoard answers:** What happened, and why does it matter?

PulseBoard is the event triage surface. It is the continuous, AI-synthesized feed of canonical events ranked by severity, confidence, and source trust. It is the first thing most analysts open every morning and the surface they return to throughout the day.

**What a PulseBoard event card contains:**

Every event card in the feed is a pre-assembled intelligence object:
- **Title** — normalized, plain-language event title
- **Summary** — 2–3 sentence synthesis of what happened
- **Severity** — Critical / High / Medium / Low / Informational
- **Confidence** — 0.00–1.00 composite score reflecting source trust and corroboration
- **Source trust tier** — whether the canonical source is Tier 1 (government), Tier 2 (structured enrichment), or Tier 3 (controlled)
- **Corroboration count** — how many sources reported this event
- **Place** — state, district, coordinates
- **Linked entities** — which companies, ministries, people, or infrastructure are involved
- **Story Capsule** — one-click access to AI-generated headline + explanation + evidence bundle
- **Actions** — Open on map, Add to Watchlist, Start Investigation, Export

**Real-time updates:**

PulseBoard updates through delta-only server pushes. When a new corroborating source arrives for an existing event, the feed card does not reload — only the changed fields (confidence, source_count) are pushed via WebSocket. This minimizes bandwidth and prevents jarring UI refreshes during high-tempo operational periods.

**Why the feed shows canonical events, not raw articles:**

An event like a refinery fire in Gujarat might generate 12 articles over 6 hours — from PIB, regional news RSS feeds, NDMA, and IMD. Without deduplication, a raw feed would show 12 entries. NARAD's event clustering shows one canonical event with `source_count = 12`, severity updated to reflect the composite picture, confidence upgraded as Tier 1 sources corroborate, and a Story Capsule synthesizing all evidence.

---

### 4.3 CorpWatch — Entity and Corporate Intelligence

**The question CorpWatch answers:** Who is involved, and what is their risk profile?

CorpWatch is the entity intelligence workspace. Every company, ministry, person, regulator, vessel, aircraft, land parcel, and infrastructure asset in NARAD is a canonical entity. CorpWatch provides deep profiles on entities, their relationships, their compliance history, and their recent event exposure.

**What CorpWatch knows about a company:**

- **Identity** — canonical name, all known aliases, CIN (MCA21), ISIN (BSE/NSE), industry, sector
- **Corporate structure** — authorized capital, paid-up capital, incorporation date, registered office, company class and status
- **Ownership** — shareholder breakdown (institutional, individual, promoter), percentage holdings, foreign ownership
- **Directorship** — current directors with DIN numbers, appointment dates, other directorships (cross-entity relationship graph)
- **Subsidiaries and affiliates** — the full corporate ownership tree, including JVs and associates
- **Compliance record** — MCA21 filing completeness, last filing date, breach count, penalty history
- **Regulatory exposure** — SEBI orders, CCI actions, sector regulator notices, court orders
- **Event history** — all canonical events linked to this entity in the last 30, 90, 365 days
- **Risk score** — 0–100 composite of compliance breaches, event severity, regulatory actions, debt indicators
- **Health score** — 0–100 composite of filing completeness, director stability, financial health indicators
- **Relationship graph** — visual representation of all entity-to-entity relationships (directed, temporal, confidence-scored)

**Navigation design:**

Opening an entity from PulseBoard or GeoStrat opens a CorpWatch slide-over panel — the full workspace context is preserved. An analyst watching an event on the map can open the linked company profile without losing their GeoStrat state, explore the ownership graph, and return to the map in the same workflow step.

---

### 4.4 LexPulse — Legislative and Regulatory Intelligence

**The question LexPulse answers:** What changed in law, policy, or regulation?

LexPulse monitors India's complete regulatory output — the Gazette of India, parliamentary bills, committee reports, ministry circulars, court orders, and regulator notifications — and presents it as a searchable, answerable, cited intelligence surface.

**What LexPulse ingests and understands:**

- Gazette of India (eGazette) — Part I through Part IV, including ordinances, acts, notifications, rules, and appointments
- Digital Sansad — parliamentary debates, committee reports, question-answer sessions
- SEBI circulars and orders
- RBI notifications and master circulars
- MCA21 regulatory notifications
- CCI orders
- NCLT / NCLAT / NCDRC orders (where public)
- Ministry-specific annual reports and policy documents
- PRS India for bill tracking and legislative analysis

**How LexPulse answers questions:**

When an analyst asks "What changes has SEBI made to related-party transaction rules in the last 90 days?", LexPulse follows a four-step retrieval path:

1. **Semantic cache lookup** — if a semantically similar question was answered recently, return the cached answer instantly
2. **Hybrid retrieval** — parallel execution of vector (pgvector HNSW) and keyword (PostgreSQL tsvector BM25) search over the regulatory corpus, combined via Reciprocal Rank Fusion
3. **Cited answer generation** — Gemini generates a structured answer citing the exact documents, sections, and effective dates retrieved
4. **Fallback** — if generation exceeds the latency threshold (3 seconds), the hybrid retrieval results are returned directly, giving the analyst the source documents without a synthesized answer

Every LexPulse answer includes:
- **What changed** — plain-language delta (e.g., "SEBI raised the materiality threshold for RPT disclosures from ₹10 crore to ₹50 crore")
- **Why it matters** — sector-specific impact analysis
- **Affected sectors** — which industries are impacted
- **Effective date** — when the change takes effect
- **Source** — exact document, gazette reference, section number, publication date

---

### 4.5 Watchlists — Continuous Monitoring

**The question Watchlists answers:** What changed in the things I care about?

Watchlists transform NARAD from a reactive intelligence platform into a proactive monitoring system. An analyst defines what they are watching — a set of entities, a geographic zone, a regulatory subject, a company — and the Watchlist engine continuously evaluates incoming events against their rules, generating alerts when conditions are met.

**What you can watch:**

| Target Type | Example |
|---|---|
| Entity | "Watch Adani Ports" |
| Geography | "Watch Mumbai Metropolitan Region" |
| Event type + location | "Watch all corporate events in Karnataka" |
| Regulatory subject | "Watch all SEBI notifications about mutual funds" |
| Asset | "Watch JNPT port operations" |
| Company financial indicators | "Alert when Vedanta's risk score exceeds 75" |

**Rules:**

Watchlist rules are written in JSON Logic — a structured, evaluatable rule format that works identically in Python (backend evaluation) and JavaScript (frontend preview). Example rule:

```json
{
  "and": [
    {"in": ["maharashtra", {"var": "event.state_code"}]},
    {">=": [{"var": "event.severity_rank"}, 2]},
    {"in": ["corporate", {"var": "event.event_type"}]}
  ]
}
```

This rule fires for any corporate event of High severity or above in Maharashtra.

**Alert lifecycle:**

Alerts are not passive notifications. They are first-class objects with their own lifecycle: `New → Triaged → Assigned → Acknowledged → In Progress → Resolved / Suppressed`. Related alerts are grouped into **episodes** — a sequence of related alerts representing the same underlying situation — preventing alert fatigue when one incident triggers multiple rules.

**Monitoring intelligence:**

The Watchlist engine continuously computes:
- Entity health drift (is the risk score moving?)
- Event frequency change (is this entity appearing in more events than usual?)
- Risk velocity over rolling time windows
- Escalation trends across episode groups

---

### 4.6 Investigations — Analyst Case Workspace

**The question Investigations answers:** What case am I building, and what evidence supports it?

Investigations is NARAD's structured OSINT case management workspace. It provides digital evidence management, hypothesis tracking, timeline construction, entity-relationship visualization, and collaborative case workflows in a single interface.

**Case structure:**

Every investigation contains:
- **Case overview** — title, classification level, working hypothesis, current status, confidence
- **Item manifest** — canonical events, entities, documents, and claims linked into the case, each with an analyst-assigned role (key evidence, supporting, context, lead, exculpatory, disputed)
- **Evidence vault** — digitally secured artifacts with SHA-256 hash at ingest and WORM-compliant storage
- **Chain of custody log** — every access to every piece of evidence is permanently logged: who, when, what action, what was the hash at that moment
- **Timeline** — chronological view of all linked events and actions
- **Spatial map** — geographic view of the investigation's entity and event geography
- **Notes and hypotheses** — analyst notes, AI-generated hypothesis drafts pending verification
- **Task management** — investigation task list for collaborative case work

**Digital evidence standards:**

Investigations implements forensic-grade evidence handling:
- SHA-256 hash computed at evidence intake — any subsequent modification is detectable
- ssdeep fuzzy hash for media artifacts where exact-match isn't appropriate
- WORM-compliant (Write Once, Read Many) storage for all evidentiary artifacts
- Chain-of-custody log is INSERT-only at the database level — no UPDATE or DELETE is possible, even by administrators
- Every export is logged; every view of a secure document is logged
- Evidence hash is re-verified at every access point

**The Verification Gate:**

When AI generates an insight from lower-trust or volatile sources, it is placed behind a verification gate:
- The insight is visually marked as unverified (purple accent in the UI, distinct from confirmed evidence)
- The analyst must open the underlying source documents before the gate allows acceptance
- Acceptance is logged: user ID, timestamp, document hash at time of acceptance
- Only after explicit human acceptance does the derived claim become canonical and usable in briefings

This ensures that AI accelerates investigation work without allowing unverified machine inference to enter the evidentiary record.

---

### 4.7 Briefings — Intelligence Publication

**The question Briefings answers:** What do I need to communicate to decision-makers?

Briefings closes the intelligence lifecycle — it is where analyzed intelligence becomes a formal intelligence product. It provides AI-assisted draft generation, section-level editing, approval workflows, version control, and distribution management.

**The briefing lifecycle:**

```
Draft → Under Review → Approved → Published → Superseded / Withdrawn
```

Each stage is logged. Approval requires an explicit action from a user with the `approver` role. Published briefings cannot be modified — they can only be superseded by a new version, creating an immutable audit chain.

**What goes into a briefing:**

A briefing can synthesize from any combination of:
- Canonical events from PulseBoard
- Investigation case outputs and findings
- Watchlist change feeds
- LexPulse regulatory changes
- CorpWatch entity profiles and risk scores

The AI draft tool generates a structured briefing with:
- Executive summary
- Key findings sections (with evidence citations)
- Risk assessment
- Recommendations
- Source list with trust tier annotations

Every AI-generated section is clearly marked. The analyst edits freely. The source inspection view lets the approver verify every cited document before approval.

**Version control:**

Every edit creates an immutable version snapshot. `version_number` is monotonically increasing. A briefing superseding an older one must explicitly link to the superseded version, creating a traceable chain. The `superseded` version remains accessible in archives.

---

## 5. Knowledge Architecture: How Information Is Structured

The most important design decision in NARAD is the **canonical ontology** — the definition of every real-world object the system tracks, how objects relate, and what rules govern changes to them.

### 5.1 The Canonical Object Model

NARAD represents the world through twelve fundamental object types:

| Object | What It Represents | Example |
|---|---|---|
| **Source** | A data feed or authority NARAD ingests from | "Gazette of India — eGazette portal, Tier 1, daily" |
| **Document** | A single ingested artifact | A gazette notification PDF, an OpenSky telemetry batch, a news article |
| **Entity** | A canonical real-world object | "Adani Enterprises Limited", "SEBI", "Mumbai International Airport", "INS Vikrant" |
| **Event** | A canonical real-world incident | "SEBI issues show-cause notice to Adani group — 2026-03-24" |
| **Claim** | A single factual assertion extracted from a document | "The notice was issued under Section 15HA of SEBI Act" |
| **Relationship** | A directed, temporal, confidence-scored link between entities | "SEBI regulates Adani Enterprises, confidence 1.00, currently active" |
| **Impact** | Structured impact assessment of an event | "Economic impact: High, estimated ₹2,000 crore market cap impact" |
| **Story Capsule** | AI-generated explanatory bundle for an event | Headline + explanation + evidence bundle |
| **Watchlist** | Monitoring container with items and rules | "India Maritime Security — watches 12 ports, 3 vessel classes" |
| **WatchlistAlert** | A fired rule with lifecycle management | "Unusual vessel activity near Port of Vishakhapatnam — Critical" |
| **Investigation** | Structured case over canonical objects | "Adani Ports Land Acquisition — Maharashtra — Active" |
| **Briefing** | Formal intelligence publication | "Weekly Maritime Security Digest — Week 13/2026 — Published" |

**The foundational rule:** No workspace stores its own object types. GeoStrat does not have a "GeoStrat event". CorpWatch does not have a "CorpWatch company record". Every workspace reads from the same canonical objects, with different visual projections of the same underlying data.

### 5.2 The Information Flow: Document → Claim → Event → Entity

Every piece of intelligence in NARAD follows the same transformation path:

```
Raw Source Signal
       ↓
   Document (raw ingested artifact, preserved exactly as received)
       ↓
   Claims (extracted factual assertions, each with confidence and provenance)
       ↓
   Events (clustered, deduplicated, canonicalized incidents)
       ↓
   Entities (resolved, merged, enriched real-world objects)
       ↓
   Projections (precomputed workspace-specific read models)
       ↓
   User Surface (PulseBoard feed, CorpWatch profile, GeoStrat map layer)
```

Every step is lineage-tracked. An analyst can trace any fact displayed in any workspace back through:
- Which projection generated it
- Which canonical event or entity it came from
- Which claims supported that event
- Which documents those claims came from
- Which source provided that document
- When the document was fetched
- What model extracted the claim
- What confidence score was assigned

This is not just useful for audit. It is operationally critical: when an analyst challenges a fact displayed in a briefing, they can verify it in seconds.

### 5.3 The Trust Architecture

Not all information is equal. NARAD's trust architecture quantifies reliability at every layer:

**Source Trust Tiers:**
- **Tier 1 — Source of Record:** Government portals, parliamentary records, regulatory filings. The highest confidence. If the eGazette says an act was amended, it was amended.
- **Tier 2 — Structured Enrichment:** Well-maintained third-party data (ACLED conflict data, OpenSky ADS-B, NASA FIRMS). High confidence, independent verification available.
- **Tier 3 — Controlled/Licensed:** Commercial providers, social media monitoring, archived content. Requires explicit governance approval before ingestion.

**Confidence Scores (0.00–1.00):**
- Deterministic match on a unique external ID (CIN, ISIN, ICAO24) → 1.00
- Corroborated by multiple Tier 1 sources → 0.90–0.99
- Single Tier 2 source, no contradiction → 0.70–0.89
- Probabilistic entity match, pending review → 0.60–0.85
- AI-generated claim, unverified → 0.50–0.75

**Lineage Hashes:**
Every extracted claim carries a SHA-256 fingerprint of `(source_document_id + extraction_model + extracted_content)`. This makes every AI output reproducible, auditable, and tamper-detectable.

**Credibility Decay:**
Tier 3 sources that repeatedly contradict Tier 1 sources have their trust weight reduced dynamically. Unreliable signals cannot dominate hot-path summaries.

---

## 6. The Data Ecosystem: 32 Sources Across Three Trust Tiers

NARAD's intelligence is only as good as the sources it ingests. The platform was designed around a curated inventory of 32 authoritative Indian data sources, structured by trust tier.

### 6.1 Tier 1 — Source-of-Record (12 sources)

These are the official, primary-authority sources that define ground truth:

| Source | Domain | Data |
|---|---|---|
| **data.gov.in** | Government data portal | Cross-ministry datasets, statistics |
| **Bhuvan / NRSC** | ISRO geospatial | Satellite imagery, land use, disaster response |
| **PIB (Press Information Bureau)** | Government communications | Official press releases from every ministry |
| **IMD (India Meteorological Department)** | Weather | Forecasts, warnings, cyclone tracking |
| **CWC (Central Water Commission)** | Hydrology | River levels, dam storage, flood alerts |
| **MCA21** | Corporate registry | Company registrations, filings, directorships |
| **SEBI / BSE / NSE** | Capital markets | Securities filings, orders, disclosures |
| **Digital Sansad / Parliament Digital Library** | Legislature | Bills, debates, committee reports, Q&A |
| **Gazette of India / eGazette** | Official government record | Acts, amendments, notifications, appointments |
| **PARIVESH** | Environment | Environmental clearances, project status |
| **DILRMP / ULPIN / NGDRS** | Land records | Unique land parcel identifiers, registration |
| **INCOIS** | Ocean state | Coastal hazards, tsunami warnings, oil spill alerts |

### 6.2 Tier 2 — Structured Enrichment (6 sources)

These are well-maintained, high-quality third-party sources that enrich Tier 1 with broader coverage:

| Source | Domain | Data |
|---|---|---|
| **ACLED** | Conflict research | Conflict events, protests, political violence |
| **NASA FIRMS** | Satellite fire monitoring | Active fire detections (MODIS/VIIRS), updated every 10 minutes |
| **OpenSky Network** | Aviation | Live ADS-B aircraft positions, flight tracks |
| **GDELT** | Global events | Structured event data from global news |
| **PRS India** | Legislative research | Bill summaries, amendment tracking, committee analysis |
| **Curated regional RSS** | Regional news | State-level news in regional languages |

### 6.3 Tier 3 — Controlled / Licensed (14 sources)

These sources require explicit governance approval before ingestion and are subject to enhanced access controls:

- Commercial AIS providers (vessel tracking beyond coastal waters)
- Deeper corporate and exchange data feeds
- Social media monitoring channels (SOCMINT)
- Archived content requiring takedown management
- Financial market data with licensing requirements
- Additional regional media with consent-based access

### 6.4 Multilingual Ingestion

India's linguistic diversity is not an obstacle in NARAD — it is a design target.

Every ingested document retains its original language. Bhashini (India's AI-powered translation infrastructure) is integrated asynchronously into the ingestion pipeline:

1. Document arrives in Tamil, Bengali, Gujarati, or Marathi
2. Original text is stored in `documents.body_text` with `original_language` tag
3. Async translation worker sends to Bhashini API
4. English canonical translation stored in `documents.translated_text`
5. NLP/LLM extraction runs on the English translation
6. Original language is preserved for evidence and audit

This means an analyst searching NARAD in English surfaces events reported in any of India's 22 scheduled languages. The source document in the original language is always available for citation.

---

## 7. How Intelligence Flows: From Raw Signal to Insight

The intelligence pipeline is the core operational engine of NARAD. It runs continuously, processing every incoming document through a sequence of transformations that convert raw signals into actionable intelligence.

### 7.1 The Seven Processing Commands

NARAD's intelligence pipeline is implemented as seven distinct command types, each executed asynchronously by the Python Celery worker fleet:

#### Command 1: IngestDocument

The entry point for every piece of information entering NARAD.

- **Fetch** — the source adapter fetches the document (RSS item, API response, PDF scrape, telemetry batch)
- **Deduplicate** — SHA-256 content hash is checked against existing documents for the same source. If already ingested, the job terminates. No duplicate processing.
- **Store** — raw text and original artifact are stored. Language is detected.
- **Trigger** — downstream processing is queued: translation, claim extraction, event matching

**Why content hashing matters:** A gazette notification might be scraped by three different processes at three different times. Without content hashing, the same document enters the pipeline three times, generating three sets of duplicate claims, events, and alerts. Content hashing makes the process exactly once — a critical correctness guarantee.

#### Command 2: ExtractClaims

The NLP/LLM extraction step.

- **Translate** — if the document is not in English, Bhashini translation is applied
- **Extract** — the extraction model (Gemini) reads the document and extracts structured claims: factual assertions, with the model's confidence score
- **Hash** — each claim receives a lineage hash (`SHA-256(document_id + model_name + claim_text)`)
- **Store** — claims are stored in `core.claims` with full provenance

Claims are the atomic unit of machine-extracted intelligence. A 5,000-word gazette notification might yield 15–20 distinct claims. Each claim can independently be linked to entities, events, and investigations.

#### Command 3: CanonicalizeEvent

The deduplication and clustering step — the most intellectually complex command.

When an event-type document is ingested (a news article, an NDMA bulletin, an ACLED entry), the canonicalization engine determines whether it represents a new event or a corroboration of an existing one.

**Clustering criteria:** Two events are candidates for the same cluster if:
- Temporal proximity: occurred within 24 hours of each other
- Spatial proximity: location within 50km
- Same event type (a fire cannot cluster with a corporate filing)

And at least one of:
- Semantic similarity: embedding cosine similarity > 0.85
- Entity overlap: share at least one linked entity
- Title similarity: trigram similarity > 0.70

When a new document corroborates an existing event:
- The canonical event's `source_count` is incremented
- Confidence may be upgraded (Tier 1 corroboration of a Tier 2 event raises confidence significantly)
- A new `event_document_links` record is created with `link_type = 'corroboration'`
- The new document's claims are linked to the canonical event

When a new document contradicts an existing canonical event:
- A `contradiction` link is created
- Canonical event confidence is reduced
- If confidence falls below 0.50, the event is flagged for analyst review

**The result:** The PulseBoard shows one event with `source_count = 8` rather than eight identical entries. The analyst sees a richer, more confident signal.

#### Command 4: ResolveEntity

The entity disambiguation step.

When a document or event references an entity — a company name, a person, a ministry, a vessel — the resolution engine determines whether this is a new entity or an existing one.

**Deterministic resolution** matches on unique external IDs. If a document contains CIN `U63090GJ2006PLC058865`, that is unambiguously Adani Ports and Special Economic Zone Limited. Confidence is 1.00. The entity is auto-resolved.

**Probabilistic resolution** handles the harder case — entity mentions without external IDs:
1. Trigram similarity (pg_trgm) on name and aliases — threshold ≥ 0.70
2. Type match required (a "company" cannot merge with a "person")
3. Spatial proximity if both have location
4. Source trust tier weighting
5. Temporal co-occurrence scoring

Pairs scoring ≥ 0.85 are auto-merged. Pairs scoring 0.60–0.85 are flagged for a human analyst to review at a Verification Gate. Below 0.60, they remain separate entities.

**Merge protocol:** When two entities merge, the canonical name goes to the higher-trust source's version. All aliases from both entities are preserved. All FK references across the database (event_entity_links, claims, relationships) are updated to point to the surviving entity ID. The merged entity's UUID history is preserved in `resolved_from[]`.

#### Command 5: GenerateStoryCapsule

The AI synthesis step — the only step where LLM calls happen for user-facing content.

After an event is canonicalized and its linked entities are resolved, the Story Capsule generator assembles the evidence bundle and calls Gemini to synthesize:
- **Headline** — one-sentence summary of the event
- **Explanation** — 3–5 sentence plain-language explanation for a non-specialist audience
- **Key facts** — structured list of most important extracted claims
- **Evidence bundle** — array of `{document_id, relevance_score, excerpt}` backing the explanation

The prompt hash and model version are stored with the capsule, making every AI output reproducible. The capsule has a TTL — as events age and resolve, old capsules expire and new ones are generated if the event has new activity.

Critically: Story Capsules are generated **before** any user opens the event. When the analyst opens a PulseBoard card, the capsule is already there. The AI latency has already been paid, invisibly, in the background.

#### Command 6: EvaluateWatchlistRules

The monitoring engine.

After any canonical event is written or any entity is updated, the rule evaluator queries all active watchlists to check whether any rule conditions are met. Rules are evaluated in Python using the `jsonlogic` library — the same library used in the frontend to preview rules before saving.

When a rule fires:
- A `WatchlistAlert` is created with status `new`
- The alert is linked to the triggering event or entity
- If multiple recent alerts for the same watchlist share similar event clusters, they are grouped into an episode
- The alert appears in the Watchlists workspace within 1 second of the triggering event being written

#### Command 7: TransitionState

The lifecycle management step.

State machines govern the lifecycle of Events, Investigations, Briefings, and WatchlistAlerts. TransitionState validates that a requested transition is permitted (e.g., you cannot transition an Investigation from `draft` to `closed` — it must pass through `active`), logs the transition in `audit.state_transitions`, and applies any side effects (e.g., triggering a notification when a Briefing moves to `approved`).

### 7.2 Processing Guarantees

Every command in the pipeline is **idempotent** — if a worker crashes mid-execution and the job is retried, the result is the same as if it ran once. This is enforced via:
- Content hash deduplication (IngestDocument)
- UPSERT semantics in projection writes
- Lineage hashes on claims (prevent duplicate extraction)
- Entity resolution checks before merge (prevent duplicate merges)

Retries use **exponential backoff with jitter** — failed jobs wait 2s, then 4s, then 8s, etc., with random jitter to prevent thundering herd effects when many workers restart simultaneously.

---

## 8. AI Capabilities: Where Intelligence Is Amplified

NARAD uses AI in precisely defined roles — to amplify human analyst capability, never to replace human judgment on consequential decisions.

### 8.1 AI Roles in NARAD

| AI Capability | Where Used | Model |
|---|---|---|
| **Claim extraction** | NLP extraction from documents → Claims | Gemini 2.5 Flash |
| **Event canonicalization** | Semantic clustering of duplicate events | Embedding similarity (Gemini text-embedding-004) |
| **Entity resolution** | Probabilistic entity matching | pg_trgm + embedding similarity |
| **Story Capsule generation** | Event explanation and evidence synthesis | Gemini 2.5 Flash |
| **Regulatory answer generation** | LexPulse cited answers | Gemini 2.5 Pro |
| **Briefing draft generation** | Initial draft from investigation/watchlist context | Gemini 2.5 Pro |
| **Hypothesis drafting** | AI-suggested investigation hypotheses | Gemini 2.5 Flash |
| **Translation** | Multilingual document ingestion | Bhashini API |

### 8.2 Semantic Search and Retrieval

NARAD implements hybrid retrieval across its intelligence corpus — combining two fundamentally different search approaches:

**BM25 (Keyword Search):**
PostgreSQL's `tsvector` columns maintain full-text search indexes on all documents, events, entities, and claims. BM25 keyword search is exact and fast — perfect for searching known terminology, regulatory references, and specific names. It does not understand meaning.

**Vector Search (Semantic Search):**
768-dimensional embeddings generated by Gemini `text-embedding-004` are stored in pgvector columns on documents, events, entities, and claims. HNSW (Hierarchical Navigable Small World) indexes enable approximate nearest-neighbor search — finding documents that are *about the same thing* even when they don't share exact keywords. A search for "coastal security incident" will find documents about "maritime threats near the Andaman Sea" even without keyword overlap.

**Reciprocal Rank Fusion (RRF):**
Results from BM25 and vector search are combined using Reciprocal Rank Fusion — a simple, effective fusion technique that promotes documents that rank well in both approaches. Additionally, results are re-weighted by:
- **Recency** — more recent documents rank higher for current events queries
- **Trust tier** — Tier 1 source documents rank above Tier 3 for factual queries

**Semantic Cache:**
LexPulse and other answer surfaces consult a semantic cache before retrieval and generation. The cache stores `(query_embedding, answer, citations)` with a TTL. If an incoming query's embedding is within cosine similarity threshold of a cached query, the cached answer is returned immediately — no retrieval, no LLM call. This provides instant responses for frequently asked regulatory questions while ensuring staleness is bounded by the cache TTL.

### 8.3 AI Boundaries: What NARAD's AI Will Not Do

NARAD is explicit about AI limitations:

**AI does not make final intelligence judgments.** Story Capsules are clearly labeled as AI-synthesized. Extracted claims are marked with confidence scores and require verification gate acceptance before entering evidentiary records.

**AI does not override source trust.** A Tier 3 source's AI-extracted claim cannot elevate a Tier 1 source's contradicting fact. Trust tier is enforced structurally, not just in the UI.

**AI does not operate in the hot path.** No user interaction — map movement, feed filtering, drawer opening, workspace switching — triggers a live LLM call. This is a hard architectural constraint, not a policy.

**AI-generated content is visually distinct.** Purple accent (#A855F7) in the Sovereign Midnight design system is reserved exclusively for AI-generated or predictive content. Hard sensor data and Tier 1 source content are never marked purple. Analysts develop an immediate visual literacy for what is machine-generated vs what is confirmed.

---

## 9. Technical Architecture

### 9.1 The Three-Plane Model

NARAD's architecture separates concerns into three independently scalable planes:

```
┌──────────────────────────────────────────────────────────┐
│                      APP PLANE                           │
│  Next.js 15 (App Router)  │  MapLibre GL JS + Deck.gl    │
│  TypeScript               │  Zustand state management    │
│  Server Components        │  Framer Motion animations    │
│  WebSocket gateway        │  MVT tile consumer           │
└──────────────────────────────────────────────────────────┘
                             │ reads projections
                             ▼
┌──────────────────────────────────────────────────────────┐
│                    DATA PLANE                            │
│  PostgreSQL 16            │  Redis 7                     │
│  + TimescaleDB            │  (pub/sub + hot cache)       │
│  + PostGIS                │                              │
│  + pgvector               │  S3 / Object Storage         │
│  + pg_trgm                │  (documents + dark archive)  │
│  PgBouncer (txn mode)     │                              │
└──────────────────────────────────────────────────────────┘
                             ▲ writes canonical objects
                             │
┌──────────────────────────────────────────────────────────┐
│                 INTELLIGENCE PLANE                       │
│  FastAPI (command API)    │  Celery (distributed tasks)  │
│  asyncpg                  │  Redis (task broker)         │
│  Bhashini client          │  Gemini API client           │
│  Source adapters (32)     │  Entity resolver             │
└──────────────────────────────────────────────────────────┘
```

### 9.2 CQRS: One Write Model, Many Read Projections

NARAD uses Command Query Responsibility Segregation (CQRS) as its core data access pattern.

**Why CQRS?**

The intelligence pipeline writes to a normalized, relational write model — 30+ tables with foreign keys, indexes, and complex join relationships. This write model is optimized for correctness and integrity, not for reading.

The UI needs to serve millions of queries per day at sub-second latency. Serving PulseBoard from a live JOIN across 6 tables with filtering, sorting, and pagination on every request would be slow and increasingly so as data grows.

CQRS solves this by maintaining a set of **precomputed read projections** in the `projections` schema. When data in the write model changes, asynchronous projection workers update the relevant projection tables. UI reads from projections only — zero joins at read time, near-constant latency regardless of write model complexity.

**Four Production Projections:**

| Projection | Powers | Max Staleness |
|---|---|---|
| `projections.pulseboard_feed` | PulseBoard event card stream | 500ms |
| `projections.watchlist_deltas` | Watchlist change feed | 1 second |
| `projections.entity_summaries` | CorpWatch mini-profiles, slide-overs | 5 seconds |
| `projections.regulatory_digest` | LexPulse regulatory feed | 5 seconds |

**Eventual Consistency Model:**

Projections are eventually consistent. When an analyst performs an action (starts an investigation, adds an entity to a watchlist), the write is acknowledged immediately. The projection update follows within the staleness window. The UI shows a subtle "refreshing" indicator during this window, maintaining user trust.

### 9.3 Real-Time Delivery

The WebSocket gateway bridges the backend event stream to the browser:

1. A canonical event is written to `core.events`
2. The command handler publishes to Redis pub/sub channel `events:new`
3. The projection worker updates `projections.pulseboard_feed`
4. The WebSocket gateway, subscribed to Redis, pushes a **delta-only payload** to connected clients
5. The browser receives `{"event_id": "uuid", "severity": "HIGH", "source_count": 4}` — only changed fields, not the full event
6. The Zustand store patches the affected card in memory
7. Framer Motion animates the card update

**Delta-only payloads are critical at scale.** A full event payload is 2–5 KB. A delta payload is 50–200 bytes. With 10,000 concurrent users watching the PulseBoard, the difference between full-payload and delta pushes is the difference between 50 MB/s and 2 MB/s of WebSocket traffic per high-tempo incident.

**High-velocity layer throttling:**

GeoStrat's moving layers (aircraft, vessels) generate thousands of position updates per second. These are throttled by:
- **Viewport filtering** — only positions visible in the current map view are pushed
- **Debouncing** — positions are batched and pushed at intervals (1 second for aircraft, 5 seconds for vessels), not individually
- **Clustering** — at national zoom levels, individual positions are replaced with cluster counts

### 9.4 Database Architecture

The `core` schema's 12 tables form the canonical write model. Key design decisions:

**UUID v7 primary keys** — time-ordered UUID generation prevents B-tree index fragmentation that random UUID v4 causes. Every insert lands at the end of the index, not at a random position. Write performance is dramatically better at scale.

**TIMESTAMPTZ everywhere** — all timestamps are timezone-aware, preventing silent bugs when data crosses geographic regions.

**RLS for multi-tenancy** — PostgreSQL Row-Level Security policies enforce tenant isolation at the database layer. Every table has an RLS policy keyed on `tenant_id`. An application bug cannot expose one tenant's data to another.

**Foreign key indexes** — every FK column has an explicit index. PostgreSQL does not auto-index FKs. Missing FK indexes cause full table scans on JOINs and CASCADE operations — a performance cliff that appears only at scale.

**PgBouncer in transaction mode** — connection pooling multiplexes hundreds of app-level connections onto a small pool of real database connections, preventing connection exhaustion at scale.

---

## 10. Scalability: How NARAD Grows

NARAD's architecture was designed with a specific philosophy: **choose the cheapest path that works for the first 100x of growth, and design clean boundaries that allow escape hatches beyond that**.

### 10.1 Data Volume Scalability

**At 1 million documents/month (current target):**
- PostgreSQL handles this comfortably with appropriate indexes
- All 4 projections can be updated synchronously post-write within staleness targets
- A single Celery worker can process ingestion backlog within minutes of source updates

**At 100 million documents/month:**
- `core.events` and `core.documents` partition by `created_at` (monthly range partitioning), activated at 100M rows
- Projection workers scale horizontally — add workers to the Celery fleet, projection refresh throughput scales linearly
- `audit.audit_log` monthly partitions allow instant `DROP TABLE` for old compliance data without expensive `DELETE + VACUUM` cycles
- pgvector HNSW indexes are rebuilt periodically as new embeddings are added; partial indexes (`WHERE embedding IS NOT NULL`) prevent indexing rows awaiting async embedding generation

**At 1 billion documents/month (future):**
- Read replicas for projection workers (projection reads move to replicas, canonical writes stay on primary)
- Logical replication for geo-redundancy
- The CQRS projection rebuild protocol allows hot-swapping projection schemas without downtime
- The `core` schema can be migrated to a distributed Postgres (Citus) without application changes, because all cross-aggregate references already use UUIDs

### 10.2 Concurrent User Scalability

**Connection management via PgBouncer:**

NARAD's PgBouncer configuration sets the pool size using the formula `(CPU_cores × 2) + effective_spindle_count`. For a 16-core database server, this yields a pool of approximately 35 connections. PgBouncer in transaction mode multiplexes an unlimited number of app-level connections onto these 35 real connections.

| User Count | Approach |
|---|---|
| 1–100 | Single Next.js instance, single Postgres primary |
| 100–1,000 | 3 Next.js instances behind load balancer, PgBouncer pool |
| 1,000–10,000 | Read replicas for App Plane queries, horizontal Next.js scaling |
| 10,000–100,000 | CDN-edge caching for projection reads, dedicated tile server, WebSocket gateway cluster |

**Stateless App Plane:**

Next.js Server Components are stateless — no session state on the server. Zustand manages all state client-side. This means the App Plane scales horizontally with zero coordination between instances. Adding a Next.js instance to the load balancer pool immediately increases capacity.

**Celery worker horizontal scaling:**

The Intelligence Plane scales by adding Celery workers. Each worker is identical and stateless (it fetches work from the Redis task queue). Doubling workers doubles ingestion throughput. Workers for CPU-intensive tasks (embedding generation) can be scaled independently from workers for I/O-intensive tasks (document fetching).

### 10.3 Intelligence Coverage Scalability

**Source expansion:**

New data sources are added by implementing a source adapter (a Python class following the base adapter interface) and registering the source in `core.sources`. The normalization, deduplication, and enrichment pipeline automatically processes the new source's documents. No schema changes required.

**New entity types:**

`entity_type` is implemented as a PostgreSQL CHECK constraint enumeration (currently 16 types). Adding a new entity type requires one migration (`ALTER TABLE ... ADD CHECK`), not a schema redesign. The `metadata JSONB` column on entities holds type-specific fields, so new types can carry arbitrary structured data without new columns.

**New workspace projections:**

Adding a new workspace or a new projection within an existing workspace requires:
1. A new table in the `projections` schema
2. A new projection worker (Celery task) that reads from canonical tables and writes the new projection
3. A new Next.js API route that reads the projection

The canonical write model is not modified. The existing workspaces continue functioning unchanged.

### 10.4 TimescaleDB Telemetry Scalability

The telemetry hypertable (`core.telemetry_events`) handles arbitrarily high write rates:
- TimescaleDB auto-partitions by time, keeping query plans optimal regardless of total data size
- Compression after 1 day achieves 10–20x storage reduction on older partitions
- Retention policy automatically drops chunks older than 7 days without manual maintenance
- Continuous aggregates (hourly and daily rollups) allow historical analysis without touching raw data

At OpenSky's current scale (~30,000 aircraft globally, ~5,000 over India at peak), NARAD ingests approximately 3,000 position updates per minute. TimescaleDB handles this with a single hypertable on commodity hardware.

### 10.5 AI Processing Scalability

**Embedding generation:**

Embeddings are generated asynchronously in batches of 50 (`EMBED_BATCH_SIZE = 50`). A batch update is a single SQL statement (`UPDATE ... WHERE id = ANY($1::uuid[])`), reducing 50 round-trips to 1. As the corpus grows, embedding workers scale horizontally; partial HNSW indexes (`WHERE embedding IS NOT NULL`) ensure the vector search index only covers rows that have embeddings.

**LLM call volume:**

Story Capsules are generated once per event, not once per user view. With 100,000 canonical events generated per month, this means approximately 100,000 LLM calls per month for story capsules — a fixed cost per event, not a variable cost per user. As users scale from 100 to 100,000, LLM costs remain constant.

The semantic cache in LexPulse further reduces LLM calls for regulatory queries. A frequently asked question ("What are the current FDI limits for defense manufacturing?") is answered from cache after the first generation, with zero additional LLM cost for subsequent identical or semantically similar queries.

---

## 11. Trust, Security, and Governance

### 11.1 Multi-Tenancy and Data Isolation

Every row in every NARAD table carries a `tenant_id`. Row-Level Security (RLS) policies at the PostgreSQL layer enforce that queries from Tenant A can never return data belonging to Tenant B — regardless of application-layer bugs.

Connection-level context:
```sql
SET app.current_tenant_id = 'tenant-uuid';
```
This single SQL statement, executed at connection setup, activates all RLS policies simultaneously. No row of another tenant's data is ever visible in the query planner.

### 11.2 Role-Based Access Control

Six user roles provide granular access control:

| Role | What They Can Do |
|---|---|
| **Viewer** | Read canonical events, entities, documents, projections |
| **Analyst** | Everything Viewer can + create watchlists, start investigations, create briefing drafts |
| **Senior Analyst** | Everything Analyst can + edit investigations, approve watchlist activations |
| **Approver** | Everything Senior Analyst can + approve briefings for publication |
| **Admin** | Full platform administration; tenant user management |
| **DPO** | Data Protection Officer; access to audit logs, erasure request management |

### 11.3 Clearance-Level ABAC

Beyond role-based access, NARAD implements Attribute-Based Access Control (ABAC) using `users.clearance_level`:

- `unclassified` — visible to all authenticated users
- `restricted` — visible to users with restricted clearance or above
- `confidential` — visible to users with confidential clearance or above
- `secret` — visible to users with secret clearance only

This maps to the classification levels applied to events, investigations, and briefings. An `unclassified` analyst cannot open a `confidential` investigation — this is enforced at both the application layer and the database layer.

### 11.4 Audit Trail

Every consequential action in NARAD is permanently logged in `audit.audit_log`:

- Object type, object ID, action (create/update/delete/export/view_evidence)
- Changed fields with before/after values
- User ID, IP address, user agent
- Timestamp

The audit table is INSERT-only — the `narad_ingest_writer` role has `REVOKE UPDATE, DELETE` applied. No one, not even administrators, can modify or delete audit records. The investigation evidence custody log carries the same constraint.

`audit.audit_log` is range-partitioned by month. Old partitions are dropped (not deleted) when retention periods expire — an instant operation that leaves no fragmented data behind.

### 11.5 DPDPA Compliance: The Dark Archive Protocol

India's **Digital Personal Data Protection Act (DPDPA)** grants individuals the right to have their personal data erased. For an intelligence platform, this creates a problem: an investigation, briefing, or canonical event may reference a document containing personal data. Deleting the document would break referential integrity.

NARAD solves this through the **Dark Archive Protocol**:

1. The full document and artifact are moved to `S3_BUCKET_DARK_ARCHIVE` — a WORM-compliant, access-controlled S3 bucket
2. `body_text` and `translated_text` in the document record are nullified
3. The `s3_key` is replaced with the dark archive key (accessible only to DPO role)
4. `content_hash`, `doc_type`, `source_id`, and anonymized metadata are retained
5. Linked claims are marked with `is_redacted = TRUE`
6. The erasure action is logged in `audit.audit_log`

The document record still exists. Its UUID still appears in investigation_items, briefing_versions, and event_document_links. Referential integrity is preserved. The content is gone. The DPDPA right to erasure is honored.

**This is architecturally enforced:** The `narad_ingest_writer` database role has `REVOKE DELETE ON core.documents`. No code path can directly delete a document row. Erasure must flow through the dark archive protocol, which always creates the audit log entry and WORM archive copy.

### 11.6 Database-Level Security Architecture

Three database roles implement least-privilege access:

- **`narad_app_reader`** (Next.js app plane) — SELECT only on `core`, `projections`, `geo_intelligence`, `corp_watch`, `lex_pulse`. Cannot write or delete anything.
- **`narad_ingest_writer`** (Python intelligence plane) — SELECT, INSERT, UPDATE on `core`; INSERT only on `audit`. Cannot DELETE on `core` (dark archive enforcement). Cannot touch `projections` schema.
- **`narad_projection_writer`** (async projection workers) — Full CRUD on `projections`; SELECT on `core` and `workflow`. Cannot modify canonical write model.

If the Next.js application layer were compromised, the attacker would have read-only access to canonical data. They could not modify, delete, or insert records.

---

## 12. Design Philosophy: Sovereign Midnight

The visual identity of NARAD is defined by the **Sovereign Midnight** design system — a design philosophy built for high-stakes, long-duration situational awareness.

### 12.1 The Silent Sentinel

Most intelligence dashboards look like they were designed to impress in a five-minute demo — bright colors, sharp borders, aggressive animation, "hacker aesthetic" aesthetics. They are exhausting to use for eight hours.

Sovereign Midnight is designed for the analyst who opens NARAD at 0600 and closes it at 2200. The aesthetic is **Institutional Authority** — quiet, precise, unshakeable. The interface feels like a high-performance command center, not a startup product.

### 12.2 The Abyssal Scale Palette

The color architecture is rooted in deep, receding blues and blacks:

| Surface Level | Color | Use |
|---|---|---|
| Base canvas | `#0B0E15` | Primary application background |
| Structural sections | `#0F131D` | Sidebars, secondary navigation |
| Primary content panels | `#141A26` | Main content areas |
| Active/focused elements | `#18202F` – `#1C2639` | Hovered cards, focused panels |

**Pure white (`#FFFFFF`) is forbidden.** All text uses `on-surface` (`#DCE5FF`) — a slightly cool white that prevents "halation" (the blooming effect of high-contrast white text on dark backgrounds during extended viewing).

### 12.3 The No-Line Rule

Borders are prohibited. Section boundaries are defined exclusively through **background color shifts** — a `surface-container-low` section on a `surface` background provides enough tonal contrast for the eye to perceive structure without the "boxed-in" feeling of bordered UI.

This is not aesthetic preference. It is a functional decision: in a high-density intelligence interface, every pixel of ink competes for attention. Borders consume attention without providing information.

### 12.4 The AI Color Protocol

**Purple (`#A855F7`)** is reserved exclusively for AI-generated insights, predictions, and probabilistic content. It appears nowhere else in the design system.

When an analyst sees purple in the interface, they know immediately: this is machine-generated content, not confirmed fact. They know to apply the verification gate before acting on it. This visual distinction is a trust-building mechanism — it makes the system's epistemic state visible at a glance.

### 12.5 Motion Philosophy

Animations use `200ms cubic-bezier(0.2, 0, 0, 1)` (Material Design's Decelerate easing) — smooth, heavy, deliberate. There are no "pop" animations, no bounces, no springs. Information surfaces and recedes with the weight of something real. The motion language reinforces the sense that the interface is showing you actual intelligence, not performing.

---

## 13. Who NARAD Serves

NARAD is designed for four primary user archetypes, each using the platform differently but sharing the same intelligence core.

### 13.1 Government and Security Operations Analysts

**Profile:** Works in a ministry situation room, emergency operations center, or intelligence coordination cell. Needs real-time situational awareness across a geographic region or domain.

**How they use NARAD:**
- GeoStrat is their primary surface — the map is always open
- PulseBoard handles morning triage — what changed overnight?
- Watchlists run continuously for their assigned regions and entities
- Investigations are opened for developing situations
- Briefings are generated for senior officials

**What they need from NARAD at scale:**
- GeoStrat rendering 5,000+ simultaneous data points without lag
- Alert latency < 1 second from event write to watchlist alert
- Investigation chain-of-custody standing up to administrative review
- Briefing approval workflows matching their institutional process

### 13.2 Enterprise Risk and Compliance Teams

**Profile:** Works in the compliance or risk function of a listed company, regulated financial institution, or multinational operating in India. Needs to track regulatory changes, counterparty risk, and sector events.

**How they use NARAD:**
- LexPulse is their primary surface — what changed in regulation today?
- CorpWatch for counterparty due diligence and ongoing monitoring
- Watchlists on key regulators, ministries, and counterparties
- Briefings as the output for board risk reporting

**What they need from NARAD at scale:**
- LexPulse semantic cache returning instant answers for common regulatory queries
- CorpWatch handling deep ownership graph traversal across 10+ company hops
- Watchlist evaluating rules across a portfolio of 500+ entities simultaneously

### 13.3 Investigative Journalists and OSINT Researchers

**Profile:** Works in an investigative newsroom or independent research context. Needs to build evidentiary cases, trace entity networks, and verify sources before publication.

**How they use NARAD:**
- Investigations is their primary workspace
- CorpWatch for corporate structure and director network analysis
- LexPulse for regulatory and judicial filings
- PulseBoard to track developing stories
- Briefings as the internal editorial record

**What they need from NARAD at scale:**
- Investigation evidence integrity standing up to publication review
- Entity resolution connecting the same company across multiple filings and news reports
- Full lineage from published fact back to source document

### 13.4 Policy Researchers and Think Tanks

**Profile:** Works in a policy research institution, think tank, or academic context. Needs to understand regulatory trends, legislative change, and regional economic patterns.

**How they use NARAD:**
- LexPulse as the primary research surface
- PulseBoard for current events in their research domain
- CorpWatch for economic data and corporate behavior patterns
- Briefings as research note output

**What they need from NARAD at scale:**
- LexPulse corpus depth — years of regulatory history retrievable through semantic search
- Citation completeness — every output citable to primary source

---

## 14. What NARAD Is Not

Understanding NARAD's boundaries is as important as understanding its capabilities.

**NARAD is not a search engine.** It does not crawl the open web. It ingests from a curated, governed set of 32 source types. This is a deliberate constraint: the alternative — open-ended web crawling — produces overwhelming noise, unclear provenance, and uncontrollable data governance obligations.

**NARAD is not a social media monitoring tool.** SOCMINT (social media intelligence) can be integrated as a Tier 3 source with explicit governance approval, but it is not a default capability and is not in scope for V2. The signal-to-noise ratio of social media for India-scale intelligence is currently too low to justify the governance complexity.

**NARAD is not a predictive intelligence system.** It does not predict future events. It surfaces, correlates, and contextualizes current and historical information. Risk scores and confidence values reflect the evidence NARAD has seen — they are not forward-looking predictions.

**NARAD is not an autonomous agent.** No AI decision in NARAD — no claim, no merged entity, no generated briefing — enters the evidentiary record or becomes canonical without passing through a human verification gate for consequential decisions. AI accelerates; humans decide.

**NARAD is not a replacement for classified intelligence infrastructure.** It operates on public and semi-public data. It does not interface with classified government systems, encrypted communications, or signals intelligence. The clearance levels in the access control system refer to internal classification of NARAD's own analysis products, not to national security classification systems.

---

## 15. The Roadmap

NARAD V2 is built in four production rollout phases:

### Phase 1 — Foundation (Sessions 1–4)
- ✅ Canonical ontology and data architecture (Complete)
- PostgreSQL DDL migrations — 30+ tables, indexes, RLS, roles
- Docker infrastructure — PostgreSQL 16, TimescaleDB, PostGIS, pgvector, Redis, PgBouncer
- Python/FastAPI/Celery backend scaffold
- Next.js 15 application shell with Sovereign Midnight design system

**Deliverable:** A running stack with empty schemas, verified infrastructure, and the shared command shell.

### Phase 2 — Core Intelligence (Sessions 5–9)
- Source adapters for all Tier 1 sources (12 sources)
- Ingestion pipeline: IngestDocument, ExtractClaims, CanonicalizeEvent, ResolveEntity commands
- Story Capsule generation
- GeoStrat workspace (map, layer presets, tile server)
- PulseBoard workspace (feed, event drawer, real-time updates)
- Bhashini integration for multilingual ingestion

**Deliverable:** A live intelligence platform — real events, real entities, real map layers from Tier 1 sources.

### Phase 3 — Intelligence Expansion (Sessions 10–15)
- CorpWatch workspace (entity profiles, ownership graphs, risk scores)
- LexPulse workspace (regulatory feed, RAG query, semantic cache)
- Watchlist engine (rule evaluation, alert lifecycle, episode grouping)
- Tier 2 source adapters (ACLED, NASA FIRMS, OpenSky, GDELT, PRS)

**Deliverable:** Full cross-workspace intelligence with monitoring capability.

### Phase 4 — Workflow and Scale (Sessions 16–20)
- Investigations workspace (evidence management, chain-of-custody, timeline)
- Briefings workspace (draft generation, approval workflow, versioning)
- Full 32-source ingestion (Tier 3 sources with governance controls)
- Performance hardening: partition migrations, read replica configuration, CDN tile caching
- DPDPA compliance audit and dark archive verification

**Deliverable:** Complete seven-workspace platform, production-hardened, compliance-ready.

---

## 16. Conclusion

India's information environment is vast, fragmented, multilingual, and authoritative. The intelligence it contains — in official government records, satellite feeds, corporate filings, regulatory notifications, and open-source reports — is largely inaccessible as unified operational intelligence.

NARAD V2 bridges this gap.

By establishing a **canonical ontology** that every source and every workspace shares, NARAD eliminates the redundancy and inconsistency that makes intelligence work expensive. By building a **real-time intelligence pipeline** that processes data asynchronously before users ever ask for it, NARAD delivers instant insight without LLM latency. By designing the **Sovereign Midnight** interface for sustained, high-density, long-duration operation, NARAD respects the humans who use it. By enforcing **DPDPA compliance, RBAC, RLS, and the dark archive protocol** at the database layer, NARAD makes sovereignty and privacy architectural realities rather than policy statements.

At small scale, NARAD is a powerful intelligence workbench for teams of five to fifty analysts. At large scale, it becomes an intelligence operating system for an enterprise, a ministry, or an intelligence community — processing millions of documents per month, resolving entities across hundreds of sources, monitoring thousands of watchlists, and delivering intelligence to thousands of concurrent users without performance degradation.

**The question India's intelligence community needs answered is not whether unified sovereign intelligence is possible. NARAD V2 is the answer to how.**

---

## Appendix A: Technology Stack Summary

| Layer | Technology | Purpose |
|---|---|---|
| Frontend framework | Next.js 15 (App Router) | Server-rendered workspaces, API routes |
| Language | TypeScript | Type safety across frontend and API |
| Map rendering | MapLibre GL JS + Deck.gl | GPU-accelerated 60fps map layers |
| State management | Zustand | Normalized client state, workspace slices |
| Animation | Framer Motion | Layout transitions, skeleton loaders |
| Primary database | PostgreSQL 16 | Canonical write model, projections |
| Time-series | TimescaleDB | Telemetry hypertable, retention |
| Geospatial | PostGIS | Spatial queries, geometry storage |
| Vector search | pgvector | 768d embedding similarity (HNSW) |
| Full-text search | PostgreSQL tsvector | BM25 keyword retrieval |
| Entity similarity | pg_trgm | Trigram matching for entity resolution |
| Connection pooling | PgBouncer (transaction mode) | Concurrent connection management |
| Async task queue | Celery + Redis | Intelligence pipeline job queue |
| Backend framework | FastAPI (Python) | Command handlers, worker API |
| Translation | Bhashini API | Multilingual document ingestion |
| LLM / generation | Gemini 2.5 Flash/Pro | Claim extraction, story capsules, briefings |
| Embeddings | Gemini text-embedding-004 | 768d semantic vectors |
| Pub/sub | Redis 7 | Projection sync, WebSocket gateway |
| Object storage | S3-compatible | Document archive, dark archive |

---

## Appendix B: Data Lineage Example

**Scenario:** A gazette notification is published on eGazette about an amendment to the Companies Act.

```
1. PIB RSS feed publishes a press release about the notification
   → IngestDocument creates Document #A (Tier 1, press_release)

2. eGazette portal publishes the full notification PDF
   → IngestDocument creates Document #B (Tier 1, gazette)

3. ExtractClaims processes Document #A
   → Claim #1: "MCA issued notification amending Section 92 of Companies Act"
   → Claim #2: "Amendment effective April 1, 2026"
   → lineage_hash computed for each claim

4. ExtractClaims processes Document #B
   → Claim #3: "Section 92 annual return filing threshold raised from ₹2cr to ₹10cr"
   → Claim #4: "Affected entities: all companies with turnover below ₹10cr"
   → Claim #5: "Notification number: GSR 123(E)"

5. CanonicalizeEvent creates Event #E
   → "MCA amends annual return threshold for small companies — 2026-03-27"
   → severity: medium, confidence: 0.95 (two Tier 1 sources)
   → source_count: 2
   → linked to lex_pulse.regulatory_events

6. ResolveEntity confirms Entity #501 = "Ministry of Corporate Affairs"
   → Deterministic match (ministry entity already exists)
   → EventEntityLink created: Event #E actor Entity #501

7. GenerateStoryCapsule creates Capsule #C
   → headline: "MCA raises annual return threshold 5x for small companies"
   → explanation: "Effective April 1, 2026, companies with turnover below ₹10 crore no longer need to file the detailed MGT-7 form..."
   → evidence_bundle: [{document_id: B, relevance: 0.95, excerpt: "Section 92..."}]

8. projections.regulatory_digest updated (< 5s staleness)
   → Pre-assembled JSONB digest row for LexPulse feed

9. EvaluateWatchlistRules fires for watchlists watching MCA / corporate regulatory events
   → WatchlistAlert #W created: "MCA amendment to annual return filing — Medium"

10. LexPulse analyst asks: "What changed in annual return filing requirements?"
    → Semantic cache miss (first ask)
    → Hybrid retrieval returns Claims #3, #4, #5 from Document #B
    → Gemini generates cited answer using these claims
    → semantic_cache row created for future identical queries

11. Analyst traces back any LexPulse answer to:
    → Claim #3 → Document #B → Source "eGazette" (Tier 1) → fetched_at timestamp
    → lineage_hash verifiable
```

Every fact is traceable. Every AI output is evidenced. Every step is logged.

---

*NARAD V2 Whitepaper — Version 1.0 — March 2026*
*For further information, refer to the canonical ontology at `docs/architecture/canonical_ontology.md` and the Phase 1 completion report at `PHASE_1_COMPLETE.md`.*
