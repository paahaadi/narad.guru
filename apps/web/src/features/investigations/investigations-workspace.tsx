"use client";

import { useEffect } from "react";
import type { InvestigationsWorkspaceData } from "@/lib/workspaces/investigations";
import { useInvestigationsStore } from "@/stores/investigations-store";
import { fetchInvestigations } from "@/lib/workspaces/investigations-client";
import { CaseDirectoryPanel } from "./case-directory-panel";
import { CaseDetail } from "./case-detail";
import { CaseIntegrityRail } from "./case-integrity-rail";

function readSessionCookie(name = "narad_session") {
  if (typeof document === "undefined") return null;
  const pair = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((entry) => entry.startsWith(`${name}=`));
  return pair ? decodeURIComponent(pair.slice(name.length + 1)) : null;
}

function TickerStrip({ cases }: { cases: any[] }) {
  const tickerItems = [...cases]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 10);

  return (
    <aside className="ticker-strip">
      <div className="ticker-strip__label">Case Signals</div>
      <div className="ticker-strip__container">
        <div className="ticker-strip__content">
          {tickerItems.map((c) => (
            <div key={c.id} className="ticker-item">
              <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>
                {c.status === "active" ? "running_with_errors" : "history_edu"}
              </span>
              <span>{c.title}</span>
              <span style={{ opacity: 0.5 }}>•</span>
              <span className={`ticker-item--${c.classification === "secret" ? "critical" : "normal"}`}>
                {c.classification.toUpperCase()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

export function InvestigationsInteractiveWorkspace({ data }: { data: InvestigationsWorkspaceData }) {
  const hydrate = useInvestigationsStore((s) => s.hydrate);
  const cases = useInvestigationsStore((s) => s.cases);

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

    const refresh = () => {
      fetchInvestigations({ limit: 50 }).then((r) => {
        if (r.items.length > 0) hydrate(r.items);
      });
    };

    // Initial fetch
    refresh();

    // WebSocket sync
    const gatewayUrl = process.env.NEXT_PUBLIC_GATEWAY_WS_URL || process.env.NEXT_PUBLIC_WS_URL;
    const token = readSessionCookie(process.env.NEXT_PUBLIC_APP_AUTH_COOKIE_NAME || "narad_session");

    if (gatewayUrl && token) {
      const socket = new WebSocket(`${gatewayUrl}?token=${encodeURIComponent(token)}`);
      socket.addEventListener("open", () => {
        socket.send(JSON.stringify({ channels: ["narad:pulseboard:event"] }));
      });
      socket.addEventListener("message", (event) => {
        try {
          const parsed = JSON.parse(event.data);
          if (parsed.payload?.channel === "narad:pulseboard:event") {
            refresh();
          }
        } catch {
          // ignore
        }
      });
      return () => socket.close();
    }
  }, [data.cases, hydrate]);

  const activeCases = cases.filter((c) => c.status === "active").length;
  const totalEvidence = cases.reduce((acc, c) => acc + (c.evidenceCount || 0), 0);
  const totalItems = cases.reduce((acc, c) => acc + (c.itemCount || 0), 0);
  const highConfCases = cases.filter((c) => (c.confidence ?? 0) > 0.8).length;

  return (
    <section className="workspace-screen" style={{ paddingBottom: "3rem" }}>
      <div className="metric-strip">
        <article className="metric-card metric-card--sovereign accent-orange">
          <span className="metric-card__label">Active Portfolio</span>
          <strong className="metric-card__value">{activeCases}</strong>
        </article>
        <article className="metric-card metric-card--sovereign accent-red">
          <span className="metric-card__label">High Confidence</span>
          <strong className="metric-card__value">{highConfCases}</strong>
        </article>
        <article className="metric-card metric-card--sovereign">
          <span className="metric-card__label">Linked Signals</span>
          <strong className="metric-card__value">{totalItems}</strong>
        </article>
        <article className="metric-card metric-card--sovereign accent-cyan">
          <span className="metric-card__label">Evidence Pool</span>
          <strong className="metric-card__value">{totalEvidence}</strong>
        </article>
      </div>

      <div className="workspace-columns workspace-columns--three investigations-layout">
        <CaseDirectoryPanel />
        <CaseDetail />
        <CaseIntegrityRail />
      </div>

      <TickerStrip cases={cases} />
    </section>
  );
}
