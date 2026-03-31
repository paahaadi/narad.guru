"use client";

import { create } from "zustand";
import type { Watchlist, WatchlistAlert, WatchlistRule } from "@/lib/workspaces/watchlists";

type ActiveTab = "overview" | "alerts" | "rules" | "history";

type WatchlistsState = {
  watchlists: Watchlist[];
  selectedWatchlistId: string | null;
  activeTab: ActiveTab;
  alerts: WatchlistAlert[];
  rules: WatchlistRule[];
  alertFilter: { status?: string; severity?: string };
  isCreatingWatchlist: boolean;
  isCreatingRule: boolean;

  hydrate: (watchlists: Watchlist[]) => void;
  selectWatchlist: (watchlistId: string | null) => void;
  setActiveTab: (tab: ActiveTab) => void;
  setAlerts: (alerts: WatchlistAlert[]) => void;
  setRules: (rules: WatchlistRule[]) => void;
  setAlertFilter: (filter: { status?: string; severity?: string }) => void;
  addWatchlist: (watchlist: Watchlist) => void;
  addRule: (rule: WatchlistRule) => void;
  patchAlert: (alertId: string, patch: Partial<WatchlistAlert>) => void;
  setIsCreatingWatchlist: (v: boolean) => void;
  setIsCreatingRule: (v: boolean) => void;
};

export const useWatchlistsStore = create<WatchlistsState>((set) => ({
  watchlists: [],
  selectedWatchlistId: null,
  activeTab: "overview",
  alerts: [],
  rules: [],
  alertFilter: {},
  isCreatingWatchlist: false,
  isCreatingRule: false,

  hydrate: (watchlists) =>
    set({
      watchlists,
      selectedWatchlistId: watchlists[0]?.id ?? null,
    }),

  selectWatchlist: (selectedWatchlistId) =>
    set({ selectedWatchlistId, activeTab: "overview", alerts: [], rules: [] }),

  setActiveTab: (activeTab) => set({ activeTab }),

  setAlerts: (alerts) => set({ alerts }),

  setRules: (rules) => set({ rules }),

  setAlertFilter: (alertFilter) => set({ alertFilter }),

  addWatchlist: (watchlist) =>
    set((state) => ({
      watchlists: [watchlist, ...state.watchlists],
      selectedWatchlistId: watchlist.id,
      isCreatingWatchlist: false,
    })),

  addRule: (rule) =>
    set((state) => ({
      rules: [rule, ...state.rules],
      isCreatingRule: false,
    })),

  patchAlert: (alertId, patch) =>
    set((state) => ({
      alerts: state.alerts.map((a) =>
        a.id === alertId ? { ...a, ...patch } : a,
      ),
    })),

  setIsCreatingWatchlist: (isCreatingWatchlist) => set({ isCreatingWatchlist }),

  setIsCreatingRule: (isCreatingRule) => set({ isCreatingRule }),
}));
