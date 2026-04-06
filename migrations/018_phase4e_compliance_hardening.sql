-- 018_phase4e_compliance_hardening.sql
-- Phase 4E: Scale & Compliance Hardening
-- DPDPA retention controls, compliance audit log partitioned tables,
-- read-replica-ready view separations, and performance indexes.

-- ── 1. DPDPA Retention Policy Registry ───────────────────────────────────
-- Defines retention policies per table/data-class. Driving force for
-- the scheduled cleanup job that runs daily.
CREATE TABLE IF NOT EXISTS core.retention_policies (
  id                  UUID        NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
  tenant_id           UUID        NOT NULL REFERENCES core.tenants(id) ON DELETE CASCADE,
  policy_name         TEXT        NOT NULL,
  table_schema        TEXT        NOT NULL,
  table_name          TEXT        NOT NULL,
  date_column         TEXT        NOT NULL DEFAULT 'created_at',
  retention_days      INTEGER     NOT NULL CHECK (retention_days > 0),
  data_class          TEXT        NOT NULL DEFAULT 'standard'
    CHECK (data_class IN ('standard', 'sensitive', 'socmint', 'licensed', 'audit')),
  -- Audit fields cannot be deleted shorter than 365 days
  minimum_days        INTEGER     NOT NULL DEFAULT 0 CHECK (minimum_days >= 0),
  dry_run_only        BOOLEAN     NOT NULL DEFAULT TRUE,  -- Safety: start as dry-run
  is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
  last_run_at         TIMESTAMPTZ,
  last_deleted_count  INTEGER,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, policy_name)
);

CREATE INDEX IF NOT EXISTS idx_retention_policies_tenant
  ON core.retention_policies (tenant_id, is_active, data_class);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_retention_policies_updated_at'
  ) THEN
    EXECUTE $update_trigger$
      CREATE TRIGGER set_retention_policies_updated_at
        BEFORE UPDATE ON core.retention_policies
        FOR EACH ROW EXECUTE FUNCTION set_updated_at()
    $update_trigger$;
  END IF;
END $$;

-- ── 2. DPDPA Erasure Request Log ─────────────────────────────────────────
-- Tracks data subject access requests and erasure jobs per DPDPA Chapter III.
CREATE TABLE IF NOT EXISTS core.dpdpa_requests (
  id                  UUID        NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
  tenant_id           UUID        NOT NULL REFERENCES core.tenants(id) ON DELETE CASCADE,
  request_type        TEXT        NOT NULL DEFAULT 'erasure'
    CHECK (request_type IN ('erasure', 'access', 'correction', 'portability')),
  status              TEXT        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed', 'rejected', 'deferred')),
  subject_identifier  TEXT        NOT NULL,  -- e.g., hashed user ID or entity label
  data_categories     TEXT[]      NOT NULL DEFAULT '{}',
  legal_basis_notes   TEXT,
  requested_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at        TIMESTAMPTZ,
  reviewed_by         UUID        REFERENCES core.users(id),
  rejected_reason     TEXT,
  records_affected    INTEGER,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dpdpa_requests_tenant_status
  ON core.dpdpa_requests (tenant_id, status, requested_at DESC)
  WHERE status IN ('pending', 'in_progress');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_dpdpa_requests_updated_at'
  ) THEN
    EXECUTE $dpdpa_trigger$
      CREATE TRIGGER set_dpdpa_requests_updated_at
        BEFORE UPDATE ON core.dpdpa_requests
        FOR EACH ROW EXECUTE FUNCTION set_updated_at()
    $dpdpa_trigger$;
  END IF;
END $$;

-- ── 3. Compliance Audit Log (read-only projection) ───────────────────────
-- Thin compliance view over core.audit_log for compliance officer queries.
-- Points at existing audit_log; partitioned by month already handled.
CREATE OR REPLACE VIEW core.compliance_audit_view AS
SELECT
  a.id,
  a.tenant_id,
  a.action,
  a.table_name,
  a.record_id,
  a.changed_by,
  a.changed_at,
  CASE
    WHEN a.table_name LIKE '%socmint%'    THEN 'socmint'
    WHEN a.table_name LIKE '%briefing%'   THEN 'briefing'
    WHEN a.table_name LIKE '%investigat%' THEN 'investigation'
    WHEN a.table_name LIKE '%evidence%'   THEN 'evidence'
    WHEN a.table_name LIKE '%dpdpa%'      THEN 'dpdpa'
    ELSE 'general'
  END AS compliance_category,
  jsonb_strip_nulls(
    jsonb_build_object(
      'record_id', a.record_id::text,
      'action',    a.action
    )
  ) AS audit_summary
FROM core.audit_log a;

-- ── 4. Performance Indexes for Phase 4 workspaces ────────────────────────

-- Investigations: multi-column for list+filter queries
CREATE INDEX IF NOT EXISTS idx_investigations_tenant_status_updated
  ON workflow.investigations (tenant_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_investigations_owner
  ON workflow.investigations (tenant_id, owner_id, status);

-- Evidence: hash lookup (already in 016, ensure idempotent)
CREATE INDEX IF NOT EXISTS idx_investigation_evidence_created
  ON workflow.investigation_evidence (investigation_id, created_at DESC);

-- Briefings: filter by status + updated_at for editorial dashboard
CREATE INDEX IF NOT EXISTS idx_briefings_tenant_status_updated
  ON workflow.briefings (tenant_id, status, updated_at DESC);

-- Briefing versions: latest version lookup
CREATE INDEX IF NOT EXISTS idx_briefing_versions_latest
  ON workflow.briefing_versions (briefing_id, version_number DESC);

-- AI suggestions: pending verification batch
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_entity_pending
  ON workflow.ai_suggestions (tenant_id, entity_id, verification_status)
  WHERE verification_status = 'pending';

-- Documents: ingestion recency by source (critical for health dashboard)
CREATE INDEX IF NOT EXISTS idx_documents_source_fetched
  ON core.documents (source_id, fetched_at DESC);

-- ── 5. Seed default retention policies ────────────────────────────────────
WITH default_tenant AS (
  SELECT id FROM core.tenants ORDER BY created_at ASC LIMIT 1
),
policy_rows AS (
  SELECT * FROM (VALUES
    ('socmint-90-day', 'core', 'socmint_signals', 'created_at', 90, 'socmint', 30, FALSE),
    ('documents-365-day', 'core', 'documents', 'fetched_at', 365, 'standard', 90, TRUE),
    ('audit-log-2555-day', 'core', 'audit_log', 'changed_at', 2555, 'audit', 2555, TRUE),
    ('dpdpa-requests-2555-day', 'core', 'dpdpa_requests', 'created_at', 2555, 'audit', 365, TRUE),
    ('ai-suggestions-180-day', 'workflow', 'ai_suggestions', 'created_at', 180, 'standard', 0, FALSE)
  ) AS items(
    policy_name, table_schema, table_name, date_col,
    retention_days, data_class, minimum_days, dry_run_only
  )
)
INSERT INTO core.retention_policies (
  tenant_id, policy_name, table_schema, table_name,
  date_column, retention_days, data_class, minimum_days, dry_run_only
)
SELECT
  dt.id, pr.policy_name, pr.table_schema, pr.table_name,
  pr.date_col, pr.retention_days, pr.data_class, pr.minimum_days, pr.dry_run_only
FROM default_tenant AS dt CROSS JOIN policy_rows AS pr
ON CONFLICT (tenant_id, policy_name) DO UPDATE SET
  retention_days = EXCLUDED.retention_days,
  data_class     = EXCLUDED.data_class,
  minimum_days   = EXCLUDED.minimum_days,
  dry_run_only   = EXCLUDED.dry_run_only;

-- ── 6. Grants ─────────────────────────────────────────────────────────────
GRANT SELECT ON core.retention_policies TO narad_app_reader;
GRANT SELECT, INSERT, UPDATE ON core.retention_policies TO narad_ingest_writer;
GRANT SELECT, INSERT, UPDATE ON core.retention_policies TO narad_app_reader;

GRANT SELECT ON core.dpdpa_requests TO narad_app_reader;
GRANT SELECT, INSERT, UPDATE ON core.dpdpa_requests TO narad_ingest_writer;
GRANT SELECT, INSERT, UPDATE ON core.dpdpa_requests TO narad_app_reader;

GRANT SELECT ON core.compliance_audit_view TO narad_app_reader;
