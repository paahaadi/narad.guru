"use client";

import { useEffect } from "react";
import type { InvestigationsWorkspaceData } from "@/lib/workspaces/investigations";
import { useInvestigationsStore } from "@/stores/investigations-store";
import { fetchInvestigations } from "@/lib/workspaces/investigations-client";
import { CaseDirectoryPanel } from "./case-directory-panel";
import { CaseDetail } from "./case-detail";
import { CaseIntegrityRail } from "./case-integrity-rail";

export function InvestigationsInteractiveWorkspace({ data }: { data: InvestigationsWorkspaceData }) {
  const hydrate = useInvestigationsStore((s) => s.hydrate);

  useEffect(() => {
    // Hydrate from SSR data first
    const initial = data.cases.map((c) => ({
      id: c.investigationId,
      title: c.title,
      description: c.description ?? null,
      status: c.status,
      classification: c.classification,
      confidence: c.confidence,
      hypothesis: null,
      ownerName: c.ownerName,
      ownerId: "",
      itemCount: c.itemCount,
      evidenceCount: c.evidenceCount,
      noteCount: c.noteCount,
      createdAt: c.updatedAt ?? new Date().toISOString(),
      updatedAt: c.updatedAt ?? new Date().toISOString(),
    }));
    hydrate(initial);

    // Then fetch fresh API data
    fetchInvestigations({ limit: 50 }).then((r) => {
      if (r.items.length > 0) hydrate(r.items);
    });
  }, [data.cases, hydrate]);

  return (
    <section className="workspace-screen">
      <div className="workspace-columns workspace-columns--three investigations-layout">
        <CaseDirectoryPanel />
        <CaseDetail />
        <CaseIntegrityRail />
      </div>
    </section>
  );
}
