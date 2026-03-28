-- 004_core_schema.sql
-- Core schema: 12 tables in FK dependency order.
-- Every table gets: UUID v7 PK, tenant_id, RLS, updated_at trigger (where applicable).
-- RLS uses subselect pattern to evaluate current_setting once per query, not per row.
-- current_setting 2nd arg TRUE = return NULL (not error) when setting is unset.

-- ── 1. core.tenants ──────────────────────────────────────────────────────────
CREATE TABLE core.tenants (
  id         UUID        NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
  name       TEXT        NOT NULL,
  slug       TEXT        NOT NULL UNIQUE,
  config     JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER set_tenants_updated_at
  BEFORE UPDATE ON core.tenants
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
-- No RLS on tenants: it is the root of the tenant hierarchy; app_current_tenant_id
-- is looked up from this table, so RLS here would be a chicken-and-egg problem.

-- ── 2. core.users ────────────────────────────────────────────────────────────
CREATE TABLE core.users (
  id              UUID        NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
  tenant_id       UUID        NOT NULL REFERENCES core.tenants(id) ON DELETE RESTRICT,
  email           TEXT        NOT NULL,
  display_name    TEXT        NOT NULL,
  role            TEXT        NOT NULL CHECK (role IN ('viewer','analyst','senior_analyst','approver','admin','dpo')),
  clearance_level TEXT        NOT NULL DEFAULT 'unclassified' CHECK (clearance_level IN ('unclassified','restricted','confidential','secret')),
  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
  password_hash   TEXT        NOT NULL,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ON core.users (tenant_id, email);
CREATE INDEX ON core.users (tenant_id);

CREATE TRIGGER set_users_updated_at
  BEFORE UPDATE ON core.users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE core.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON core.users
  FOR ALL USING (tenant_id = (SELECT current_setting('app.current_tenant_id', TRUE)::uuid));

-- ── 3. core.sources ──────────────────────────────────────────────────────────
CREATE TABLE core.sources (
  id                     UUID        NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
  tenant_id              UUID        NOT NULL REFERENCES core.tenants(id) ON DELETE RESTRICT,
  name                   TEXT        NOT NULL,
  slug                   TEXT        NOT NULL,
  source_type            TEXT        NOT NULL CHECK (source_type IN ('rss','api','portal','wms','sftp','manual','satellite')),
  trust_tier             SMALLINT    NOT NULL CHECK (trust_tier IN (1,2,3)),
  authority_level        TEXT        NOT NULL,
  license                TEXT,
  update_cadence_seconds INTEGER,
  base_url               TEXT,
  config                 JSONB       NOT NULL DEFAULT '{}',
  governance_approved    BOOLEAN     NOT NULL DEFAULT FALSE,
  is_active              BOOLEAN     NOT NULL DEFAULT TRUE,
  last_successful_fetch  TIMESTAMPTZ,
  last_error             TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ON core.sources (tenant_id, slug);
CREATE INDEX ON core.sources (tenant_id);

CREATE TRIGGER set_sources_updated_at
  BEFORE UPDATE ON core.sources
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE core.sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON core.sources
  FOR ALL USING (tenant_id = (SELECT current_setting('app.current_tenant_id', TRUE)::uuid));

-- ── 4. core.documents ────────────────────────────────────────────────────────
CREATE TABLE core.documents (
  id                  UUID        NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
  tenant_id           UUID        NOT NULL REFERENCES core.tenants(id) ON DELETE RESTRICT,
  source_id           UUID        NOT NULL REFERENCES core.sources(id) ON DELETE RESTRICT,
  external_id         TEXT,
  doc_type            TEXT        NOT NULL CHECK (doc_type IN ('article','bulletin','filing','order','warning','forecast','telemetry','debate','bill','gazette','circular','press_release','report','media')),
  title               TEXT,
  body_text           TEXT,
  original_language   TEXT,
  translated_text     TEXT,
  translated_language TEXT        DEFAULT 'en',
  content_hash        TEXT        NOT NULL,
  fuzzy_hash          TEXT,
  fetch_url           TEXT,
  s3_key              TEXT,
  published_at        TIMESTAMPTZ,
  fetched_at          TIMESTAMPTZ NOT NULL,
  embedding           vector(768),
  tsv                 TSVECTOR,
  metadata            JSONB       NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ON core.documents (tenant_id, source_id, content_hash);
CREATE INDEX ON core.documents (tenant_id, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX ON core.documents (tenant_id);
CREATE INDEX ON core.documents (source_id);
CREATE INDEX ON core.documents USING GIN (tsv);
CREATE INDEX ON core.documents USING hnsw (embedding vector_cosine_ops) WHERE embedding IS NOT NULL;

CREATE OR REPLACE FUNCTION update_documents_tsv()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.tsv := to_tsvector('english',
    COALESCE(NEW.title, '') || ' ' ||
    COALESCE(NEW.body_text, '') || ' ' ||
    COALESCE(NEW.translated_text, ''));
  RETURN NEW;
END $$;

CREATE TRIGGER update_documents_tsv_trigger
  BEFORE INSERT OR UPDATE ON core.documents
  FOR EACH ROW EXECUTE FUNCTION update_documents_tsv();

CREATE TRIGGER set_documents_updated_at
  BEFORE UPDATE ON core.documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE core.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON core.documents
  FOR ALL USING (tenant_id = (SELECT current_setting('app.current_tenant_id', TRUE)::uuid));

-- ── 5. core.entities ─────────────────────────────────────────────────────────
CREATE TABLE core.entities (
  id             UUID        NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
  tenant_id      UUID        NOT NULL REFERENCES core.tenants(id) ON DELETE RESTRICT,
  entity_type    TEXT        NOT NULL CHECK (entity_type IN ('company','person','ministry','regulator','district','state','port','airport','railway_station','nuclear_facility','vessel','aircraft','parcel','project','organization','military_installation')),
  canonical_name TEXT        NOT NULL,
  aliases        TEXT[]      NOT NULL DEFAULT '{}',
  description    TEXT,
  geometry       GEOMETRY(Point, 4326),
  state_code     TEXT,
  district_code  TEXT,
  country_code   TEXT        DEFAULT 'IN',
  external_ids   JSONB       NOT NULL DEFAULT '{}',
  risk_score     NUMERIC(5,2),
  risk_inputs    JSONB       NOT NULL DEFAULT '{}',
  health_score   NUMERIC(5,2),
  health_inputs  JSONB       NOT NULL DEFAULT '{}',
  is_resolved    BOOLEAN     NOT NULL DEFAULT FALSE,
  resolved_at    TIMESTAMPTZ,
  resolved_from  UUID[]      NOT NULL DEFAULT '{}',
  embedding      vector(768),
  tsv            TSVECTOR,
  metadata       JSONB       NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON core.entities USING GIN (aliases);
CREATE INDEX ON core.entities USING GIN (external_ids jsonb_path_ops);
CREATE INDEX ON core.entities USING GIST (geometry);
CREATE INDEX ON core.entities USING GIN (tsv);
CREATE INDEX ON core.entities USING hnsw (embedding vector_cosine_ops) WHERE embedding IS NOT NULL;
CREATE INDEX ON core.entities (tenant_id, entity_type);
CREATE INDEX ON core.entities (tenant_id);

CREATE OR REPLACE FUNCTION update_entities_tsv()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.tsv := to_tsvector('english',
    COALESCE(NEW.canonical_name, '') || ' ' ||
    COALESCE(array_to_string(NEW.aliases, ' '), '') || ' ' ||
    COALESCE(NEW.description, ''));
  RETURN NEW;
END $$;

CREATE TRIGGER update_entities_tsv_trigger
  BEFORE INSERT OR UPDATE ON core.entities
  FOR EACH ROW EXECUTE FUNCTION update_entities_tsv();

CREATE TRIGGER set_entities_updated_at
  BEFORE UPDATE ON core.entities
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE core.entities ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON core.entities
  FOR ALL USING (tenant_id = (SELECT current_setting('app.current_tenant_id', TRUE)::uuid));

-- ── 6. core.events (initial — without story_capsule_id) ──────────────────────
-- story_capsule_id is added via ALTER after core.story_capsules is created below.
CREATE TABLE core.events (
  id                UUID         NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
  tenant_id         UUID         NOT NULL REFERENCES core.tenants(id) ON DELETE RESTRICT,
  event_type        TEXT         NOT NULL CHECK (event_type IN ('conflict','protest','disaster','weather','regulatory','corporate','legislative','infrastructure','security','environment','transport','economic','health','political','judicial','fire','maritime','aviation')),
  event_subtype     TEXT,
  title             TEXT         NOT NULL,
  summary           TEXT,
  severity          TEXT         NOT NULL DEFAULT 'medium' CHECK (severity IN ('critical','high','medium','low','informational')),
  confidence        NUMERIC(3,2) NOT NULL DEFAULT 0.50 CHECK (confidence BETWEEN 0.00 AND 1.00),
  status            TEXT         NOT NULL DEFAULT 'ingested' CHECK (status IN ('ingested','canonicalized','enriched','in_investigation','resolved','invalidated')),
  geometry          GEOMETRY(Point, 4326),
  geometry_area     GEOMETRY(Polygon, 4326),
  state_code        TEXT,
  district_code     TEXT,
  occurred_at       TIMESTAMPTZ,
  reported_at       TIMESTAMPTZ,
  cluster_id        UUID,
  source_count      INTEGER      NOT NULL DEFAULT 1,
  primary_source_id UUID         REFERENCES core.sources(id) ON DELETE SET NULL,
  embedding         vector(768),
  tsv               TSVECTOR,
  metadata          JSONB        NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX ON core.events (tenant_id, status, severity);
CREATE INDEX ON core.events (tenant_id, occurred_at DESC);
CREATE INDEX ON core.events (tenant_id, event_type);
CREATE INDEX ON core.events USING GIST (geometry);
CREATE INDEX ON core.events USING GIST (geometry_area) WHERE geometry_area IS NOT NULL;
CREATE INDEX ON core.events USING GIN (tsv);
CREATE INDEX ON core.events USING hnsw (embedding vector_cosine_ops) WHERE embedding IS NOT NULL;
CREATE INDEX ON core.events (cluster_id) WHERE cluster_id IS NOT NULL;
CREATE INDEX ON core.events (tenant_id);
CREATE INDEX ON core.events (primary_source_id) WHERE primary_source_id IS NOT NULL;

CREATE OR REPLACE FUNCTION update_events_tsv()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.tsv := to_tsvector('english',
    COALESCE(NEW.title, '') || ' ' || COALESCE(NEW.summary, ''));
  RETURN NEW;
END $$;

CREATE TRIGGER update_events_tsv_trigger
  BEFORE INSERT OR UPDATE ON core.events
  FOR EACH ROW EXECUTE FUNCTION update_events_tsv();

CREATE TRIGGER set_events_updated_at
  BEFORE UPDATE ON core.events
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE core.events ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON core.events
  FOR ALL USING (tenant_id = (SELECT current_setting('app.current_tenant_id', TRUE)::uuid));

-- ── 7. core.story_capsules ────────────────────────────────────────────────────
CREATE TABLE core.story_capsules (
  id               UUID         NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
  tenant_id        UUID         NOT NULL REFERENCES core.tenants(id) ON DELETE RESTRICT,
  event_id         UUID         NOT NULL REFERENCES core.events(id) ON DELETE CASCADE,
  headline         TEXT         NOT NULL,
  explanation      TEXT         NOT NULL,
  key_facts        JSONB        NOT NULL DEFAULT '[]',
  evidence_bundle  JSONB        NOT NULL,
  ai_model         TEXT         NOT NULL,
  ai_model_version TEXT,
  prompt_hash      TEXT         NOT NULL,
  confidence       NUMERIC(3,2) NOT NULL,
  generated_at     TIMESTAMPTZ  NOT NULL,
  expires_at       TIMESTAMPTZ,
  superseded_by    UUID         REFERENCES core.story_capsules(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX ON core.story_capsules (tenant_id, event_id);
CREATE INDEX ON core.story_capsules (tenant_id);
CREATE INDEX ON core.story_capsules (event_id);

ALTER TABLE core.story_capsules ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON core.story_capsules
  FOR ALL USING (tenant_id = (SELECT current_setting('app.current_tenant_id', TRUE)::uuid));

-- ── 8. Resolve circular FK: add story_capsule_id to core.events ──────────────
ALTER TABLE core.events
  ADD COLUMN story_capsule_id UUID REFERENCES core.story_capsules(id) ON DELETE SET NULL;
CREATE INDEX ON core.events (story_capsule_id) WHERE story_capsule_id IS NOT NULL;

-- ── 9. core.claims ────────────────────────────────────────────────────────────
CREATE TABLE core.claims (
  id                       UUID         NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
  tenant_id                UUID         NOT NULL REFERENCES core.tenants(id) ON DELETE RESTRICT,
  document_id              UUID         NOT NULL REFERENCES core.documents(id) ON DELETE CASCADE,
  event_id                 UUID         REFERENCES core.events(id) ON DELETE SET NULL,
  entity_id                UUID         REFERENCES core.entities(id) ON DELETE SET NULL,
  claim_text               TEXT         NOT NULL,
  claim_type               TEXT         NOT NULL CHECK (claim_type IN ('factual','opinion','prediction','regulatory','financial','spatial','temporal','causal')),
  confidence               NUMERIC(3,2) NOT NULL DEFAULT 0.50,
  is_verified              BOOLEAN      NOT NULL DEFAULT FALSE,
  verified_by              UUID         REFERENCES core.users(id) ON DELETE SET NULL,
  verified_at              TIMESTAMPTZ,
  lineage_hash             TEXT         NOT NULL,
  extraction_model         TEXT,
  extraction_model_version TEXT,
  embedding                vector(768),
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX ON core.claims (tenant_id, document_id);
CREATE INDEX ON core.claims (tenant_id, event_id) WHERE event_id IS NOT NULL;
CREATE INDEX ON core.claims (tenant_id, entity_id) WHERE entity_id IS NOT NULL;
CREATE INDEX ON core.claims (tenant_id);
CREATE INDEX ON core.claims (document_id);
CREATE INDEX ON core.claims USING hnsw (embedding vector_cosine_ops) WHERE embedding IS NOT NULL;

ALTER TABLE core.claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON core.claims
  FOR ALL USING (tenant_id = (SELECT current_setting('app.current_tenant_id', TRUE)::uuid));

-- ── 10. core.relationships ────────────────────────────────────────────────────
CREATE TABLE core.relationships (
  id                UUID         NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
  tenant_id         UUID         NOT NULL REFERENCES core.tenants(id) ON DELETE RESTRICT,
  source_entity_id  UUID         NOT NULL REFERENCES core.entities(id) ON DELETE CASCADE,
  target_entity_id  UUID         NOT NULL REFERENCES core.entities(id) ON DELETE CASCADE,
  relationship_type TEXT         NOT NULL CHECK (relationship_type IN ('ownership','directorship','subsidiary','parent','partner','supplier','customer','regulator','regulated_by','located_in','operates_at','successor','predecessor','affiliated','joint_venture','legal_action')),
  confidence        NUMERIC(3,2) NOT NULL DEFAULT 0.50,
  valid_from        TIMESTAMPTZ,
  valid_until       TIMESTAMPTZ,
  lineage_hash      TEXT         NOT NULL,
  source_document_id UUID        REFERENCES core.documents(id) ON DELETE SET NULL,
  metadata          JSONB        NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT no_self_relationship CHECK (source_entity_id != target_entity_id)
);

CREATE INDEX ON core.relationships (tenant_id, source_entity_id);
CREATE INDEX ON core.relationships (tenant_id, target_entity_id);
CREATE INDEX ON core.relationships (tenant_id, relationship_type);
CREATE INDEX ON core.relationships (tenant_id);
CREATE INDEX ON core.relationships (source_entity_id);
CREATE INDEX ON core.relationships (target_entity_id);

CREATE TRIGGER set_relationships_updated_at
  BEFORE UPDATE ON core.relationships
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE core.relationships ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON core.relationships
  FOR ALL USING (tenant_id = (SELECT current_setting('app.current_tenant_id', TRUE)::uuid));

-- ── 11. core.event_entity_links ───────────────────────────────────────────────
CREATE TABLE core.event_entity_links (
  id          UUID         NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
  tenant_id   UUID         NOT NULL REFERENCES core.tenants(id) ON DELETE RESTRICT,
  event_id    UUID         NOT NULL REFERENCES core.events(id) ON DELETE CASCADE,
  entity_id   UUID         NOT NULL REFERENCES core.entities(id) ON DELETE CASCADE,
  role        TEXT         NOT NULL CHECK (role IN ('actor','target','location','regulator','reporter','affected','mentioned','owner','operator')),
  confidence  NUMERIC(3,2) NOT NULL DEFAULT 0.50,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ON core.event_entity_links (tenant_id, event_id, entity_id, role);
CREATE INDEX ON core.event_entity_links (tenant_id);
CREATE INDEX ON core.event_entity_links (event_id);
CREATE INDEX ON core.event_entity_links (entity_id);

ALTER TABLE core.event_entity_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON core.event_entity_links
  FOR ALL USING (tenant_id = (SELECT current_setting('app.current_tenant_id', TRUE)::uuid));

-- ── 12. core.event_document_links ────────────────────────────────────────────
CREATE TABLE core.event_document_links (
  id          UUID        NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
  tenant_id   UUID        NOT NULL REFERENCES core.tenants(id) ON DELETE RESTRICT,
  event_id    UUID        NOT NULL REFERENCES core.events(id) ON DELETE CASCADE,
  document_id UUID        NOT NULL REFERENCES core.documents(id) ON DELETE RESTRICT,
  link_type   TEXT        NOT NULL CHECK (link_type IN ('primary_source','corroboration','context','contradiction','update')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ON core.event_document_links (tenant_id, event_id, document_id, link_type);
CREATE INDEX ON core.event_document_links (tenant_id);
CREATE INDEX ON core.event_document_links (event_id);
CREATE INDEX ON core.event_document_links (document_id);

ALTER TABLE core.event_document_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON core.event_document_links
  FOR ALL USING (tenant_id = (SELECT current_setting('app.current_tenant_id', TRUE)::uuid));

-- ── 13. core.impacts ─────────────────────────────────────────────────────────
CREATE TABLE core.impacts (
  id                 UUID         NOT NULL DEFAULT uuid_generate_v7() PRIMARY KEY,
  tenant_id          UUID         NOT NULL REFERENCES core.tenants(id) ON DELETE RESTRICT,
  event_id           UUID         NOT NULL REFERENCES core.events(id) ON DELETE CASCADE,
  impact_type        TEXT         NOT NULL CHECK (impact_type IN ('human','economic','legal','infrastructure','environmental','political','social','reputational')),
  severity           TEXT         NOT NULL CHECK (severity IN ('critical','high','medium','low')),
  description        TEXT,
  quantitative_value NUMERIC,
  quantitative_unit  TEXT,
  confidence         NUMERIC(3,2) NOT NULL DEFAULT 0.50,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX ON core.impacts (tenant_id, event_id);
CREATE INDEX ON core.impacts (tenant_id);
CREATE INDEX ON core.impacts (event_id);

ALTER TABLE core.impacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON core.impacts
  FOR ALL USING (tenant_id = (SELECT current_setting('app.current_tenant_id', TRUE)::uuid));
