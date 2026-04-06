"use client";

import { create } from "zustand";
import type { BriefingSummary, BriefingVersion, BriefingSection } from "@/lib/workspaces/briefings";

type ActiveTab = "editorial" | "versions" | "lineage";

type BriefingsState = {
  briefings: BriefingSummary[];
  selectedBriefingId: string | null;
  activeTab: ActiveTab;
  versions: BriefingVersion[];
  editingSections: BriefingSection[];
  isDirty: boolean;
  statusFilter: string | null;
  isCreatingBriefing: boolean;
  isSavingVersion: boolean;

  hydrate: (briefings: BriefingSummary[]) => void;
  selectBriefing: (briefingId: string | null) => void;
  setActiveTab: (tab: ActiveTab) => void;
  setVersions: (versions: BriefingVersion[]) => void;
  setEditingSections: (sections: BriefingSection[]) => void;
  markDirty: () => void;
  markClean: () => void;
  setStatusFilter: (status: string | null) => void;
  addBriefing: (briefing: BriefingSummary) => void;
  addVersion: (version: BriefingVersion) => void;
  patchBriefing: (briefingId: string, patch: Partial<BriefingSummary>) => void;
  setIsCreatingBriefing: (v: boolean) => void;
  setIsSavingVersion: (v: boolean) => void;
};

export const useBriefingsStore = create<BriefingsState>((set) => ({
  briefings: [],
  selectedBriefingId: null,
  activeTab: "editorial",
  versions: [],
  editingSections: [],
  isDirty: false,
  statusFilter: null,
  isCreatingBriefing: false,
  isSavingVersion: false,

  hydrate: (briefings) =>
    set({
      briefings,
      selectedBriefingId: briefings[0]?.id ?? null,
    }),

  selectBriefing: (selectedBriefingId) =>
    set({
      selectedBriefingId,
      activeTab: "editorial",
      versions: [],
      editingSections: [],
      isDirty: false,
    }),

  setActiveTab: (activeTab) => set({ activeTab }),
  setVersions: (versions) => set({ versions }),

  setEditingSections: (editingSections) => set({ editingSections }),
  markDirty: () => set({ isDirty: true }),
  markClean: () => set({ isDirty: false }),
  setStatusFilter: (statusFilter) => set({ statusFilter }),

  addBriefing: (briefing) =>
    set((state) => ({
      briefings: [briefing, ...state.briefings],
      selectedBriefingId: briefing.id,
      isCreatingBriefing: false,
    })),

  addVersion: (version) =>
    set((state) => ({
      versions: [version, ...state.versions],
      editingSections: version.sections,
      isDirty: false,
      isSavingVersion: false,
    })),

  patchBriefing: (briefingId, patch) =>
    set((state) => ({
      briefings: state.briefings.map((b) => (b.id === briefingId ? { ...b, ...patch } : b)),
    })),

  setIsCreatingBriefing: (isCreatingBriefing) => set({ isCreatingBriefing }),
  setIsSavingVersion: (isSavingVersion) => set({ isSavingVersion }),
}));
