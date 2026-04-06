-- 019_phase5_foundation.sql
-- Phase 5: Decision Intelligence + Ecosystem Layer foundation.
-- Track 5A: decision_recommendations
-- Track 5C: api_keys, api_usage_log
-- Track 5D: user preferences column

-- ── 1. Decision Recommendations (Track 5A) ──────────────────────────────

CREATE TABLE IF NOT EXISTS workflow.decision_recommendations (
  id                  UUID         NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
  tenant_id           UUID         NOT NULL REFERENCES core.tenants(id) ON DELETE RESTRICT,
  recommendation_type TEXT         NOT NULL CHECK (recommendation_type IN ('action','risk_mitigation','escalation','investigation_lead','policy','monitoring')),
  title               TEXT         NOT NULL,
  summary             TEXT         NOT NULL,
  impact_summary      TEXT,
  reasoning           TEXT,
  evidence_refs       JSONB        NOT NULL DEFAULT '[]',
  confidence          NUMERIC(3,2) NOT NULL DEFAULT 0.50
    CHECK (confidence >= 0 AND confidence <= 1),
  ai_model            TEXT         NOT NULL DEFAULT 'deterministic-fallback',
  status              TEXT         NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','rejected','expired')),

  -- Polymorphic linkage: at least one must be set
  event_id            UUID         REFERENCES core.events(id) ON DELETE SET NULL,
  entity_id           UUID         REFERENCES core.entities(id) ON DELETE SET NULL,
  investigation_id    UUID         REFERENCES workflow.investigations(id) ON DELETE SET NULL,

  generated_for       TEXT         NOT NULL DEFAULT 'event'
    CHECK (generated_for IN ('event','entity','investigation','district','general')),
  context_snapshot    JSONB        NOT NULL DEFAULT '{}',

  reviewed_by         UUID         REFERENCES core.users(id) ON DELETE SET NULL,
  reviewed_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_decision_recs_tenant_event
  ON workflow.decision_recommendations (tenant_id, event_id, created_at DESC)
  WHERE event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_decision_recs_tenant_entity
  ON workflow.decision_recommendations (tenant_id, entity_id, created_at DESC)
  WHERE entity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_decision_recs_tenant_investigation
  ON workflow.decision_recommendations (tenant_id, investigation_id, created_at DESC)
  WHERE investigation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_decision_recs_tenant_status
  ON workflow.decision_recommendations (tenant_id, status, created_at DESC);

CREATE TRIGGER set_decision_recommendations_updated_at
  BEFORE UPDATE ON workflow.decision_recommendations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE workflow.decision_recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON workflow.decision_recommendations
  FOR ALL USING (tenant_id = (SELECT current_setting('app.current_tenant_id', TRUE)::uuid));

-- ── 2. API Keys (Track 5C) ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS core.api_keys (
  id             UUID        NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
  tenant_id      UUID        NOT NULL REFERENCES core.tenants(id) ON DELETE RESTRICT,
  user_id        UUID        NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
  key_hash       TEXT        NOT NULL,
  key_prefix     TEXT        NOT NULL,
  name           TEXT        NOT NULL,
  scopes         TEXT[]      NOT NULL DEFAULT '{read}',
  rate_limit_rpm INTEGER     NOT NULL DEFAULT 60,
  is_active      BOOLEAN     NOT NULL DEFAULT TRUE,
  last_used_at   TIMESTAMPTZ,
  expires_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_hash ON core.api_keys (key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON core.api_keys (key_prefix);
CREATE INDEX IF NOT EXISTS idx_api_keys_tenant_user ON core.api_keys (tenant_id, user_id);

CREATE TRIGGER set_api_keys_updated_at
  BEFORE UPDATE ON core.api_keys
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE core.api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON core.api_keys
  FOR ALL USING (tenant_id = (SELECT current_setting('app.current_tenant_id', TRUE)::uuid));

-- ── 3. API Usage Log (Track 5C) ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS core.api_usage_log (
  id           UUID        NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
  api_key_id   UUID        NOT NULL REFERENCES core.api_keys(id) ON DELETE CASCADE,
  tenant_id    UUID        NOT NULL REFERENCES core.tenants(id) ON DELETE RESTRICT,
  endpoint     TEXT        NOT NULL,
  method       TEXT        NOT NULL DEFAULT 'GET',
  status_code  INTEGER     NOT NULL DEFAULT 200,
  response_ms  INTEGER,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_usage_log_key_time
  ON core.api_usage_log (api_key_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_api_usage_log_tenant_time
  ON core.api_usage_log (tenant_id, created_at DESC);

-- ── 4. User Preferences (Track 5D) ──────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'core'
      AND table_name = 'users'
      AND column_name = 'preferences'
  ) THEN
    ALTER TABLE core.users ADD COLUMN preferences JSONB NOT NULL DEFAULT '{}';
  END IF;
END $$;

-- ── 5. Grants ────────────────────────────────────────────────────────────

GRANT SELECT ON workflow.decision_recommendations TO narad_app_reader;
GRANT SELECT, INSERT, UPDATE ON workflow.decision_recommendations TO narad_ingest_writer;
GRANT SELECT, INSERT, UPDATE ON workflow.decision_recommendations TO narad_app_reader;

GRANT SELECT ON core.api_keys TO narad_app_reader;
GRANT SELECT, INSERT, UPDATE ON core.api_keys TO narad_ingest_writer;
GRANT SELECT, INSERT, UPDATE ON core.api_keys TO narad_app_reader;

GRANT SELECT, INSERT ON core.api_usage_log TO narad_app_reader;
GRANT SELECT, INSERT ON core.api_usage_log TO narad_ingest_writer;
