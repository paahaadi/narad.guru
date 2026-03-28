-- 002_roles.sql
-- Create RBAC role hierarchy for NARAD V2.
-- Roles are cluster-level objects. Guards prevent errors on --reset (DB drop/recreate
-- leaves roles intact at the cluster level).
-- Passwords for login roles are set by migrate.sh after this file runs.

-- ── Non-login group roles ────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE ROLE narad_app_reader NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE ROLE narad_ingest_writer NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE ROLE narad_projection_writer NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Login roles (passwords replaced by migrate.sh from env vars) ─────────────
DO $$ BEGIN
  CREATE ROLE narad_app LOGIN PASSWORD 'placeholder_replaced_by_migrate_sh';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE ROLE narad_worker LOGIN PASSWORD 'placeholder_replaced_by_migrate_sh';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Grant group memberships ───────────────────────────────────────────────────
GRANT narad_app_reader TO narad_app;
GRANT narad_ingest_writer TO narad_worker;
GRANT narad_projection_writer TO narad_worker;
