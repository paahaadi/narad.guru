"use client";

import { create } from "zustand";
import type { PulseboardCard, PulseboardEventDetail } from "@/lib/pulseboard";

type PulseboardState = {
  items: PulseboardCard[];
  details: Record<string, PulseboardEventDetail>;
  selectedEventId: string | null;
  hydrate: (items: PulseboardCard[], detail: PulseboardEventDetail | null) => void;
  selectEvent: (eventId: string) => void;
  upsertDetail: (detail: PulseboardEventDetail) => void;
  patchCard: (eventId: string, cardPatch: Partial<PulseboardCard>) => void;
};

const severityRank: Record<PulseboardCard["severity"], number> = {
  critical: 1,
  high: 2,
  medium: 3,
  low: 4,
  informational: 5,
};

function sortCards(items: PulseboardCard[]) {
  return [...items].sort((left, right) => {
    const severityDelta = severityRank[left.severity] - severityRank[right.severity];
    if (severityDelta !== 0) {
      return severityDelta;
    }

    return new Date(right.eventTimestamp).getTime() - new Date(left.eventTimestamp).getTime();
  });
}

export const usePulseboardStore = create<PulseboardState>((set) => ({
  items: [],
  details: {},
  selectedEventId: null,
  hydrate: (items, detail) =>
    set(() => ({
      items: sortCards(items),
      details: detail ? { [detail.eventId]: detail } : {},
      selectedEventId: detail?.eventId ?? items[0]?.eventId ?? null,
    })),
  selectEvent: (selectedEventId) => set({ selectedEventId }),
  upsertDetail: (detail) =>
    set((state) => ({
      details: {
        ...state.details,
        [detail.eventId]: detail,
      },
    })),
  patchCard: (eventId, cardPatch) =>
    set((state) => {
      const items = state.items.some((item) => item.eventId === eventId)
        ? state.items.map((item) =>
            item.eventId === eventId ? { ...item, ...cardPatch, eventId } : item,
          )
        : sortCards([
            ...state.items,
            {
              eventId,
              title: "Emerging event",
              summary: "Awaiting synthesized capsule.",
              severity: "medium",
              confidence: 0,
              sourceTrustTier: 1,
              sourceCount: 1,
              placeLabel: null,
              eventTimestamp: new Date().toISOString(),
              linkedEntities: [],
              ...cardPatch,
            },
          ]);

      const detail = state.details[eventId]
        ? {
            ...state.details[eventId],
            ...cardPatch,
          }
        : undefined;

      return {
        items: sortCards(items),
        details: detail
          ? {
              ...state.details,
              [eventId]: detail,
            }
          : state.details,
      };
    }),
}));
