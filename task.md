# NARAD V2 Task Breakdown

## 1. Environment & Architecture Scaffolding
- [ ] Initialize Python (FastAPI/Celery) Backend structure for Data Ingestion
- [ ] Initialize Next.js 15 App (Frontend & API Layer)
- [ ] Configure `docker-compose.yml` (PostgreSQL 16, Redis, TimescaleDB, pgvector, PostGIS)

## 2. Database & State Layer Setup
- [ ] Establish unified ontological schema migrating all 32 sources to common Entities
- [ ] Setup `pgvector` indexing and spatial indexes
- [ ] Setup Redis for real-time pub/sub pipeline

## 3. Frontend Deep Dive (UX / Graphics / State)
- [ ] Scaffold Zustand slices (Map Layer State, PulseBoard Context)
- [ ] Implement MapLibre GL JS + Deck.gl integration optimized for 60fps 3D layers
- [ ] Setup Framer Motion layouts and Skeleton loaders for zero-latency perception

## 4. Ingestion Pipelines (Data Engineering)
- [ ] Create base robust Scraper/API client class with auto-retry and IP rotation logic
- [ ] Integrate Bhashini API for asynchronous language translation
- [ ] Link LLM (OpenAI/Gemini) processing for entity extraction at ingestion time

## 5. Endpoints & Real-time Connectivity
- [ ] Develop Next.js Server Components connecting directly to DB/Cache Layer
- [ ] Implement WebSocket microservice (Node.js/Python) bridging Redis Pub/Sub to UI

## 6. Testing & CI/CD
- [ ] Write integration tests for heavy load scraping limits
- [ ] Perform rendering performance audit (simulating 10,000 points on map)
