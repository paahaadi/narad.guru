-- 001_extensions.sql
-- Install required PostgreSQL extensions.
-- timescale/timescaledb-ha:pg16-latest includes: timescaledb, postgis, vector, pg_trgm, pg_stat_statements.
-- pg_uuidv7 is not guaranteed; we attempt it and fall back to a PL/pgSQL implementation.

-- Core extensions (all available in timescale/timescaledb-ha:pg16-latest)
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- pg_uuidv7: attempt install; ignore if not available in this image
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_uuidv7;
EXCEPTION WHEN OTHERS THEN
  NULL; -- fallback function below covers this
END $$;

-- uuid_generate_v7(): PL/pgSQL fallback — always created regardless of extension status.
-- Produces RFC 4122 v7 UUIDs: 48-bit Unix ms timestamp + 4-bit version + 74-bit random.
-- Time-ordered for B-tree index locality (avoids fragmentation from random UUIDv4).
CREATE OR REPLACE FUNCTION uuid_generate_v7()
RETURNS uuid
LANGUAGE plpgsql
PARALLEL SAFE
AS $$
DECLARE
  unix_ts_ms bytea;
  uuid_bytes bytea;
BEGIN
  unix_ts_ms := substring(int8send(
    floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint
  ) FROM 3);
  uuid_bytes := unix_ts_ms || gen_random_bytes(10);
  uuid_bytes := set_byte(uuid_bytes, 6,
    (b'01110000'::int | (get_byte(uuid_bytes, 6) & b'00001111'::int)));
  uuid_bytes := set_byte(uuid_bytes, 8,
    (b'10000000'::int | (get_byte(uuid_bytes, 8) & b'00111111'::int)));
  RETURN encode(uuid_bytes, 'hex')::uuid;
END $$;
