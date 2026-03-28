-- 009_timescaledb.sql
-- TimescaleDB hypertable for high-velocity telemetry (aircraft positions, fire detections, etc.)
-- core.telemetry_events: no UUID PK (time-series append-only workload).
-- Retention: 7 days. Compression: after 1 day. Continuous aggregates: hourly + daily.

-- ── 1. core.telemetry_events ──────────────────────────────────────────────────
CREATE TABLE core.telemetry_events (
  time           TIMESTAMPTZ          NOT NULL,
  tenant_id      UUID                 NOT NULL,
  source_id      UUID                 NOT NULL REFERENCES core.sources(id) ON DELETE RESTRICT,
  telemetry_type TEXT                 NOT NULL,
  geometry       GEOMETRY(Point,4326) NOT NULL,
  payload        JSONB                NOT NULL
);

CREATE INDEX ON core.telemetry_events (tenant_id, telemetry_type, time DESC);
CREATE INDEX ON core.telemetry_events USING GIST (geometry);

-- ── 2. Convert to TimescaleDB hypertable ─────────────────────────────────────
SELECT create_hypertable('core.telemetry_events', 'time',
  chunk_time_interval => INTERVAL '1 day');

-- ── 3. Retention policy: drop chunks older than 7 days ───────────────────────
SELECT add_retention_policy('core.telemetry_events', INTERVAL '7 days');

-- ── 4. Compression: compress chunks older than 1 day ─────────────────────────
ALTER TABLE core.telemetry_events SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'tenant_id,telemetry_type',
  timescaledb.compress_orderby = 'time DESC'
);
SELECT add_compression_policy('core.telemetry_events', INTERVAL '1 day');

-- ── 5. Hourly continuous aggregate ───────────────────────────────────────────
CREATE MATERIALIZED VIEW core.telemetry_hourly
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 hour', time) AS bucket,
  tenant_id,
  telemetry_type,
  count(*) AS event_count
FROM core.telemetry_events
GROUP BY 1, 2, 3
WITH NO DATA;

SELECT add_continuous_aggregate_policy('core.telemetry_hourly',
  start_offset    => INTERVAL '3 days',
  end_offset      => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour');

-- ── 6. Daily continuous aggregate ────────────────────────────────────────────
CREATE MATERIALIZED VIEW core.telemetry_daily
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 day', time) AS bucket,
  tenant_id,
  telemetry_type,
  count(*) AS event_count
FROM core.telemetry_events
GROUP BY 1, 2, 3
WITH NO DATA;

SELECT add_continuous_aggregate_policy('core.telemetry_daily',
  start_offset    => INTERVAL '14 days',
  end_offset      => INTERVAL '1 day',
  schedule_interval => INTERVAL '1 day');
