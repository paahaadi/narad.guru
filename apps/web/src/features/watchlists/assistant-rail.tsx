"use client";

import type { WatchlistsWorkspaceData } from "@/lib/workspaces/watchlists";
import { useWatchlistsStore } from "@/stores/watchlists-store";

export function AssistantRail({ recommendations }: { recommendations: WatchlistsWorkspaceData["recommendations"] }) {
  const { watchlists, selectedWatchlistId, alerts } = useWatchlistsStore();
  const selected = watchlists.find((w) => w.id === selectedWatchlistId);

  const contextualHints: string[] = [];
  if (selected && !selected.isActive) {
    contextualHints.push(`"${selected.name}" is currently paused. No new alerts will be generated.`);
  }
  if (selected && selected.ruleCount === 0) {
    contextualHints.push(`"${selected.name}" has no rules. Switch to the Rules tab to configure alert conditions.`);
  }
  const criticalAlerts = alerts.filter((a) => a.severity === "critical" && a.status === "new");
  if (criticalAlerts.length > 0) {
    contextualHints.push(`${criticalAlerts.length} critical untriaged alert(s) — consider immediate triage.`);
  }

  return (
    <aside className="panel">
      <p className="eyebrow">Assistant Rail</p>
      <div className="list-stack">
        {contextualHints.map((hint, i) => (
          <div key={`ctx-${i}`} className="feed-card">
            <div className="feed-card__meta">
              <span className="pill pill--cyan">context</span>
            </div>
            <strong>Insight</strong>
            <p>{hint}</p>
          </div>
        ))}
        {recommendations.map((item, i) => (
          <div key={`rec-${i}`} className="feed-card">
            <div className="feed-card__meta">
              <span className="pill pill--primary">recommendation</span>
            </div>
            <strong>Suggestion</strong>
            <p>{item}</p>
          </div>
        ))}
      </div>
    </aside>
  );
}
