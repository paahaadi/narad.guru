-- 007_audit_schema.sql
-- Immutable audit trail: 2 tables.
-- audit.audit_log: monthly range-partitioned, INSERT-only.
-- audit.state_transitions: INSERT-only.
-- INSERT-only enforcement: REVOKE UPDATE/DELETE + BEFORE trigger (two layers).

-- ── 1. audit.audit_log ────────────────────────────────────────────────────────
CREATE TABLE audit.audit_log (
  id          UUID        NOT NULL DEFAULT uuid_generate_v7(),
  tenant_id   UUID        NOT NULL,
  user_id     UUID        NOT NULL,
  action      TEXT        NOT NULL,
  object_type TEXT        NOT NULL,
  object_id   UUID        NOT NULL,
  delta       JSONB,
  ip_address  INET,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
) PARTITION BY RANGE (created_at);

-- BRIN index: 10-100x smaller than B-tree; ideal for append-only time-series.
CREATE INDEX ON audit.audit_log USING BRIN (created_at);
CREATE INDEX ON audit.audit_log (tenant_id, created_at);

-- Pre-create current month (2026-03) + 2 future months.
-- A cron job (Phase 2B) creates the next partition on the 20th of each month.
CREATE TABLE audit.audit_log_2026_03
  PARTITION OF audit.audit_log
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

CREATE TABLE audit.audit_log_2026_04
  PARTITION OF audit.audit_log
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

CREATE TABLE audit.audit_log_2026_05
  PARTITION OF audit.audit_log
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

-- INSERT-only enforcement layer 1: REVOKE
REVOKE UPDATE, DELETE ON TABLE audit.audit_log FROM PUBLIC;

-- INSERT-only enforcement layer 2: trigger
CREATE OR REPLACE FUNCTION prevent_audit_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% on %.% is not permitted: this table is INSERT-only', TG_OP, TG_TABLE_SCHEMA, TG_TABLE_NAME;
END $$;

CREATE TRIGGER prevent_audit_log_mutation
  BEFORE UPDATE OR DELETE ON audit.audit_log
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();

-- ── 2. audit.state_transitions ────────────────────────────────────────────────
CREATE TABLE audit.state_transitions (
  id              UUID        NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
  tenant_id       UUID        NOT NULL,
  object_type     TEXT        NOT NULL,
  object_id       UUID        NOT NULL,
  from_state      TEXT,
  to_state        TEXT        NOT NULL,
  transitioned_by UUID        NOT NULL,
  reason          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON audit.state_transitions (tenant_id, object_type, object_id);
CREATE INDEX ON audit.state_transitions USING BRIN (created_at);

REVOKE UPDATE, DELETE ON TABLE audit.state_transitions FROM PUBLIC;

CREATE TRIGGER prevent_state_transitions_mutation
  BEFORE UPDATE OR DELETE ON audit.state_transitions
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
