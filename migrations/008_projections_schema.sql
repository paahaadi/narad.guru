-- 008_projections_schema.sql
-- CQRS read-model projection tables: 4 tables.
-- No RLS — tenant isolation enforced by JSONB content and application-layer filtering.
-- All rows are idempotent upserts; stale projections are always overwritable.

-- ── 1. projections.pulseboard_feed ────────────────────────────────────────────
CREATE TABLE projections.pulseboard_feed (
  event_id      UUID        NOT NULL REFERENCES core.events(id) ON DELETE CASCADE PRIMARY KEY,
  tenant_id     UUID        NOT NULL,
  card          JSONB       NOT NULL,
  severity_rank SMALLINT    NOT NULL,
  occurred_at   TIMESTAMPTZ NOT NULL,
  projected_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Primary sort for PulseBoard feed: most severe + most recent first
CREATE INDEX ON projections.pulseboard_feed (tenant_id, severity_rank, occurred_at DESC);
CREATE INDEX ON projections.pulseboard_feed (tenant_id);

-- ── 2. projections.watchlist_deltas ──────────────────────────────────────────
CREATE TABLE projections.watchlist_deltas (
  id             UUID        NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
  tenant_id      UUID        NOT NULL,
  watchlist_id   UUID        NOT NULL REFERENCES workflow.watchlists(id) ON DELETE CASCADE,
  delta_type     TEXT        NOT NULL,
  summary        TEXT        NOT NULL,
  reference_id   UUID        NOT NULL,
  reference_type TEXT        NOT NULL,
  computed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON projections.watchlist_deltas (tenant_id, watchlist_id, computed_at DESC);
CREATE INDEX ON projections.watchlist_deltas (tenant_id);
CREATE INDEX ON projections.watchlist_deltas (watchlist_id);

-- ── 3. projections.entity_summaries ──────────────────────────────────────────
CREATE TABLE projections.entity_summaries (
  entity_id    UUID        NOT NULL REFERENCES core.entities(id) ON DELETE CASCADE PRIMARY KEY,
  tenant_id    UUID        NOT NULL,
  summary      JSONB       NOT NULL,
  projected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON projections.entity_summaries (tenant_id);

-- ── 4. projections.regulatory_digest ─────────────────────────────────────────
-- No FK on event_id: regulatory events may reference archived core events.
CREATE TABLE projections.regulatory_digest (
  event_id       UUID        NOT NULL PRIMARY KEY,
  tenant_id      UUID        NOT NULL,
  digest         JSONB       NOT NULL,
  effective_date DATE,
  projected_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON projections.regulatory_digest (tenant_id, effective_date DESC);
CREATE INDEX ON projections.regulatory_digest (tenant_id);
