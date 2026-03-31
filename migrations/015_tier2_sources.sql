-- 015_tier2_sources.sql
-- Phase 3C: Tier 2 source seeds (ACLED, FIRMS, OpenSky, GDELT).

WITH default_tenant AS (
  SELECT id FROM core.tenants ORDER BY created_at ASC LIMIT 1
),
seed_rows AS (
  SELECT * FROM (
    VALUES
      ('ACLED Conflict Data', 'acled', 'api', 2, 'research', 3600, 'https://api.acleddata.com', '{}'::jsonb),
      ('NASA FIRMS Fire Data', 'firms', 'api', 2, 'research', 900, 'https://firms.modaps.eosdis.nasa.gov', '{}'::jsonb),
      ('OpenSky Network', 'opensky', 'api', 2, 'open_data', 60, 'https://opensky-network.org', '{}'::jsonb),
      ('GDELT Global Events', 'gdelt', 'api', 2, 'open_data', 900, 'https://api.gdeltproject.org', '{}'::jsonb)
  ) AS items(name, slug, source_type, trust_tier, authority_level, cadence, base_url, config)
)
INSERT INTO core.sources (
  tenant_id, name, slug, source_type, trust_tier, authority_level,
  update_cadence_seconds, base_url, config, governance_approved, is_active, status
)
SELECT
  default_tenant.id, seed_rows.name, seed_rows.slug, seed_rows.source_type,
  seed_rows.trust_tier, seed_rows.authority_level, seed_rows.cadence,
  seed_rows.base_url, seed_rows.config, TRUE, TRUE, 'active'
FROM default_tenant CROSS JOIN seed_rows
ON CONFLICT (tenant_id, slug) DO UPDATE SET
  name = EXCLUDED.name, source_type = EXCLUDED.source_type,
  trust_tier = EXCLUDED.trust_tier, authority_level = EXCLUDED.authority_level,
  update_cadence_seconds = EXCLUDED.update_cadence_seconds,
  base_url = EXCLUDED.base_url, config = EXCLUDED.config,
  governance_approved = EXCLUDED.governance_approved,
  is_active = EXCLUDED.is_active, status = EXCLUDED.status;
