"use client";

import { create } from "zustand";

type ShellState = {
  commandQuery: string;
  liveLatencyMs: number;
  isAskNaradOpen: boolean;
  setCommandQuery: (value: string) => void;
  setLiveLatencyMs: (value: number) => void;
  setAskNaradOpen: (value: boolean) => void;
};

export const useShellStore = create<ShellState>((set) => ({
  commandQuery: "",
  liveLatencyMs: 14,
  isAskNaradOpen: false,
  setCommandQuery: (commandQuery) => set({ commandQuery }),
  setLiveLatencyMs: (liveLatencyMs) => set({ liveLatencyMs }),
  setAskNaradOpen: (isAskNaradOpen) => set({ isAskNaradOpen }),
}));
