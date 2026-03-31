"use client";

import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import type maplibregl from "maplibre-gl";
import type { GeoEventPoint, GeoLayerConfig, GeoStratKpis } from "@/lib/geostrat";
import { useGeoStratStore } from "@/stores/geostrat-store";

type GeoStratWorkspaceProps = {
  initialKpis: GeoStratKpis;
  initialLayers: GeoLayerConfig[];
  initialEvents: GeoEventPoint[];
};

type GeoStratMapCanvasProps = {
  initialLayers: GeoLayerConfig[];
  initialEvents: GeoEventPoint[];
};

type MapLibreModule = typeof import("maplibre-gl");
type DeckMapboxModule = typeof import("@deck.gl/mapbox");
type DeckLayersModule = typeof import("@deck.gl/layers");
type MapboxOverlayInstance = InstanceType<DeckMapboxModule["MapboxOverlay"]>;

function severityColor(severity: GeoEventPoint["severity"]) {
  switch (severity) {
    case "critical":
      return "#ee7d77";
    case "high":
      return "#ec7609";
    case "medium":
      return "#8ce7ff";
    case "low":
      return "#7dd3a4";
    default:
      return "#6c758c";
  }
}

function severityRgba(severity: GeoEventPoint["severity"], alpha = 220) {
  switch (severity) {
    case "critical":
      return [238, 125, 119, alpha] as const;
    case "high":
      return [236, 118, 9, alpha] as const;
    case "medium":
      return [140, 231, 255, alpha] as const;
    case "low":
      return [125, 211, 164, alpha] as const;
    default:
      return [108, 117, 140, alpha] as const;
  }
}

async function fetchGeoStratEvents() {
  const response = await fetch("/api/geostrat/events?limit=180", {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Unable to refresh GeoStrat events");
  }

  return (await response.json()) as GeoEventPoint[];
}

async function fetchGeoStratKpis() {
  const response = await fetch("/api/geostrat/kpis", {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Unable to refresh GeoStrat KPIs");
  }

  return (await response.json()) as GeoStratKpis;
}

function readSessionCookie(name = "narad_session") {
  if (typeof document === "undefined") {
    return null;
  }

  const pair = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((entry) => entry.startsWith(`${name}=`));

  return pair ? decodeURIComponent(pair.slice(name.length + 1)) : null;
}

function GeoStratMapCanvas({ initialLayers, initialEvents }: GeoStratMapCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayRef = useRef<MapboxOverlayInstance | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const events = useGeoStratStore((state) => state.events);
  const layers = useGeoStratStore((state) => state.layers);
  const viewport = useGeoStratStore((state) => state.viewport);
  const selectedEventId = useGeoStratStore((state) => state.selectedEventId);
  const selectEvent = useGeoStratStore((state) => state.selectEvent);
  const setViewport = useGeoStratStore((state) => state.setViewport);
  const eventsLayer = useMemo(
    () => layers.find((layer) => layer.slug === "events") ?? null,
    [layers],
  );
  const eventTileTemplate =
    eventsLayer?.tileUrlTemplate ?? "/api/geostrat/tiles/events/{z}/{x}/{y}.mvt";
  const selectedEvent = useMemo(
    () => events.find((event) => event.eventId === selectedEventId) ?? null,
    [events, selectedEventId],
  );
  const initialEventsLayer = useMemo(
    () => initialLayers.find((layer) => layer.slug === "events") ?? null,
    [initialLayers],
  );
  const initialViewportRef = useRef(viewport);
  const initialTileTemplateRef = useRef(
    initialEventsLayer?.tileUrlTemplate ?? eventTileTemplate,
  );
  const initialLayerConfigRef = useRef({
    minZoom: initialEventsLayer?.minZoom ?? eventsLayer?.minZoom ?? 3,
    maxZoom: initialEventsLayer?.maxZoom ?? eventsLayer?.maxZoom ?? 12,
  });
  const initialEventsRef = useRef(initialEvents.length > 0 ? initialEvents : events);
  const selectedEventIdRef = useRef(selectedEventId);

  useEffect(() => {
    selectedEventIdRef.current = selectedEventId;
  }, [selectedEventId]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    let disposed = false;

    async function initialise() {
      try {
        const [module, deckMapbox, deckLayers] = (await Promise.all([
          import("maplibre-gl"),
          import("@deck.gl/mapbox"),
          import("@deck.gl/layers"),
        ])) as [MapLibreModule, DeckMapboxModule, DeckLayersModule];
        if (disposed || !containerRef.current) {
          return;
        }

        const map = new module.Map({
          container: containerRef.current,
          style: process.env.NEXT_PUBLIC_MAP_STYLE_URL || "https://demotiles.maplibre.org/style.json",
          center: [initialViewportRef.current.longitude, initialViewportRef.current.latitude],
          zoom: initialViewportRef.current.zoom,
          attributionControl: false,
        });

        map.addControl(new module.NavigationControl({ visualizePitch: true }), "bottom-right");

        map.on("load", () => {
          if (!map.getSource("events-tiles")) {
            map.addSource("events-tiles", {
              type: "vector",
              tiles: [initialTileTemplateRef.current],
              minzoom: initialLayerConfigRef.current.minZoom,
              maxzoom: initialLayerConfigRef.current.maxZoom,
            });
          }

          map.addLayer({
            id: "events-pulse",
            type: "circle",
            source: "events-tiles",
            "source-layer": "events",
            paint: {
              "circle-radius": [
                "match",
                ["get", "severity"],
                "critical",
                11,
                "high",
                9,
                "medium",
                7,
                5,
              ],
              "circle-color": [
                "match",
                ["get", "severity"],
                "critical",
                "#ee7d77",
                "high",
                "#ec7609",
                "medium",
                "#8ce7ff",
                "low",
                "#7dd3a4",
                "#6c758c",
              ],
              "circle-opacity": 0.84,
              "circle-stroke-color": "#dce5ff",
              "circle-stroke-width": 1.4,
            },
          });

          const overlay = new deckMapbox.MapboxOverlay({
            interleaved: true,
            layers: [
              new deckLayers.ScatterplotLayer<GeoEventPoint>({
                id: "events-live-overlay",
                data: initialEventsRef.current,
                pickable: false,
                stroked: true,
                filled: true,
                radiusUnits: "meters",
                radiusScale: 1,
                radiusMinPixels: 5,
                lineWidthMinPixels: 2,
                getPosition: (event) => [event.longitude, event.latitude],
                getRadius: (event) =>
                  event.eventId === selectedEventIdRef.current ? 18_000 : 9_000,
                getFillColor: (event) =>
                  event.eventId === selectedEventIdRef.current
                    ? [...severityRgba(event.severity, 70)]
                    : [12, 16, 26, 0],
                getLineColor: (event) =>
                  event.eventId === selectedEventIdRef.current
                    ? [...severityRgba(event.severity)]
                    : [...severityRgba(event.severity, 180)],
              }),
            ],
          });

          map.addControl(overlay);
          overlayRef.current = overlay;

          map.on("click", "events-pulse", (event) => {
            const candidate = event.features?.[0]?.properties?.id;
            if (typeof candidate === "string" || typeof candidate === "number") {
              selectEvent(String(candidate));
            }
          });

          map.on("mouseenter", "events-pulse", () => {
            map.getCanvas().style.cursor = "pointer";
          });

          map.on("mouseleave", "events-pulse", () => {
            map.getCanvas().style.cursor = "";
          });
        });

        map.on("moveend", () => {
          const center = map.getCenter();
          setViewport({
            longitude: Number(center.lng.toFixed(4)),
            latitude: Number(center.lat.toFixed(4)),
            zoom: Number(map.getZoom().toFixed(2)),
          });
        });

        mapRef.current = map;
      } catch (error) {
        setMapError(error instanceof Error ? error.message : "Unable to initialise map.");
      }
    }

    void initialise();

    return () => {
      disposed = true;
      if (mapRef.current && overlayRef.current) {
        mapRef.current.removeControl(overlayRef.current as never);
      }
      overlayRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [selectEvent, setViewport]);

  useEffect(() => {
    if (!overlayRef.current) {
      return;
    }

    void (async () => {
      const [{ ScatterplotLayer }] = (await Promise.all([
        import("@deck.gl/layers"),
      ])) as [DeckLayersModule];

      overlayRef.current?.setProps({
        layers: [
          new ScatterplotLayer<GeoEventPoint>({
            id: "events-live-overlay",
            data: events,
            pickable: false,
            stroked: true,
            filled: true,
            radiusUnits: "meters",
            radiusScale: 1,
            radiusMinPixels: 5,
            lineWidthMinPixels: 2,
            getPosition: (event) => [event.longitude, event.latitude],
            getRadius: (event) => (event.eventId === selectedEventId ? 18_000 : 9_000),
            getFillColor: (event) =>
              event.eventId === selectedEventId
                ? [...severityRgba(event.severity, 70)]
                : [12, 16, 26, 0],
            getLineColor: (event) =>
              event.eventId === selectedEventId
                ? [...severityRgba(event.severity)]
                : [...severityRgba(event.severity, 180)],
          }),
        ],
      });
    })();
  }, [events, selectedEventId]);

  useEffect(() => {
    if (!selectedEvent) {
      return;
    }

    if (!mapRef.current) {
      return;
    }

    mapRef.current.flyTo({
      center: [selectedEvent.longitude, selectedEvent.latitude],
      zoom: Math.max(mapRef.current.getZoom(), 6.4),
      essential: true,
      duration: 900,
    });
  }, [selectedEvent]);

  return (
    <div className="map-stage">
      <div className="map-stage__texture" />
      <div ref={containerRef} className="map-stage__canvas" />
      {mapError ? (
        <div className="map-stage__fallback">
          <p className="eyebrow">Map bootstrap error</p>
          <p>{mapError}</p>
        </div>
      ) : null}
    </div>
  );
}

export function GeoStratWorkspace({
  initialKpis,
  initialLayers,
  initialEvents,
}: GeoStratWorkspaceProps) {
  const hydrate = useGeoStratStore((state) => state.hydrate);
  const layers = useGeoStratStore((state) => state.layers);
  const events = useGeoStratStore((state) => state.events);
  const selectedEventId = useGeoStratStore((state) => state.selectedEventId);
  const selectEvent = useGeoStratStore((state) => state.selectEvent);
  const kpis = useGeoStratStore((state) => state.kpis);
  const replaceEvents = useGeoStratStore((state) => state.replaceEvents);
  const replaceKpis = useGeoStratStore((state) => state.replaceKpis);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    hydrate({
      kpis: initialKpis,
      layers: initialLayers,
      events: initialEvents,
    });
  }, [hydrate, initialEvents, initialKpis, initialLayers]);

  useEffect(() => {
    const gatewayUrl =
      process.env.NEXT_PUBLIC_GATEWAY_WS_URL?.trim() || process.env.NEXT_PUBLIC_WS_URL?.trim();
    const token = readSessionCookie(
      process.env.NEXT_PUBLIC_APP_AUTH_COOKIE_NAME?.trim() || "narad_session",
    );

    if (!gatewayUrl || !token) {
      return;
    }

    const refreshGeoStrat = () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }

      refreshTimerRef.current = setTimeout(() => {
        startTransition(() => {
          void Promise.all([fetchGeoStratEvents(), fetchGeoStratKpis()])
            .then(([nextEvents, nextKpis]) => {
              replaceEvents(nextEvents);
              replaceKpis(nextKpis);
            })
            .catch(() => undefined);
        });
      }, 400);
    };

    const socket = new WebSocket(`${gatewayUrl}?token=${encodeURIComponent(token)}`);

    socket.addEventListener("open", () => {
      socket.send(
        JSON.stringify({
          channels: ["narad:pulseboard:event"],
        }),
      );
    });

    socket.addEventListener("message", (event) => {
      try {
        const parsed = JSON.parse(event.data) as {
          type?: string;
          payload?: {
            entity_type?: string;
          };
        };

        if (parsed.type !== "delta" || parsed.payload?.entity_type !== "event") {
          return;
        }

        refreshGeoStrat();
      } catch {
        return;
      }
    });

    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
      socket.close();
    };
  }, [replaceEvents, replaceKpis]);

  const selectedEvent = events.find((event) => event.eventId === selectedEventId) ?? events[0] ?? null;

  return (
    <section className="workspace-screen geostrat-screen">
      <div className="metric-strip">
        <article className="metric-card">
          <span className="metric-card__label">Active Events</span>
          <strong className="metric-card__value accent-orange">{kpis?.activeEvents ?? 0}</strong>
        </article>
        <article className="metric-card">
          <span className="metric-card__label">Critical Alerts</span>
          <strong className="metric-card__value accent-red">{kpis?.criticalAlerts ?? 0}</strong>
        </article>
        <article className="metric-card">
          <span className="metric-card__label">Risk Districts</span>
          <strong className="metric-card__value">{kpis?.riskDistricts ?? 0}</strong>
        </article>
        <article className="metric-card">
          <span className="metric-card__label">Corporate Pressure</span>
          <strong className="metric-card__value">{kpis?.corporatePressure ?? "low"}</strong>
        </article>
        <article className="metric-card">
          <span className="metric-card__label">Mapped Events</span>
          <strong className="metric-card__value accent-cyan">{kpis?.mappedEvents ?? 0}</strong>
        </article>
      </div>

      <div className="geostrat-layout">
        <aside className="map-control-rail panel panel--muted">
          <p className="eyebrow">Command Filters</p>
          <div className="map-control-rail__stack">
            {layers.map((layer) => (
              <button key={layer.id} type="button" className="map-tool">
                <span className="material-symbols-outlined">layers</span>
                <div>
                  <strong>{layer.name}</strong>
                  <span>{layer.layerType}</span>
                </div>
              </button>
            ))}
          </div>
        </aside>

        <div className="geostrat-layout__map">
          <GeoStratMapCanvas initialLayers={initialLayers} initialEvents={initialEvents} />

          <div className="map-overlay-card panel panel--glass">
            <p className="eyebrow">Operational Posture</p>
            <h2 className="hero-title">Strategic command map</h2>
            <p className="hero-copy">
              GeoStrat now reads live event density, configured layers, and KPI posture from the
              app plane instead of static prototype content.
            </p>
          </div>

          <div className="map-status-strip panel panel--glass">
            <div>
              <span className="metric-card__label">Tracked layers</span>
              <strong className="metric-card__value">{layers.length}</strong>
            </div>
            <div>
              <span className="metric-card__label">Viewport events</span>
              <strong className="metric-card__value">{events.length}</strong>
            </div>
            <div>
              <span className="metric-card__label">Update cadence</span>
              <strong className="metric-card__value">30s</strong>
            </div>
          </div>
        </div>

        <aside className="panel geostrat-layout__rail">
          <div className="section-heading">
            <p className="eyebrow">District Rail</p>
            <h2>{selectedEvent ? selectedEvent.title : "Awaiting signal"}</h2>
          </div>

          {selectedEvent ? (
            <>
              <div className="data-grid">
                <div className="data-point">
                  <span>Severity</span>
                  <strong>{selectedEvent.severity}</strong>
                </div>
                <div className="data-point">
                  <span>Confidence</span>
                  <strong>{Math.round(selectedEvent.confidence * 100)}%</strong>
                </div>
                <div className="data-point">
                  <span>Location</span>
                  <strong>
                    {selectedEvent.districtCode ?? "Unknown"}
                    {selectedEvent.stateCode ? `, ${selectedEvent.stateCode}` : ""}
                  </strong>
                </div>
                <div className="data-point">
                  <span>Timestamp</span>
                  <strong>{new Date(selectedEvent.occurredAt).toLocaleString()}</strong>
                </div>
              </div>

              <div className="list-stack">
                {events.slice(0, 6).map((event) => (
                  <button
                    key={event.eventId}
                    type="button"
                    className={`feed-card${event.eventId === selectedEvent.eventId ? " is-active" : ""}`}
                    onClick={() => selectEvent(event.eventId)}
                  >
                    <div className="feed-card__meta">
                      <span className={`pill pill--${event.severity}`}>{event.severity}</span>
                      <span>{new Date(event.occurredAt).toLocaleTimeString()}</span>
                    </div>
                    <strong>{event.title}</strong>
                    <p>
                      {event.districtCode ?? "Unknown district"}
                      {event.stateCode ? `, ${event.stateCode}` : ""}
                    </p>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="empty-surface">No mapped events are available for the current tenant.</div>
          )}
        </aside>
      </div>
    </section>
  );
}
