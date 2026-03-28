-- 010_grants.sql
-- Apply all GRANT statements LAST — all tables must exist before grants are applied.
-- Role structure:
--   narad_app_reader     → narad_app     (Next.js API routes — read-only)
--   narad_ingest_writer  → narad_worker  (Python Celery — writes to core + workflow)
--   narad_projection_writer → narad_worker (Projection workers — read core, write projections)

-- ── narad_app_reader ─────────────────────────────────────────────────────────
GRANT USAGE ON SCHEMA core, projections, geo_intelligence, corp_watch, lex_pulse
  TO narad_app_reader;

GRANT SELECT ON ALL TABLES IN SCHEMA core        TO narad_app_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA projections TO narad_app_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA geo_intelligence TO narad_app_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA corp_watch  TO narad_app_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA lex_pulse   TO narad_app_reader;

-- ── narad_ingest_writer ───────────────────────────────────────────────────────
GRANT USAGE ON SCHEMA core, audit, workflow, corp_watch, lex_pulse, geo_intelligence
  TO narad_ingest_writer;

-- core: SELECT + INSERT + UPDATE (no DELETE — dark archive protocol)
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA core TO narad_ingest_writer;

-- audit: INSERT only (tables are INSERT-only by policy)
GRANT INSERT ON ALL TABLES IN SCHEMA audit TO narad_ingest_writer;

-- workflow: full DML for EvaluateWatchlistRules and TransitionState commands
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA workflow TO narad_ingest_writer;

-- domain schemas: write access for enrichment workers
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA corp_watch     TO narad_ingest_writer;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA lex_pulse      TO narad_ingest_writer;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA geo_intelligence TO narad_ingest_writer;

-- ── narad_projection_writer ───────────────────────────────────────────────────
GRANT USAGE ON SCHEMA projections, core, workflow, corp_watch, lex_pulse, geo_intelligence
  TO narad_projection_writer;

-- projections: full DML (idempotent upserts)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA projections
  TO narad_projection_writer;

-- read access to source schemas for projection computation
GRANT SELECT ON ALL TABLES IN SCHEMA core             TO narad_projection_writer;
GRANT SELECT ON ALL TABLES IN SCHEMA workflow         TO narad_projection_writer;
GRANT SELECT ON ALL TABLES IN SCHEMA corp_watch       TO narad_projection_writer;
GRANT SELECT ON ALL TABLES IN SCHEMA lex_pulse        TO narad_projection_writer;
GRANT SELECT ON ALL TABLES IN SCHEMA geo_intelligence TO narad_projection_writer;
