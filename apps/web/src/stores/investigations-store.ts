"use client";

import { create } from "zustand";
import type {
  InvestigationSummary,
  InvestigationItem,
  EvidenceRecord,
  InvestigationNote,
  CustodyEntry,
} from "@/lib/workspaces/investigations";

type ActiveTab = "overview" | "items" | "evidence" | "notes" | "timeline";

type InvestigationsState = {
  cases: InvestigationSummary[];
  selectedCaseId: string | null;
  activeTab: ActiveTab;
  items: InvestigationItem[];
  evidence: EvidenceRecord[];
  notes: InvestigationNote[];
  custodyLog: CustodyEntry[];
  statusFilter: string | null;
  isCreatingCase: boolean;
  isAttachingItem: boolean;
  isAttachingEvidence: boolean;
  isWritingNote: boolean;

  hydrate: (cases: InvestigationSummary[]) => void;
  selectCase: (caseId: string | null) => void;
  setActiveTab: (tab: ActiveTab) => void;
  setItems: (items: InvestigationItem[]) => void;
  setEvidence: (evidence: EvidenceRecord[]) => void;
  setNotes: (notes: InvestigationNote[]) => void;
  setCustodyLog: (entries: CustodyEntry[]) => void;
  setStatusFilter: (status: string | null) => void;
  addCase: (c: InvestigationSummary) => void;
  addItem: (item: InvestigationItem) => void;
  addEvidence: (evidence: EvidenceRecord) => void;
  addNote: (note: InvestigationNote) => void;
  patchCase: (caseId: string, patch: Partial<InvestigationSummary>) => void;
  patchEvidence: (evidenceId: string, patch: Partial<EvidenceRecord>) => void;
  setIsCreatingCase: (v: boolean) => void;
  setIsAttachingItem: (v: boolean) => void;
  setIsAttachingEvidence: (v: boolean) => void;
  setIsWritingNote: (v: boolean) => void;
};

export const useInvestigationsStore = create<InvestigationsState>((set) => ({
  cases: [],
  selectedCaseId: null,
  activeTab: "overview",
  items: [],
  evidence: [],
  notes: [],
  custodyLog: [],
  statusFilter: null,
  isCreatingCase: false,
  isAttachingItem: false,
  isAttachingEvidence: false,
  isWritingNote: false,

  hydrate: (cases) =>
    set({
      cases,
      selectedCaseId: cases[0]?.id ?? null,
    }),

  selectCase: (selectedCaseId) =>
    set({ selectedCaseId, activeTab: "overview", items: [], evidence: [], notes: [], custodyLog: [] }),

  setActiveTab: (activeTab) => set({ activeTab }),
  setItems: (items) => set({ items }),
  setEvidence: (evidence) => set({ evidence }),
  setNotes: (notes) => set({ notes }),
  setCustodyLog: (custodyLog) => set({ custodyLog }),
  setStatusFilter: (statusFilter) => set({ statusFilter }),

  addCase: (c) =>
    set((state) => ({
      cases: [c, ...state.cases],
      selectedCaseId: c.id,
      isCreatingCase: false,
    })),

  addItem: (item) =>
    set((state) => ({
      items: [item, ...state.items],
      isAttachingItem: false,
    })),

  addEvidence: (evidence) =>
    set((state) => ({
      evidence: [evidence, ...state.evidence],
      isAttachingEvidence: false,
    })),

  addNote: (note) =>
    set((state) => ({
      notes: [note, ...state.notes],
      isWritingNote: false,
    })),

  patchCase: (caseId, patch) =>
    set((state) => ({
      cases: state.cases.map((c) => (c.id === caseId ? { ...c, ...patch } : c)),
    })),

  patchEvidence: (evidenceId, patch) =>
    set((state) => ({
      evidence: state.evidence.map((e) => (e.id === evidenceId ? { ...e, ...patch } : e)),
    })),

  setIsCreatingCase: (isCreatingCase) => set({ isCreatingCase }),
  setIsAttachingItem: (isAttachingItem) => set({ isAttachingItem }),
  setIsAttachingEvidence: (isAttachingEvidence) => set({ isAttachingEvidence }),
  setIsWritingNote: (isWritingNote) => set({ isWritingNote }),
}));
