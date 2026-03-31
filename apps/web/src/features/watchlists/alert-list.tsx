"use client";

import { useEffect, useState } from "react";
import { useWatchlistsStore } from "@/stores/watchlists-store";
import { fetchWatchlistAlerts, updateAlertStatus } from "@/lib/workspaces/watchlists-client";

const SEVERITY_ORDER = ["critical", "high", "medium", "low", "informational"];
const STATUSES = ["new", "triaged", "assigned", "acknowledged", "in_progress", "resolved", "suppressed"];

function severityPill(severity: string) {
  switch (severity) {
    case "critical": return "pill pill--critical";
    case "high": return "pill pill--high";
    case "medium": return "pill pill--medium";
    case "low": return "pill pill--low";
    default: return "pill pill--informational";
  }
}

function statusPill(status: string) {
  switch (status) {
    case "new": return "pill pill--critical";
    case "triaged": return "pill pill--cyan";
    case "assigned":
    case "acknowledged": return "pill pill--primary";
    case "in_progress": return "pill pill--high";
    case "resolved": return "pill pill--low";
    case "suppressed": return "pill";
    default: return "pill";
  }
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  new: ["triaged", "suppressed"],
  triaged: ["assigned", "suppressed"],
  assigned: ["acknowledged", "suppressed"],
  acknowledged: ["in_progress", "suppressed"],
  in_progress: ["resolved", "suppressed"],
};

export function AlertList() {
  const {
    selectedWatchlistId, alerts, alertFilter,
    setAlerts, setAlertFilter, patchAlert,
  } = useWatchlistsStore();

  const [loading, setLoading] = useState(false);
  const [transitioning, setTransitioning] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedWatchlistId) return;
    setLoading(true);
    fetchWatchlistAlerts(selectedWatchlistId, alertFilter)
      .then(setAlerts)
      .finally(() => setLoading(false));
  }, [selectedWatchlistId, alertFilter, setAlerts]);

  async function handleTransition(alertId: string, newStatus: string) {
    setTransitioning(alertId);
    try {
      const updated = await updateAlertStatus(alertId, newStatus);
      patchAlert(alertId, updated);
    } finally {
      setTransitioning(null);
    }
  }

  const sorted = [...alerts].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
  );

  return (
    <div>
      <div className="cluster-row" style={{ marginBottom: "0.75rem", gap: "0.5rem", flexWrap: "wrap" }}>
        <select
          className="command-bar__input"
          value={alertFilter.severity ?? ""}
          onChange={(e) => setAlertFilter({ ...alertFilter, severity: e.target.value || undefined })}
          style={{ maxWidth: "10rem" }}
        >
          <option value="">All severities</option>
          {SEVERITY_ORDER.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          className="command-bar__input"
          value={alertFilter.status ?? ""}
          onChange={(e) => setAlertFilter({ ...alertFilter, status: e.target.value || undefined })}
          style={{ maxWidth: "10rem" }}
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {loading && <p className="eyebrow">Loading alerts...</p>}

      <div className="list-stack">
        {sorted.map((alert) => {
          const transitions = VALID_TRANSITIONS[alert.status] ?? [];
          const isExpanded = expandedId === alert.id;

          return (
            <div
              key={alert.id}
              className="feed-card"
              onClick={() => setExpandedId(isExpanded ? null : alert.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && setExpandedId(isExpanded ? null : alert.id)}
            >
              <div className="feed-card__meta">
                <span className={severityPill(alert.severity)}>{alert.severity}</span>
                <span className={statusPill(alert.status)}>{alert.status.replaceAll("_", " ")}</span>
                <span>{new Date(alert.createdAt).toLocaleString()}</span>
              </div>
              <strong>{alert.title}</strong>
              {alert.summary && <p>{alert.summary}</p>}

              {isExpanded && (
                <div style={{ marginTop: "0.5rem" }}>
                  <div className="data-grid">
                    {alert.episodeId && (
                      <div className="data-point">
                        <span>Episode</span>
                        <strong>{alert.episodeId.slice(0, 8)}</strong>
                      </div>
                    )}
                    {alert.assignedTo && (
                      <div className="data-point">
                        <span>Assigned to</span>
                        <strong>{alert.assignedTo.slice(0, 8)}</strong>
                      </div>
                    )}
                    {alert.triggeredByEventId && (
                      <div className="data-point">
                        <span>Trigger event</span>
                        <strong>{alert.triggeredByEventId.slice(0, 8)}</strong>
                      </div>
                    )}
                    {alert.triggeredByEntityId && (
                      <div className="data-point">
                        <span>Trigger entity</span>
                        <strong>{alert.triggeredByEntityId.slice(0, 8)}</strong>
                      </div>
                    )}
                  </div>

                  {transitions.length > 0 && (
                    <div className="cluster-row" style={{ marginTop: "0.5rem", gap: "0.25rem" }}>
                      {transitions.map((t) => (
                        <button
                          key={t}
                          className={`pill ${t === "suppressed" ? "" : "pill--primary"}`}
                          disabled={transitioning === alert.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleTransition(alert.id, t);
                          }}
                        >
                          {transitioning === alert.id ? "..." : t.replaceAll("_", " ")}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {!loading && sorted.length === 0 && (
          <div className="feed-card">
            <strong>No alerts</strong>
            <p>No alerts match the current filters for this watchlist.</p>
          </div>
        )}
      </div>
    </div>
  );
}
