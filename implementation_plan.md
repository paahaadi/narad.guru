# NARAD V2: Unified Intelligence Platform (Implementation Architecture)

Building on the expert panel's review of the 32 Data Sources, the PRD, and the targeted UI experience, this plan details the zero-redundancy, ultra-low-latency technical approach required to succeed.

## Proposed Architecture Updates

### 1. Decoupled Ingestion Pipeline (Python / FastAPI / Celery)
This completely decoupled worker pulls the 32 sources asynchronously, translating and embedding data via Bhashini and Gemini *before* the user ever requests it. Exposing the Next.js API to the sheer weight of 32 scrapers + AI translation would kill the app's latency. By separating them, the Next.js app acts exclusively as a high-speed caching API for the UI.

### 2. Core Database Schema (PostgreSQL + PostGIS/pgvector + TimescaleDB)
A unified Entity Graph to achieve **Zero-Redundancy**. Every source points to universal `Entities`, not isolated tables.
Additionally, to prevent database bloat, TimescaleDB drops live telemetry data (e.g., OpenSky, FIRMS) older than 7 days, replacing it with hourly/daily aggregates. Full historical data archiving requires extremely heavy S3 storage costs.

### 3. Frontend Repository (Next.js 15 + MapLibre GL JS)
A high-performance shell optimized with Framer Motion, Zustand state management, and strict WebGL bindings to guarantee 60fps rendering. WebGL is the only way to plot 5,000 OpenSky planes + NASA FIRMS globally without crashing the browser.

## Verification Plan

### Automated Testing
* **Load Test Ingestion:** Simulate 32 sources returning data simultaneously, verifying the Python workers queue them in Celery without crashing.
* **Database Deadlock Test:** Validate that the Next.js frontend can run a `SELECT` on the unified Entity table whilst Python is running heavy `INSERT` batches.

### Manual Verification
* **Map SDK Render Test:** Inject 5,000 dummy aircraft coordinates over India in the local Postgres, load the MapLibre Deck.gl component, and verify browser performance maintains > 55fps.
* **Latency Perception Test:** Click between the `GeoStrat` and `LexPulse` tabs to verify that Next.js Layouts paired with client caching (React Query) yield instant (<50ms) visual transitions.
