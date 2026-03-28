-- 006_domain_schemas.sql
-- Domain-specific schemas: corp_watch, lex_pulse, geo_intelligence.
-- 4 tables.

-- ── 1. corp_watch.entity_profiles ────────────────────────────────────────────
CREATE TABLE corp_watch.entity_profiles (
  id                      UUID         NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
  entity_id               UUID         NOT NULL REFERENCES core.entities(id) ON DELETE CASCADE UNIQUE,
  incorporation_date      DATE,
  registered_office       TEXT,
  authorized_capital_inr  NUMERIC,
  paid_up_capital_inr     NUMERIC,
  company_status          TEXT,
  company_class           TEXT,
  listing_status          TEXT,
  sector                  TEXT,
  filing_completeness     NUMERIC(3,2),
  last_filing_date        DATE,
  directors               JSONB        NOT NULL DEFAULT '[]',
  shareholders            JSONB        NOT NULL DEFAULT '[]',
  compliance_breach_count INTEGER      NOT NULL DEFAULT 0,
  created_at              TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX ON corp_watch.entity_profiles (entity_id);

CREATE TRIGGER set_entity_profiles_updated_at
  BEFORE UPDATE ON corp_watch.entity_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 2. lex_pulse.regulatory_events ───────────────────────────────────────────
CREATE TABLE lex_pulse.regulatory_events (
  id               UUID        NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
  event_id         UUID        NOT NULL REFERENCES core.events(id) ON DELETE CASCADE UNIQUE,
  ministry         TEXT,
  regulator        TEXT,
  gazette_ref      TEXT,
  act_ref          TEXT,
  amendment_type   TEXT        CHECK (amendment_type IN ('new_act','amendment','repeal','notification','circular','order','rule','guideline')),
  effective_date   DATE,
  what_changed     TEXT,
  why_it_matters   TEXT,
  affected_sectors TEXT[]      NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON lex_pulse.regulatory_events (event_id);

CREATE TRIGGER set_regulatory_events_updated_at
  BEFORE UPDATE ON lex_pulse.regulatory_events
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 3. lex_pulse.semantic_cache ──────────────────────────────────────────────
CREATE TABLE lex_pulse.semantic_cache (
  id              UUID        NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
  tenant_id       UUID        NOT NULL REFERENCES core.tenants(id) ON DELETE CASCADE,
  query_text      TEXT        NOT NULL,
  query_embedding vector(768) NOT NULL,
  answer_text     TEXT        NOT NULL,
  citations       JSONB       NOT NULL,
  model_used      TEXT        NOT NULL,
  hit_count       INTEGER     NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL
);

CREATE INDEX ON lex_pulse.semantic_cache USING hnsw (query_embedding vector_cosine_ops);
CREATE INDEX ON lex_pulse.semantic_cache (tenant_id, expires_at);
CREATE INDEX ON lex_pulse.semantic_cache (tenant_id);

-- ── 4. geo_intelligence.layer_configs ────────────────────────────────────────
CREATE TABLE geo_intelligence.layer_configs (
  id                       UUID        NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
  tenant_id                UUID        NOT NULL REFERENCES core.tenants(id) ON DELETE RESTRICT,
  name                     TEXT        NOT NULL,
  slug                     TEXT        NOT NULL,
  layer_type               TEXT        NOT NULL CHECK (layer_type IN ('point','polygon','heatmap','movement','cluster','choropleth','tile_overlay')),
  presets                  TEXT[]      NOT NULL,
  data_query               TEXT,
  tile_url_template        TEXT,
  style_config             JSONB       NOT NULL DEFAULT '{}',
  min_zoom                 SMALLINT    DEFAULT 0,
  max_zoom                 SMALLINT    DEFAULT 18,
  refresh_interval_seconds INTEGER,
  is_active                BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ON geo_intelligence.layer_configs (tenant_id, slug);
CREATE INDEX ON geo_intelligence.layer_configs (tenant_id);

CREATE TRIGGER set_layer_configs_updated_at
  BEFORE UPDATE ON geo_intelligence.layer_configs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE geo_intelligence.layer_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON geo_intelligence.layer_configs
  FOR ALL USING (tenant_id = (SELECT current_setting('app.current_tenant_id', TRUE)::uuid));
