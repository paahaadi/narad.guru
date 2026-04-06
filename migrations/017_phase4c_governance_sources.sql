-- 017_phase4c_governance_sources.sql
-- Phase 4C: Tier 3 source expansion + SOCMINT governance.
-- Source classification extension, governance review queue, volatility flags,
-- SOCMINT publication eligibility controls, and retention policy metadata.

-- ── 1. Extend core.sources with governance/tier-3 fields ─────────────────

ALTER TABLE core.sources
  ADD COLUMN IF NOT EXISTS source_class          TEXT NOT NULL DEFAULT 'enrichment'
    CHECK (source_class IN ('source-of-record', 'enrichment', 'weak-signal')),
  ADD COLUMN IF NOT EXISTS sensitivity_class     TEXT NOT NULL DEFAULT 'standard'
    CHECK (sensitivity_class IN ('standard', 'restricted', 'licensed', 'socmint')),
  ADD COLUMN IF NOT EXISTS publication_eligible  BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS volatility_flag       BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS takedown_flag         BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS minimization_applied  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS review_required       BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS data_retention_days   INTEGER,
  ADD COLUMN IF NOT EXISTS visibility_tier       TEXT NOT NULL DEFAULT 'internal'
    CHECK (visibility_tier IN ('internal', 'analyst', 'published'));

-- 1b. Update status constraint to include 'pending_approval'
ALTER TABLE core.sources DROP CONSTRAINT IF EXISTS sources_status_check;
ALTER TABLE core.sources ADD CONSTRAINT sources_status_check
  CHECK (status IN ('active', 'degraded', 'disabled', 'pending_approval'));

-- 1c. Update source_type constraint to include 'scrape'
ALTER TABLE core.sources DROP CONSTRAINT IF EXISTS core_sources_source_type_check;
ALTER TABLE core.sources DROP CONSTRAINT IF EXISTS sources_source_type_check;
ALTER TABLE core.sources ADD CONSTRAINT sources_source_type_check
  CHECK (source_type IN ('rss','api','portal','wms','sftp','manual','satellite', 'scrape'));

-- Update tier-3 marker: Tier 3 sources always require review
-- (tier-2 sources already seeded in 015; tier-3 will be seed-inserted below)
CREATE INDEX IF NOT EXISTS idx_sources_governance
  ON core.sources (tenant_id, trust_tier, sensitivity_class, review_required);

-- ── 2. Governance review queue ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS core.source_review_queue (
  id                  UUID        NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
  tenant_id           UUID        NOT NULL REFERENCES core.tenants(id) ON DELETE CASCADE,
  source_id           UUID        NOT NULL REFERENCES core.sources(id) ON DELETE CASCADE,
  document_id         UUID        REFERENCES core.documents(id) ON DELETE SET NULL,
  review_type         TEXT        NOT NULL DEFAULT 'pre-publication'
    CHECK (review_type IN ('pre-publication', 'retention-check', 'takedown', 'socmint-gate')),
  status              TEXT        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'escalated')),
  risk_notes          TEXT,
  reviewed_by         UUID        REFERENCES core.users(id),
  reviewed_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_review_queue_pending
  ON core.source_review_queue (tenant_id, status, review_type, created_at DESC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_review_queue_source
  ON core.source_review_queue (source_id, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_source_review_queue_updated_at'
  ) THEN
    EXECUTE $trigger$
      CREATE TRIGGER set_source_review_queue_updated_at
        BEFORE UPDATE ON core.source_review_queue
        FOR EACH ROW EXECUTE FUNCTION set_updated_at()
    $trigger$;
  END IF;
END $$;

-- ── 3. SOCMINT signal classification table ───────────────────────────────
-- Raw-to-canonical transformation for SOCMINT signals.
-- Signal types: signal | claim | event | narrative
CREATE TABLE IF NOT EXISTS core.socmint_signals (
  id                  UUID        NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
  tenant_id           UUID        NOT NULL REFERENCES core.tenants(id) ON DELETE CASCADE,
  source_id           UUID        NOT NULL REFERENCES core.sources(id),
  raw_content         TEXT        NOT NULL,
  signal_type         TEXT        NOT NULL DEFAULT 'signal'
    CHECK (signal_type IN ('signal', 'claim', 'event', 'narrative')),
  platform            TEXT        NOT NULL DEFAULT 'unknown',
  -- Governance: canonical entity after minimization
  canonical_label     TEXT,
  canonical_entity_id UUID        REFERENCES core.entities(id),
  -- Governance flags
  is_minimized        BOOLEAN     NOT NULL DEFAULT FALSE,
  is_review_required  BOOLEAN     NOT NULL DEFAULT TRUE,
  is_publication_ready BOOLEAN    NOT NULL DEFAULT FALSE,
  -- Retention
  retain_until        TIMESTAMPTZ,
  -- Surfacing visibility: never expose raw SOCMINT content beyond internal
  visibility_tier     TEXT        NOT NULL DEFAULT 'internal'
    CHECK (visibility_tier IN ('internal', 'analyst')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_socmint_signals_tenant
  ON core.socmint_signals (tenant_id, signal_type, is_review_required, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_socmint_signals_review
  ON core.socmint_signals (tenant_id, is_review_required, is_publication_ready)
  WHERE is_review_required = TRUE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_socmint_signals_updated_at'
  ) THEN
    EXECUTE $trigger$
      CREATE TRIGGER set_socmint_signals_updated_at
        BEFORE UPDATE ON core.socmint_signals
        FOR EACH ROW EXECUTE FUNCTION set_updated_at()
    $trigger$;
  END IF;
END $$;

-- ── 4. Seed Tier-3 governed source stubs ─────────────────────────────────
-- These are placeholder entries; actual connectors require licensed credentials.
WITH default_tenant AS (
  SELECT id FROM core.tenants ORDER BY created_at ASC LIMIT 1
),
tier3_rows AS (
  SELECT * FROM (VALUES
    ('Commercial AIS (Placeholder)', 'ais-commercial', 'api', 3, 'commercial',
     86400, NULL, '{"note":"Licensed feed; requires contract credential"}',
     FALSE, FALSE, 'pending_approval', 'source-of-record', 'licensed', TRUE, 365, 'analyst'),
    ('SOCMINT Public Signals', 'socmint-public', 'scrape', 3, 'open_data',
     3600, NULL, '{"note":"Public collection only; strict minimization required"}',
     FALSE, FALSE, 'pending_approval', 'weak-signal', 'socmint', FALSE, 90, 'internal')
  ) AS items(
    name, slug, source_type, trust_tier, authority_level,
    cadence, base_url, config,
    governance_approved, is_active, status,
    source_class, sensitivity_class, review_required, data_retention_days, visibility_tier
  )
)
INSERT INTO core.sources (
  tenant_id, name, slug, source_type, trust_tier, authority_level,
  update_cadence_seconds, base_url, config,
  governance_approved, is_active, status,
  source_class, sensitivity_class, review_required,
  data_retention_days, visibility_tier
)
SELECT
  dt.id, t.name, t.slug, t.source_type, t.trust_tier, t.authority_level,
  t.cadence, t.base_url, t.config::jsonb,
  t.governance_approved, t.is_active, t.status,
  t.source_class, t.sensitivity_class, t.review_required,
  t.data_retention_days, t.visibility_tier
FROM default_tenant AS dt CROSS JOIN tier3_rows AS t
ON CONFLICT (tenant_id, slug) DO UPDATE SET
  name           = EXCLUDED.name,
  trust_tier     = EXCLUDED.trust_tier,
  source_class   = EXCLUDED.source_class,
  sensitivity_class = EXCLUDED.sensitivity_class,
  review_required   = EXCLUDED.review_required,
  data_retention_days = EXCLUDED.data_retention_days,
  visibility_tier   = EXCLUDED.visibility_tier;

-- ── 5. Grants ──────────────────────────────────────────────────────────
GRANT SELECT ON core.source_review_queue TO narad_app_reader;
GRANT SELECT, INSERT, UPDATE ON core.source_review_queue TO narad_ingest_writer;
GRANT SELECT, INSERT, UPDATE ON core.source_review_queue TO narad_app_reader;

GRANT SELECT ON core.socmint_signals TO narad_app_reader;
GRANT SELECT, INSERT, UPDATE ON core.socmint_signals TO narad_ingest_writer;
GRANT SELECT ON core.socmint_signals TO narad_projection_writer;
