-- 013_phase_3b_workspaces.sql
-- Phase 3B workspace deepening:
-- CorpWatch narratives, LexPulse RAG cache, sector forecasts, and analyst feedback.

-- ── 1. CorpWatch entity narratives ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS corp_watch.entity_narratives (
  entity_id      UUID        NOT NULL PRIMARY KEY REFERENCES core.entities(id) ON DELETE CASCADE,
  tenant_id      UUID        NOT NULL REFERENCES core.tenants(id) ON DELETE CASCADE,
  narrative      TEXT        NOT NULL,
  confidence     NUMERIC(4,3) NOT NULL DEFAULT 0.650
    CHECK (confidence >= 0 AND confidence <= 1),
  generated_by   TEXT        NOT NULL,
  expires_at     TIMESTAMPTZ NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_entity_narratives_tenant
  ON corp_watch.entity_narratives (tenant_id, expires_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'set_entity_narratives_updated_at'
  ) THEN
    EXECUTE $trigger$
      CREATE TRIGGER set_entity_narratives_updated_at
        BEFORE UPDATE ON corp_watch.entity_narratives
        FOR EACH ROW EXECUTE FUNCTION set_updated_at()
    $trigger$;
  END IF;
END $$;

-- ── 2. LexPulse semantic query cache ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lex_pulse.query_cache (
  id            UUID        NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
  tenant_id     UUID        NOT NULL REFERENCES core.tenants(id) ON DELETE CASCADE,
  query_text    TEXT        NOT NULL,
  embedding     vector(768) NOT NULL,
  answer        JSONB       NOT NULL,
  citations     JSONB       NOT NULL DEFAULT '[]',
  confidence    NUMERIC(4,3) NOT NULL DEFAULT 0.650
    CHECK (confidence >= 0 AND confidence <= 1),
  hit_count     INTEGER     NOT NULL DEFAULT 0,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_query_cache_embedding
  ON lex_pulse.query_cache USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_query_cache_tenant_expiry
  ON lex_pulse.query_cache (tenant_id, expires_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'set_query_cache_updated_at'
  ) THEN
    EXECUTE $trigger$
      CREATE TRIGGER set_query_cache_updated_at
        BEFORE UPDATE ON lex_pulse.query_cache
        FOR EACH ROW EXECUTE FUNCTION set_updated_at()
    $trigger$;
  END IF;
END $$;

-- ── 3. LexPulse sector forecasts ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lex_pulse.sector_forecasts (
  id                  UUID         NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
  tenant_id           UUID         NOT NULL REFERENCES core.tenants(id) ON DELETE CASCADE,
  sector_name         TEXT         NOT NULL,
  friction_change_pct NUMERIC(8,2) NOT NULL DEFAULT 0,
  period_label        TEXT         NOT NULL,
  narrative           TEXT         NOT NULL,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, sector_name, period_label)
);

CREATE INDEX IF NOT EXISTS idx_sector_forecasts_tenant
  ON lex_pulse.sector_forecasts (tenant_id, period_label, friction_change_pct DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'set_sector_forecasts_updated_at'
  ) THEN
    EXECUTE $trigger$
      CREATE TRIGGER set_sector_forecasts_updated_at
        BEFORE UPDATE ON lex_pulse.sector_forecasts
        FOR EACH ROW EXECUTE FUNCTION set_updated_at()
    $trigger$;
  END IF;
END $$;

-- ── 4. LexPulse analyst feedback ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lex_pulse.answer_feedback (
  id             UUID        NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
  query_cache_id UUID        NOT NULL REFERENCES lex_pulse.query_cache(id) ON DELETE CASCADE,
  tenant_id      UUID        NOT NULL REFERENCES core.tenants(id) ON DELETE CASCADE,
  user_id        TEXT        NOT NULL,
  rating         TEXT        NOT NULL CHECK (rating IN ('up', 'down')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (query_cache_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_answer_feedback_tenant
  ON lex_pulse.answer_feedback (tenant_id, created_at DESC);

-- ── 5. Grants ───────────────────────────────────────────────────────────────
GRANT SELECT ON corp_watch.entity_narratives TO narad_app_reader;
GRANT SELECT ON lex_pulse.query_cache TO narad_app_reader;
GRANT SELECT ON lex_pulse.sector_forecasts TO narad_app_reader;
GRANT SELECT ON lex_pulse.answer_feedback TO narad_app_reader;

GRANT SELECT, INSERT, UPDATE ON corp_watch.entity_narratives TO narad_ingest_writer;
GRANT SELECT, INSERT, UPDATE ON lex_pulse.query_cache TO narad_ingest_writer;
GRANT SELECT, INSERT, UPDATE ON lex_pulse.sector_forecasts TO narad_ingest_writer;
GRANT SELECT, INSERT ON lex_pulse.answer_feedback TO narad_ingest_writer;

GRANT SELECT ON corp_watch.entity_narratives TO narad_projection_writer;
GRANT SELECT, INSERT, UPDATE ON lex_pulse.sector_forecasts TO narad_projection_writer;
