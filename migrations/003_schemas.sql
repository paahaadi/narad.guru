-- 003_schemas.sql
-- Create all 7 application schemas and the shared updated_at trigger function.

CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS workflow;
CREATE SCHEMA IF NOT EXISTS geo_intelligence;
CREATE SCHEMA IF NOT EXISTS corp_watch;
CREATE SCHEMA IF NOT EXISTS lex_pulse;
CREATE SCHEMA IF NOT EXISTS audit;
CREATE SCHEMA IF NOT EXISTS projections;

-- Shared trigger function for all updated_at columns.
-- Created once here; applied per-table in subsequent migrations.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;
