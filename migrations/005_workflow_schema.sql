-- 005_workflow_schema.sql
-- Workflow schema: 11 tables for analyst operations.
-- workflow.evidence_custody_log is INSERT-only (trigger + REVOKE).

-- ── 1. workflow.watchlists ────────────────────────────────────────────────────
CREATE TABLE workflow.watchlists (
  id          UUID        NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
  tenant_id   UUID        NOT NULL REFERENCES core.tenants(id) ON DELETE RESTRICT,
  owner_id    UUID        NOT NULL REFERENCES core.users(id) ON DELETE RESTRICT,
  name        TEXT        NOT NULL,
  description TEXT,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON workflow.watchlists (tenant_id);
CREATE INDEX ON workflow.watchlists (owner_id);

CREATE TRIGGER set_watchlists_updated_at
  BEFORE UPDATE ON workflow.watchlists
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE workflow.watchlists ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON workflow.watchlists
  FOR ALL USING (tenant_id = (SELECT current_setting('app.current_tenant_id', TRUE)::uuid));

-- ── 2. workflow.watchlist_items ───────────────────────────────────────────────
CREATE TABLE workflow.watchlist_items (
  id           UUID        NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
  watchlist_id UUID        NOT NULL REFERENCES workflow.watchlists(id) ON DELETE CASCADE,
  target_type  TEXT        NOT NULL CHECK (target_type IN ('entity','event','geography','regulatory_subject','asset','company','ministry','district')),
  target_id    UUID        NOT NULL,
  added_by     UUID        NOT NULL REFERENCES core.users(id) ON DELETE RESTRICT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ON workflow.watchlist_items (watchlist_id, target_type, target_id);
CREATE INDEX ON workflow.watchlist_items (watchlist_id);

-- ── 3. workflow.watchlist_rules ───────────────────────────────────────────────
CREATE TABLE workflow.watchlist_rules (
  id                UUID        NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
  watchlist_id      UUID        NOT NULL REFERENCES workflow.watchlists(id) ON DELETE CASCADE,
  rule_name         TEXT        NOT NULL,
  condition         JSONB       NOT NULL,
  severity_override TEXT        CHECK (severity_override IN ('critical','high','medium','low')),
  is_active         BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON workflow.watchlist_rules (watchlist_id);

CREATE TRIGGER set_watchlist_rules_updated_at
  BEFORE UPDATE ON workflow.watchlist_rules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 4. workflow.watchlist_alerts ──────────────────────────────────────────────
CREATE TABLE workflow.watchlist_alerts (
  id                     UUID        NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
  tenant_id              UUID        NOT NULL REFERENCES core.tenants(id) ON DELETE RESTRICT,
  watchlist_id           UUID        NOT NULL REFERENCES workflow.watchlists(id) ON DELETE CASCADE,
  rule_id                UUID        REFERENCES workflow.watchlist_rules(id) ON DELETE SET NULL,
  triggered_by_event_id  UUID        REFERENCES core.events(id) ON DELETE SET NULL,
  triggered_by_entity_id UUID        REFERENCES core.entities(id) ON DELETE SET NULL,
  severity               TEXT        NOT NULL CHECK (severity IN ('critical','high','medium','low')),
  status                 TEXT        NOT NULL DEFAULT 'new' CHECK (status IN ('new','triaged','assigned','acknowledged','in_progress','resolved','suppressed')),
  title                  TEXT        NOT NULL,
  summary                TEXT,
  assigned_to            UUID        REFERENCES core.users(id) ON DELETE SET NULL,
  episode_id             UUID,
  triaged_at             TIMESTAMPTZ,
  resolved_at            TIMESTAMPTZ,
  metadata               JSONB       NOT NULL DEFAULT '{}',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON workflow.watchlist_alerts (tenant_id, status, severity);
CREATE INDEX ON workflow.watchlist_alerts (tenant_id);
CREATE INDEX ON workflow.watchlist_alerts (watchlist_id);
CREATE INDEX ON workflow.watchlist_alerts (triggered_by_event_id) WHERE triggered_by_event_id IS NOT NULL;
CREATE INDEX ON workflow.watchlist_alerts (triggered_by_entity_id) WHERE triggered_by_entity_id IS NOT NULL;

CREATE TRIGGER set_watchlist_alerts_updated_at
  BEFORE UPDATE ON workflow.watchlist_alerts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE workflow.watchlist_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON workflow.watchlist_alerts
  FOR ALL USING (tenant_id = (SELECT current_setting('app.current_tenant_id', TRUE)::uuid));

-- ── 5. workflow.investigations ────────────────────────────────────────────────
CREATE TABLE workflow.investigations (
  id             UUID         NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
  tenant_id      UUID         NOT NULL REFERENCES core.tenants(id) ON DELETE RESTRICT,
  owner_id       UUID         NOT NULL REFERENCES core.users(id) ON DELETE RESTRICT,
  title          TEXT         NOT NULL,
  description    TEXT,
  status         TEXT         NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','under_review','active','on_hold','closed','archived')),
  classification TEXT         NOT NULL DEFAULT 'unclassified' CHECK (classification IN ('unclassified','restricted','confidential','secret')),
  confidence     NUMERIC(3,2),
  hypothesis     TEXT,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX ON workflow.investigations (tenant_id, status);
CREATE INDEX ON workflow.investigations (tenant_id);
CREATE INDEX ON workflow.investigations (owner_id);

CREATE TRIGGER set_investigations_updated_at
  BEFORE UPDATE ON workflow.investigations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE workflow.investigations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON workflow.investigations
  FOR ALL USING (tenant_id = (SELECT current_setting('app.current_tenant_id', TRUE)::uuid));

-- ── 6. workflow.investigation_items ──────────────────────────────────────────
CREATE TABLE workflow.investigation_items (
  id               UUID        NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
  investigation_id UUID        NOT NULL REFERENCES workflow.investigations(id) ON DELETE CASCADE,
  item_type        TEXT        NOT NULL CHECK (item_type IN ('event','entity','document','claim')),
  item_id          UUID        NOT NULL,
  role             TEXT        NOT NULL DEFAULT 'evidence' CHECK (role IN ('key_evidence','supporting','context','lead','exculpatory','disputed')),
  added_by         UUID        NOT NULL REFERENCES core.users(id) ON DELETE RESTRICT,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON workflow.investigation_items (investigation_id);
CREATE INDEX ON workflow.investigation_items (item_type, item_id);

-- ── 7. workflow.investigation_evidence ───────────────────────────────────────
CREATE TABLE workflow.investigation_evidence (
  id               UUID        NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
  investigation_id UUID        NOT NULL REFERENCES workflow.investigations(id) ON DELETE CASCADE,
  document_id      UUID        NOT NULL REFERENCES core.documents(id) ON DELETE RESTRICT,
  evidence_hash    TEXT        NOT NULL,
  s3_key_worm      TEXT        NOT NULL,
  is_verified      BOOLEAN     NOT NULL DEFAULT FALSE,
  verified_by      UUID        REFERENCES core.users(id) ON DELETE SET NULL,
  verified_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON workflow.investigation_evidence (investigation_id);
CREATE INDEX ON workflow.investigation_evidence (document_id);

-- ── 8. workflow.evidence_custody_log (INSERT-only) ───────────────────────────
CREATE TABLE workflow.evidence_custody_log (
  id                      UUID        NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
  evidence_id             UUID        NOT NULL REFERENCES workflow.investigation_evidence(id) ON DELETE RESTRICT,
  user_id                 UUID        NOT NULL REFERENCES core.users(id) ON DELETE RESTRICT,
  action                  TEXT        NOT NULL CHECK (action IN ('ingested','viewed','exported','verified','challenged','transferred')),
  evidence_hash_at_action TEXT        NOT NULL,
  ip_address              INET,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON workflow.evidence_custody_log (evidence_id);

-- INSERT-only enforcement: trigger as second layer of defence
CREATE OR REPLACE FUNCTION prevent_custody_log_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'workflow.evidence_custody_log is INSERT-only: % is not permitted', TG_OP;
END $$;

CREATE TRIGGER prevent_custody_log_update
  BEFORE UPDATE OR DELETE ON workflow.evidence_custody_log
  FOR EACH ROW EXECUTE FUNCTION prevent_custody_log_mutation();

REVOKE UPDATE, DELETE ON TABLE workflow.evidence_custody_log FROM PUBLIC;

-- ── 9. workflow.investigation_notes ──────────────────────────────────────────
CREATE TABLE workflow.investigation_notes (
  id                  UUID        NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
  investigation_id    UUID        NOT NULL REFERENCES workflow.investigations(id) ON DELETE CASCADE,
  author_id           UUID        NOT NULL REFERENCES core.users(id) ON DELETE RESTRICT,
  note_type           TEXT        NOT NULL DEFAULT 'note' CHECK (note_type IN ('note','hypothesis','task','decision')),
  body                TEXT        NOT NULL,
  is_ai_generated     BOOLEAN     NOT NULL DEFAULT FALSE,
  verification_status TEXT        DEFAULT 'unverified' CHECK (verification_status IN ('unverified','pending_review','accepted','rejected')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON workflow.investigation_notes (investigation_id);

CREATE TRIGGER set_investigation_notes_updated_at
  BEFORE UPDATE ON workflow.investigation_notes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 10. workflow.briefings ────────────────────────────────────────────────────
CREATE TABLE workflow.briefings (
  id              UUID        NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
  tenant_id       UUID        NOT NULL REFERENCES core.tenants(id) ON DELETE RESTRICT,
  owner_id        UUID        NOT NULL REFERENCES core.users(id) ON DELETE RESTRICT,
  title           TEXT        NOT NULL,
  audience        TEXT,
  status          TEXT        NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','under_review','approved','published','superseded','withdrawn')),
  current_version INTEGER     NOT NULL DEFAULT 1,
  supersedes_id   UUID        REFERENCES workflow.briefings(id) ON DELETE SET NULL,
  approved_by     UUID        REFERENCES core.users(id) ON DELETE SET NULL,
  approved_at     TIMESTAMPTZ,
  published_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON workflow.briefings (tenant_id, status);
CREATE INDEX ON workflow.briefings (tenant_id);
CREATE INDEX ON workflow.briefings (owner_id);

CREATE TRIGGER set_briefings_updated_at
  BEFORE UPDATE ON workflow.briefings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE workflow.briefings ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON workflow.briefings
  FOR ALL USING (tenant_id = (SELECT current_setting('app.current_tenant_id', TRUE)::uuid));

-- ── 11. workflow.briefing_versions ───────────────────────────────────────────
CREATE TABLE workflow.briefing_versions (
  id                       UUID        NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
  briefing_id              UUID        NOT NULL REFERENCES workflow.briefings(id) ON DELETE CASCADE,
  version_number           INTEGER     NOT NULL,
  sections                 JSONB       NOT NULL,
  source_investigation_ids UUID[]      NOT NULL DEFAULT '{}',
  source_event_ids         UUID[]      NOT NULL DEFAULT '{}',
  source_watchlist_ids     UUID[]      NOT NULL DEFAULT '{}',
  ai_draft_model           TEXT,
  edited_by                UUID        NOT NULL REFERENCES core.users(id) ON DELETE RESTRICT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ON workflow.briefing_versions (briefing_id, version_number);
CREATE INDEX ON workflow.briefing_versions (briefing_id);
