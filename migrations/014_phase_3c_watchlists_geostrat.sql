-- 014_phase_3c_watchlists_geostrat.sql
-- Phase 3C: GeoStrat spatial projection, watchlist folder/category/episode support,
-- and grants for the monitoring layer.

-- ── 1. GeoStrat spatial projection table ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS projections.geostrat_events (
    event_id      UUID        PRIMARY KEY REFERENCES core.events(id) ON DELETE CASCADE,
    tenant_id     UUID        NOT NULL,
    title         TEXT        NOT NULL,
    event_type    TEXT        NOT NULL,
    severity      TEXT        NOT NULL,
    confidence    NUMERIC(3,2) NOT NULL,
    source_count  INTEGER     NOT NULL DEFAULT 1,
    occurred_at   TIMESTAMPTZ NOT NULL,
    geometry      GEOMETRY(Point, 4326) NOT NULL,
    state_code    TEXT,
    district_code TEXT,
    cluster_label TEXT,
    projected_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_geostrat_events_tenant_severity
    ON projections.geostrat_events (tenant_id, severity);

CREATE INDEX IF NOT EXISTS idx_geostrat_events_geometry
    ON projections.geostrat_events USING gist (geometry);

CREATE INDEX IF NOT EXISTS idx_geostrat_events_tenant_occurred
    ON projections.geostrat_events (tenant_id, occurred_at DESC);

-- ── 2. Watchlist folder / category / priority support ─────────────────────────
ALTER TABLE workflow.watchlists ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE workflow.watchlists ADD COLUMN IF NOT EXISTS is_priority BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE workflow.watchlists ADD COLUMN IF NOT EXISTS folder_path TEXT DEFAULT '/';

CREATE INDEX IF NOT EXISTS idx_watchlists_category
    ON workflow.watchlists (tenant_id, category);

CREATE INDEX IF NOT EXISTS idx_watchlists_priority
    ON workflow.watchlists (tenant_id, is_priority) WHERE is_priority = TRUE;

-- ── 3. Alert episode support ──────────────────────────────────────────────────
ALTER TABLE workflow.watchlist_alerts ADD COLUMN IF NOT EXISTS episode_id UUID;

CREATE INDEX IF NOT EXISTS idx_watchlist_alerts_episode
    ON workflow.watchlist_alerts (episode_id) WHERE episode_id IS NOT NULL;

-- ── 4. Grants ─────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON projections.geostrat_events TO narad_projection_writer;
GRANT SELECT, INSERT, UPDATE, DELETE ON projections.geostrat_events TO narad_ingest_writer;
GRANT SELECT ON projections.geostrat_events TO narad_app_reader;
