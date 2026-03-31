"use client";

import { useEffect } from "react";
import type { WatchlistsWorkspaceData } from "@/lib/workspaces/watchlists";
import { useWatchlistsStore } from "@/stores/watchlists-store";
import { WorkspaceMetricStrip } from "@/features/workspaces/workspace-primitives";
import { DirectoryPanel } from "./directory-panel";
import { WatchlistDetail } from "./watchlist-detail";
import { AssistantRail } from "./assistant-rail";
import { fetchWatchlists } from "@/lib/workspaces/watchlists-client";

export function WatchlistsInteractiveWorkspace({ data }: { data: WatchlistsWorkspaceData }) {
  const hydrate = useWatchlistsStore((s) => s.hydrate);

  useEffect(() => {
    // Convert workspace data watchlists to full Watchlist type for the store
    const fullWatchlists = data.watchlists.map((w) => ({
      id: w.watchlistId,
      name: w.name,
      description: null,
      isActive: w.isActive,
      isPriority: false,
      category: null,
      folderPath: "/",
      ruleCount: w.ruleCount,
      alertCount: w.openAlertCount,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    hydrate(fullWatchlists);

    // Then fetch full data from API for richer details
    fetchWatchlists().then((watchlists) => {
      if (watchlists.length > 0) hydrate(watchlists);
    });
  }, [data.watchlists, hydrate]);

  return (
    <section className="workspace-screen">
      <WorkspaceMetricStrip items={data.metrics} />

      <div className="workspace-columns workspace-columns--three">
        <DirectoryPanel />
        <WatchlistDetail />
        <AssistantRail recommendations={data.recommendations} />
      </div>
    </section>
  );
}
