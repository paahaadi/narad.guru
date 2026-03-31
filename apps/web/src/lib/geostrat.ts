import { withTenant } from "@/lib/db";

export type GeoStratKpis = {
  activeEvents: number;
  criticalAlerts: number;
  riskDistricts: number;
  corporatePressure: "low" | "medium" | "high";
  mappedEvents: number;
};

export type GeoLayerConfig = {
  id: string;
  name: string;
  slug: string;
  layerType: string;
  presets: string[];
  minZoom: number;
  maxZoom: number;
  refreshIntervalSeconds: number | null;
  styleConfig: Record<string, unknown>;
  tileUrlTemplate: string | null;
};

export type GeoEventPoint = {
  eventId: string;
  title: string;
  eventType: string;
  severity: "critical" | "high" | "medium" | "low" | "informational";
  confidence: number;
  occurredAt: string;
  stateCode: string | null;
  districtCode: string | null;
  longitude: number;
  latitude: number;
};

export async function getGeoStratKpis(tenantId: string) {
  return withTenant(tenantId, async (client) => {
    const result = await client.query<{
      active_events: string | number;
      critical_alerts: string | number;
      risk_districts: string | number;
      corporate_events: string | number;
      mapped_events: string | number;
    }>(
      `
        SELECT
          COUNT(*) AS active_events,
          COUNT(*) FILTER (WHERE severity = 'critical') AS critical_alerts,
          COUNT(DISTINCT CONCAT_WS(':', state_code, district_code))
            FILTER (WHERE severity IN ('critical', 'high')) AS risk_districts,
          COUNT(*) FILTER (WHERE event_type = 'corporate') AS corporate_events,
          COUNT(*) AS mapped_events
        FROM projections.geostrat_events
        WHERE tenant_id = $1
      `,
      [tenantId],
    );

    const row = result.rows[0];
    const corporateEvents = Number(row?.corporate_events ?? 0);

    return {
      activeEvents: Number(row?.active_events ?? 0),
      criticalAlerts: Number(row?.critical_alerts ?? 0),
      riskDistricts: Number(row?.risk_districts ?? 0),
      corporatePressure:
        corporateEvents >= 20 ? "high" : corporateEvents >= 8 ? "medium" : "low",
      mappedEvents: Number(row?.mapped_events ?? 0),
    } satisfies GeoStratKpis;
  });
}

export async function listGeoLayers(tenantId: string) {
  return withTenant(tenantId, async (client) => {
    const result = await client.query<{
      id: string;
      name: string;
      slug: string;
      layer_type: string;
      presets: string[];
      min_zoom: number | null;
      max_zoom: number | null;
      refresh_interval_seconds: number | null;
      style_config: Record<string, unknown>;
      tile_url_template: string | null;
    }>(
      `
        SELECT
          id::text,
          name,
          slug,
          layer_type,
          presets,
          min_zoom,
          max_zoom,
          refresh_interval_seconds,
          style_config,
          tile_url_template
        FROM geo_intelligence.layer_configs
        WHERE tenant_id = $1
          AND is_active = TRUE
        ORDER BY name ASC
      `,
      [tenantId],
    );

    if (result.rows.length === 0) {
      return [
        {
          id: "builtin-events",
          name: "Event Density",
          slug: "events",
          layerType: "point",
          presets: ["critical", "high", "movement"],
          minZoom: 3,
          maxZoom: 12,
          refreshIntervalSeconds: 30,
          styleConfig: {
            color: "severity",
            emphasis: "critical",
          },
          tileUrlTemplate: "/api/geostrat/tiles/events/{z}/{x}/{y}.mvt",
        },
      ] satisfies GeoLayerConfig[];
    }

    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      layerType: row.layer_type,
      presets: row.presets,
      minZoom: row.min_zoom ?? 0,
      maxZoom: row.max_zoom ?? 18,
      refreshIntervalSeconds: row.refresh_interval_seconds,
      styleConfig: row.style_config ?? {},
      tileUrlTemplate: row.tile_url_template,
    })) satisfies GeoLayerConfig[];
  });
}

export async function listGeoEvents(tenantId: string, options?: { bbox?: string | null; limit?: number }) {
  const limit = Math.min(Math.max(options?.limit ?? 200, 25), 600);
  const bbox = options?.bbox?.split(",").map((value) => Number(value.trim())) ?? [];
  const hasBbox = bbox.length === 4 && bbox.every((value) => Number.isFinite(value));

  return withTenant(tenantId, async (client) => {
    const result = await client.query<{
      event_id: string;
      title: string;
      event_type: string;
      severity: GeoEventPoint["severity"];
      confidence: number | string;
      occurred_at: Date;
      state_code: string | null;
      district_code: string | null;
      longitude: number;
      latitude: number;
    }>(
      `
        SELECT
          ge.event_id::text AS event_id,
          ge.title,
          ge.event_type,
          ge.severity,
          ge.confidence,
          ge.occurred_at,
          ge.state_code,
          ge.district_code,
          ST_X(ge.geometry) AS longitude,
          ST_Y(ge.geometry) AS latitude
        FROM projections.geostrat_events AS ge
        WHERE ge.tenant_id = $1
          AND (
            $2::boolean = FALSE OR
            ST_Intersects(
              ge.geometry,
              ST_MakeEnvelope($3, $4, $5, $6, 4326)
            )
          )
        ORDER BY ge.occurred_at DESC
        LIMIT $7
      `,
      [
        tenantId,
        hasBbox,
        hasBbox ? bbox[0] : 0,
        hasBbox ? bbox[1] : 0,
        hasBbox ? bbox[2] : 0,
        hasBbox ? bbox[3] : 0,
        limit,
      ],
    );

    return result.rows.map((row) => ({
      eventId: row.event_id,
      title: row.title,
      eventType: row.event_type,
      severity: row.severity,
      confidence: Number(row.confidence),
      occurredAt: row.occurred_at.toISOString(),
      stateCode: row.state_code,
      districtCode: row.district_code,
      longitude: Number(row.longitude),
      latitude: Number(row.latitude),
    })) satisfies GeoEventPoint[];
  });
}

export async function renderEventTile(tenantId: string, z: number, x: number, y: number) {
  return withTenant(tenantId, async (client) => {
    const result = await client.query<{ tile: Buffer | null }>(
      `
        WITH bounds AS (
          SELECT ST_TileEnvelope($2, $3, $4) AS tile_geom
        ),
        features AS (
          SELECT
            ge.event_id AS id,
            ge.title,
            ge.event_type,
            ge.severity,
            ge.confidence,
            ST_AsMVTGeom(ge.geometry, bounds.tile_geom, 4096, 64, TRUE) AS geom
          FROM projections.geostrat_events AS ge
          CROSS JOIN bounds
          WHERE ge.tenant_id = $1
            AND ST_Intersects(ge.geometry, bounds.tile_geom)
        )
        SELECT ST_AsMVT(features, 'events', 4096, 'geom') AS tile
        FROM features
      `,
      [tenantId, z, x, y],
    );

    return result.rows[0]?.tile ?? Buffer.alloc(0);
  });
}
