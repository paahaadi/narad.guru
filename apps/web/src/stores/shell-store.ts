"use client";

import { create } from "zustand";

type ShellState = {
  commandQuery: string;
  liveLatencyMs: number;
  setCommandQuery: (value: string) => void;
  setLiveLatencyMs: (value: number) => void;
};

export const useShellStore = create<ShellState>((set) => ({
  commandQuery: "",
  liveLatencyMs: 14,
  setCommandQuery: (commandQuery) => set({ commandQuery }),
  setLiveLatencyMs: (liveLatencyMs) => set({ liveLatencyMs }),
}));
