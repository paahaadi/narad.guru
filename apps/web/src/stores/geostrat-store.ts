"use client";

import { create } from "zustand";
import type { GeoEventPoint, GeoLayerConfig, GeoStratKpis } from "@/lib/geostrat";

type GeoViewport = {
  longitude: number;
  latitude: number;
  zoom: number;
};

type ViewportBounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};

type GeoStratState = {
  kpis: GeoStratKpis | null;
  layers: GeoLayerConfig[];
  events: GeoEventPoint[];
  selectedEventId: string | null;
  viewport: GeoViewport;
  viewportBounds: ViewportBounds | null;
  hydrate: (payload: { kpis: GeoStratKpis; layers: GeoLayerConfig[]; events: GeoEventPoint[] }) => void;
  selectEvent: (eventId: string | null) => void;
  setViewport: (viewport: Partial<GeoViewport>) => void;
  setViewportBounds: (bounds: ViewportBounds) => void;
  patchEvent: (eventId: string, patch: Partial<GeoEventPoint>) => void;
  upsertEvent: (event: GeoEventPoint) => void;
  replaceEvents: (events: GeoEventPoint[]) => void;
  replaceKpis: (kpis: GeoStratKpis) => void;
};

export const useGeoStratStore = create<GeoStratState>((set) => ({
  kpis: null,
  layers: [],
  events: [],
  selectedEventId: null,
  viewport: {
    longitude: 78.9629,
    latitude: 22.5937,
    zoom: 4.2,
  },
  viewportBounds: null,
  hydrate: ({ kpis, layers, events }) =>
    set({
      kpis,
      layers,
      events,
      selectedEventId: events[0]?.eventId ?? null,
    }),
  selectEvent: (selectedEventId) => set({ selectedEventId }),
  setViewport: (viewport) =>
    set((state) => ({
      viewport: {
        ...state.viewport,
        ...viewport,
      },
    })),
  setViewportBounds: (viewportBounds) => set({ viewportBounds }),
  patchEvent: (eventId, patch) =>
    set((state) => ({
      events: state.events.map((event) =>
        event.eventId === eventId ? { ...event, ...patch, eventId } : event,
      ),
    })),
  upsertEvent: (newEvent) =>
    set((state) => {
      const exists = state.events.some((e) => e.eventId === newEvent.eventId);
      if (exists) {
        return {
          events: state.events.map((e) => (e.eventId === newEvent.eventId ? { ...e, ...newEvent } : e)),
        };
      }
      return {
        events: [newEvent, ...state.events].slice(0, 500), // Keep a reasonable cap
      };
    }),
  replaceEvents: (events) =>
    set((state) => {
      const nextSelected =
        state.selectedEventId && events.some((event) => event.eventId === state.selectedEventId)
          ? state.selectedEventId
          : events[0]?.eventId ?? null;

      return {
        events,
        selectedEventId: nextSelected,
      };
    }),
  replaceKpis: (kpis) => set({ kpis }),
}));
