-- 016_phase4_investigations_briefings.sql
-- Phase 4A/4B: Investigations and Briefings workspace deepening.
-- Investigation archive, evidence custody enhancements, briefings distribution log.

-- ── 1. Add archive support to investigations ──────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'archived'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'investigation_status')
  ) THEN
    ALTER TYPE workflow.investigation_status ADD VALUE IF NOT EXISTS 'archived';
  END IF;
EXCEPTION WHEN undefined_object THEN
  -- Status is stored as text; no enum to alter
  NULL;
END $$;

-- ── 2. AI suggestions log (Track 4D) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS workflow.ai_suggestions (
  id                  UUID        NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
  tenant_id           UUID        NOT NULL REFERENCES core.tenants(id) ON DELETE CASCADE,
  entity_type         TEXT        NOT NULL CHECK (entity_type IN ('investigation', 'briefing')),
  entity_id           UUID        NOT NULL,
  suggestion_type     TEXT        NOT NULL CHECK (suggestion_type IN ('entity', 'event', 'draft_section', 'hypothesis')),
  payload             JSONB       NOT NULL DEFAULT '{}',
  ai_model            TEXT        NOT NULL DEFAULT 'unknown',
  confidence          NUMERIC(4,3) NOT NULL DEFAULT 0.5
    CHECK (confidence >= 0 AND confidence <= 1),
  verified_by         UUID        REFERENCES core.users(id),
  verified_at         TIMESTAMPTZ,
  verification_status TEXT        NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending', 'accepted', 'rejected')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_suggestions_entity
  ON workflow.ai_suggestions (tenant_id, entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_suggestions_pending
  ON workflow.ai_suggestions (tenant_id, verification_status)
  WHERE verification_status = 'pending';

-- ── 3. Briefings distribution log (Track 4B) ─────────────────────────────
CREATE TABLE IF NOT EXISTS workflow.briefing_distributions (
  id                  UUID        NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
  briefing_id         UUID        NOT NULL REFERENCES workflow.briefings(id) ON DELETE CASCADE,
  tenant_id           UUID        NOT NULL REFERENCES core.tenants(id) ON DELETE CASCADE,
  channel             TEXT        NOT NULL DEFAULT 'manual',
  recipient_label     TEXT        NOT NULL,
  scheduled_at        TIMESTAMPTZ,
  sent_at             TIMESTAMPTZ,
  status              TEXT        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  created_by          UUID        NOT NULL REFERENCES core.users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_briefing_distributions_briefing
  ON workflow.briefing_distributions (briefing_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_briefing_distributions_tenant_scheduled
  ON workflow.briefing_distributions (tenant_id, scheduled_at)
  WHERE status = 'pending';

-- ── 4. Evidence integrity index ───────────────────────────────────────────
-- Performance index on evidence hash lookups (4A integrity rail)
CREATE INDEX IF NOT EXISTS idx_investigation_evidence_hash
  ON workflow.investigation_evidence (evidence_hash);

-- ── 5. Grants ─────────────────────────────────────────────────────────────
GRANT SELECT ON workflow.ai_suggestions TO narad_app_reader;
GRANT SELECT, INSERT, UPDATE ON workflow.ai_suggestions TO narad_ingest_writer;
GRANT SELECT, INSERT, UPDATE ON workflow.ai_suggestions TO narad_app_reader;

GRANT SELECT ON workflow.briefing_distributions TO narad_app_reader;
GRANT SELECT, INSERT, UPDATE ON workflow.briefing_distributions TO narad_ingest_writer;
GRANT SELECT, INSERT, UPDATE ON workflow.briefing_distributions TO narad_app_reader;
