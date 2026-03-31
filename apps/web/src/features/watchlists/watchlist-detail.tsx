"use client";

import { useEffect, useState } from "react";
import { useWatchlistsStore } from "@/stores/watchlists-store";
import { fetchWatchlistRules } from "@/lib/workspaces/watchlists-client";
import { AlertList } from "./alert-list";
import { RuleBuilder } from "./rule-builder";

function severityPill(severity: string) {
  switch (severity) {
    case "critical": return "pill pill--critical";
    case "high": return "pill pill--high";
    case "medium": return "pill pill--medium";
    case "low": return "pill pill--low";
    default: return "pill pill--informational";
  }
}

function OverviewTab() {
  const { watchlists, selectedWatchlistId } = useWatchlistsStore();
  const selected = watchlists.find((w) => w.id === selectedWatchlistId);
  if (!selected) return <p className="eyebrow">Select a watchlist</p>;

  return (
    <div className="story-sections">
      <section className="panel panel--muted">
        <p className="eyebrow">Details</p>
        <div className="data-grid">
          <div className="data-point">
            <span>Status</span>
            <strong>{selected.isActive ? "Active" : "Paused"}</strong>
          </div>
          <div className="data-point">
            <span>Category</span>
            <strong>{selected.category ?? "None"}</strong>
          </div>
          <div className="data-point">
            <span>Priority</span>
            <strong>{selected.isPriority ? "Yes" : "No"}</strong>
          </div>
          <div className="data-point">
            <span>Folder</span>
            <strong>{selected.folderPath}</strong>
          </div>
          <div className="data-point">
            <span>Rules</span>
            <strong>{selected.ruleCount}</strong>
          </div>
          <div className="data-point">
            <span>Alerts</span>
            <strong>{selected.alertCount}</strong>
          </div>
          <div className="data-point">
            <span>Created</span>
            <strong>{new Date(selected.createdAt).toLocaleDateString()}</strong>
          </div>
          <div className="data-point">
            <span>Updated</span>
            <strong>{new Date(selected.updatedAt).toLocaleDateString()}</strong>
          </div>
        </div>
      </section>
      {selected.description && (
        <section className="panel panel--muted">
          <p className="eyebrow">Description</p>
          <p>{selected.description}</p>
        </section>
      )}
    </div>
  );
}

function RulesTab() {
  const { selectedWatchlistId, rules, setRules } = useWatchlistsStore();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedWatchlistId) return;
    setLoading(true);
    fetchWatchlistRules(selectedWatchlistId)
      .then(setRules)
      .finally(() => setLoading(false));
  }, [selectedWatchlistId, setRules]);

  return (
    <div>
      <RuleBuilder />
      {loading && <p className="eyebrow">Loading rules...</p>}
      <div className="list-stack">
        {rules.map((rule) => (
          <div key={rule.id} className="feed-card">
            <div className="feed-card__meta">
              <span className={rule.isActive ? "pill pill--primary" : "pill"}>
                {rule.isActive ? "active" : "disabled"}
              </span>
              {rule.severityOverride && (
                <span className={severityPill(rule.severityOverride)}>
                  override: {rule.severityOverride}
                </span>
              )}
              <span>{new Date(rule.createdAt).toLocaleDateString()}</span>
            </div>
            <strong>{rule.ruleName}</strong>
            {rule.description && <p>{rule.description}</p>}
            <p className="eyebrow" style={{ marginTop: "0.25rem", fontFamily: "monospace", fontSize: "0.65rem" }}>
              {JSON.stringify(rule.condition).slice(0, 120)}
            </p>
          </div>
        ))}
        {!loading && rules.length === 0 && (
          <div className="feed-card">
            <strong>No rules configured</strong>
            <p>Add a rule above to begin generating automated alerts.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function HistoryTab() {
  const { alerts } = useWatchlistsStore();
  const resolved = alerts.filter((a) => a.status === "resolved" || a.status === "suppressed");

  return (
    <div className="list-stack">
      {resolved.length === 0 && (
        <div className="feed-card">
          <strong>No resolved alerts</strong>
          <p>Resolved and suppressed alerts will appear here.</p>
        </div>
      )}
      {resolved.map((alert) => (
        <div key={alert.id} className="feed-card">
          <div className="feed-card__meta">
            <span className={severityPill(alert.severity)}>{alert.severity}</span>
            <span className="pill pill--low">{alert.status}</span>
            <span>{new Date(alert.updatedAt).toLocaleString()}</span>
          </div>
          <strong>{alert.title}</strong>
          {alert.summary && <p>{alert.summary}</p>}
        </div>
      ))}
    </div>
  );
}

const TABS = [
  { key: "overview" as const, label: "Overview" },
  { key: "alerts" as const, label: "Alerts" },
  { key: "rules" as const, label: "Rules" },
  { key: "history" as const, label: "History" },
];

export function WatchlistDetail() {
  const { watchlists, selectedWatchlistId, activeTab, setActiveTab } = useWatchlistsStore();
  const selected = watchlists.find((w) => w.id === selectedWatchlistId);

  if (!selected) {
    return (
      <article className="panel panel--document">
        <p className="eyebrow">No watchlist selected</p>
        <p className="hero-copy">Select a watchlist from the directory or create a new one.</p>
      </article>
    );
  }

  return (
    <article className="panel panel--document">
      <div className="section-heading">
        <p className="eyebrow">Watchlist Detail</p>
        <h2 className="hero-title">{selected.name}</h2>
      </div>

      <div className="cluster-row" style={{ marginBottom: "1rem" }}>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className={`pill${activeTab === tab.key ? " pill--primary" : ""}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" && <OverviewTab />}
      {activeTab === "alerts" && <AlertList />}
      {activeTab === "rules" && <RulesTab />}
      {activeTab === "history" && <HistoryTab />}
    </article>
  );
}
