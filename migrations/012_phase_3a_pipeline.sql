-- 012_phase_3a_pipeline.sql
-- Phase 3A live intelligence loop foundation:
-- source health tracking, entity-resolution metadata, dead-letter queue,
-- and Tier 1 source bootstrap.

-- ── 1. Source health tracking ───────────────────────────────────────────────
ALTER TABLE core.sources
  ADD COLUMN IF NOT EXISTS last_polled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_success_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consecutive_failures INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'degraded', 'disabled')),
  ADD COLUMN IF NOT EXISTS documents_fetched_total INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS events_produced_total INTEGER NOT NULL DEFAULT 0;

UPDATE core.sources
SET
  last_success_at = COALESCE(last_success_at, last_successful_fetch),
  status = CASE
    WHEN status IS NOT NULL THEN status
    WHEN is_active THEN 'active'
    ELSE 'disabled'
  END;

CREATE INDEX IF NOT EXISTS idx_sources_status
  ON core.sources (tenant_id, status, is_active);

-- ── 2. Entity-resolution metadata ───────────────────────────────────────────
ALTER TABLE core.entities
  ADD COLUMN IF NOT EXISTS last_resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolution_confidence NUMERIC(3,2)
    CHECK (resolution_confidence IS NULL OR resolution_confidence BETWEEN 0.00 AND 1.00);

CREATE INDEX IF NOT EXISTS idx_events_dedup_candidates
  ON core.events (tenant_id, event_type, occurred_at DESC)
  WHERE status != 'invalidated';

CREATE INDEX IF NOT EXISTS idx_entities_name_trgm
  ON core.entities
  USING GIN (canonical_name gin_trgm_ops);

CREATE UNIQUE INDEX IF NOT EXISTS idx_claims_tenant_lineage_hash
  ON core.claims (tenant_id, lineage_hash);

-- ── 3. Dead-letter queue ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS core.dead_letter_queue (
  id              UUID        NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
  tenant_id       UUID        NOT NULL REFERENCES core.tenants(id) ON DELETE RESTRICT,
  queue_name      TEXT        NOT NULL,
  task_name       TEXT        NOT NULL,
  payload         JSONB       NOT NULL DEFAULT '{}',
  error_message   TEXT        NOT NULL,
  retry_count     INTEGER     NOT NULL DEFAULT 0,
  status          TEXT        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'retried', 'resolved')),
  source_slug     TEXT,
  document_id     UUID        REFERENCES core.documents(id) ON DELETE SET NULL,
  event_id        UUID        REFERENCES core.events(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_retried_at TIMESTAMPTZ,
  resolved_at     TIMESTAMPTZ,
  resolution_note TEXT
);

CREATE INDEX IF NOT EXISTS idx_dead_letter_queue_status
  ON core.dead_letter_queue (tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dead_letter_queue_queue
  ON core.dead_letter_queue (tenant_id, queue_name, created_at DESC);

ALTER TABLE core.dead_letter_queue ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'core'
      AND tablename = 'dead_letter_queue'
      AND policyname = 'tenant_isolation'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY tenant_isolation ON core.dead_letter_queue
      FOR ALL USING (tenant_id = (SELECT current_setting('app.current_tenant_id', TRUE)::uuid))
    $policy$;
  END IF;
END $$;

-- ── 4. Seed / refresh Tier 1 sources ────────────────────────────────────────
WITH default_tenant AS (
  SELECT id
  FROM core.tenants
  ORDER BY created_at ASC
  LIMIT 1
),
seed_rows AS (
  SELECT *
  FROM (
    VALUES
      ('PIB RSS', 'pib_rss', 'rss', 1, 'official', 300, 'https://pib.gov.in', '{"rss_url":"https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=3"}'::jsonb),
      ('SEBI RSS', 'sebi_rss', 'rss', 1, 'official', 900, 'https://www.sebi.gov.in', '{"rss_url":"https://www.sebi.gov.in/sebirss.xml"}'::jsonb),
      ('BSE Corporate Announcements', 'bse_rss', 'rss', 1, 'exchange', 600, 'https://www.bseindia.com', '{"rss_url":"https://www.bseindia.com/data/xml/announcements.xml"}'::jsonb),
      ('NSE Corporate Announcements', 'nse_rss', 'rss', 1, 'exchange', 600, 'https://www.nseindia.com', '{"rss_url":"https://nsearchives.nseindia.com/content/RSS/Online_announcements.xml"}'::jsonb),
      ('eGazette Portal', 'egazette', 'portal', 1, 'official', 1800, 'https://egazette.gov.in', '{"landing_url":"https://egazette.gov.in"}'::jsonb),
      ('IMD Alerts', 'imd', 'portal', 1, 'official', 600, 'https://mausam.imd.gov.in', '{"landing_url":"https://mausam.imd.gov.in"}'::jsonb),
      ('CWC Bulletins', 'cwc', 'portal', 1, 'official', 900, 'https://cwc.gov.in', '{"landing_url":"https://cwc.gov.in/en/fmo/dfsra"}'::jsonb),
      ('India Code Updates', 'india_code', 'portal', 1, 'official', 3600, 'https://www.indiacode.nic.in/', '{"landing_url":"https://www.indiacode.nic.in/"}'::jsonb)
  ) AS items(name, slug, source_type, trust_tier, authority_level, cadence, base_url, config)
)
INSERT INTO core.sources (
  tenant_id,
  name,
  slug,
  source_type,
  trust_tier,
  authority_level,
  update_cadence_seconds,
  base_url,
  config,
  governance_approved,
  is_active,
  status
)
SELECT
  default_tenant.id,
  seed_rows.name,
  seed_rows.slug,
  seed_rows.source_type,
  seed_rows.trust_tier,
  seed_rows.authority_level,
  seed_rows.cadence,
  seed_rows.base_url,
  seed_rows.config,
  TRUE,
  TRUE,
  'active'
FROM default_tenant
CROSS JOIN seed_rows
ON CONFLICT (tenant_id, slug)
DO UPDATE SET
  name = EXCLUDED.name,
  source_type = EXCLUDED.source_type,
  trust_tier = EXCLUDED.trust_tier,
  authority_level = EXCLUDED.authority_level,
  update_cadence_seconds = EXCLUDED.update_cadence_seconds,
  base_url = EXCLUDED.base_url,
  config = EXCLUDED.config,
  governance_approved = EXCLUDED.governance_approved,
  is_active = EXCLUDED.is_active,
  status = EXCLUDED.status;

-- ── 5. Grants required after new tables / workflow reads ───────────────────
GRANT SELECT, INSERT, UPDATE ON core.dead_letter_queue TO narad_ingest_writer;
GRANT USAGE ON SCHEMA workflow TO narad_app_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA workflow TO narad_app_reader;
