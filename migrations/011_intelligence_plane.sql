-- 011_intelligence_plane.sql
-- Phase 2B intelligence plane additions.
-- Adds claim deduplication, a deterministic system user, query indexes, and
-- explicit worker grants required by the ingestion and projection pipeline.

-- ── 1. Unique index on claims.lineage_hash (dedup for claim extraction) ──
CREATE UNIQUE INDEX IF NOT EXISTS claims_lineage_hash_key
    ON core.claims (lineage_hash);

-- ── 2. Deterministic system user for automated audit logging ──
INSERT INTO core.users (id, tenant_id, email, display_name, role, password_hash)
SELECT
    '00000000-0000-7000-8000-000000000001'::uuid,
    (SELECT id FROM core.tenants LIMIT 1),
    'system@narad.internal',
    'NARAD System',
    'admin',
    'SYSTEM_NO_LOGIN'
WHERE NOT EXISTS (
    SELECT 1
    FROM core.users
    WHERE id = '00000000-0000-7000-8000-000000000001'::uuid
);

-- ── 3. Index on events for canonicalization queries ──
CREATE INDEX IF NOT EXISTS idx_events_canonicalization
    ON core.events (tenant_id, event_type, occurred_at DESC)
    WHERE status != 'invalidated';

-- ── 4. Index on event_entity_links for entity overlap queries ──
CREATE INDEX IF NOT EXISTS idx_event_entity_links_entity
    ON core.event_entity_links (entity_id, event_id);

-- ── 5. Explicit worker grants for audit/workflow writes ──
GRANT INSERT ON ALL TABLES IN SCHEMA audit TO narad_ingest_writer;
GRANT USAGE ON SCHEMA workflow TO narad_ingest_writer;
GRANT SELECT ON ALL TABLES IN SCHEMA workflow TO narad_ingest_writer;
GRANT INSERT ON workflow.watchlist_alerts TO narad_ingest_writer;
