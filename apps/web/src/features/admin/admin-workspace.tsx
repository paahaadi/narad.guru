"use client";

import { useEffect, useState, useTransition } from "react";
import {
  getSources,
  getPipelineStats,
  triggerSource,
  type AdminSourcesSnapshot,
  type AdminPipelineStats,
  type AdminSource,
} from "@/lib/workspaces/admin-client";
import { WorkspaceMetricStrip } from "@/features/workspaces/workspace-primitives";

export function AdminWorkspace() {
  const [sourcesReq, setSourcesReq] = useState<AdminSourcesSnapshot | null>(null);
  const [pipelineReq, setPipelineReq] = useState<AdminPipelineStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncingSources, setSyncingSources] = useState<Record<string, boolean>>({});
  const [, startTransition] = useTransition();

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [srcs, stats] = await Promise.all([getSources(), getPipelineStats()]);
        if (!active) return;
        setSourcesReq(srcs);
        setPipelineReq(stats);
      } catch (err) {
        console.error("Failed to load admin APIs", err);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  async function handleTrigger(source: AdminSource) {
    if (syncingSources[source.id]) return;
    
    setSyncingSources((prev) => ({ ...prev, [source.id]: true }));
    try {
      await triggerSource(source.id);
      
      // Optionally trigger reload of stats after a delay
      setTimeout(async () => {
        const [srcs, stats] = await Promise.all([getSources(), getPipelineStats()]);
        startTransition(() => {
          setSourcesReq(srcs);
          setPipelineReq(stats);
        });
      }, 2500);

    } catch (err) {
      console.error("Failed to trigger source", err);
    } finally {
      setTimeout(() => {
        setSyncingSources((prev) => ({ ...prev, [source.id]: false }));
      }, 1000);
    }
  }

  const metrics = [
    {
      label: "Configured Sources",
      value: sourcesReq ? String(sourcesReq.total) : "0",
      meta: sourcesReq ? `${sourcesReq.active} Active` : "Loading...",
    },
    {
      label: "Healthy Adapters",
      value: sourcesReq ? String(sourcesReq.healthy) : "0",
      accent: "accent-cyan",
      meta: sourcesReq && sourcesReq.unhealthy > 0 ? `${sourcesReq.unhealthy} Failing` : "Operational",
    },
    {
      label: "Celery Queue Depth",
      value: pipelineReq ? String(pipelineReq.summary.queue_total) : "0",
      accent: "accent-orange",
      meta: "Background tasks",
    },
    {
      label: "Dead Letters",
      value: pipelineReq ? String(pipelineReq.summary.dlq_total) : "0",
      accent: pipelineReq && pipelineReq.summary.dlq_total > 0 ? "accent-red" : undefined,
      meta: "Awaiting retry",
    },
  ];

  return (
    <section className="workspace-screen">
      <WorkspaceMetricStrip items={metrics} />

      <div className="workspace-columns">
        <article className="panel panel--document">
          <div className="section-heading section-heading--row">
            <div>
              <p className="eyebrow">Integration Layer</p>
              <h1>Intelligence Ingestion Pipeline</h1>
            </div>
            <div className="cluster-row">
              <span className="pill pill--cyan">Live</span>
              <span className="pill">Worker cluster connected</span>
            </div>
          </div>

          <p className="hero-copy">
            Monitor and manually execute Celery data ingestion tasks from configured Tier 1 and Tier 2 registries. Real-time NLP parsing and Entity extraction runs asynchronously for every sourced document.
          </p>

          <div className="story-sections">
            <section className="panel panel--muted">
              <p className="eyebrow">Configured Registries</p>
              <div className="list-stack">
                {loading && <div className="empty-surface">Querying intelligence service...</div>}
                {!loading && sourcesReq?.sources.length === 0 && (
                  <div className="empty-surface">No sources registered in the database.</div>
                )}
                {sourcesReq?.sources.map((source) => (
                  <div key={source.id} className="feed-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div className="feed-card__meta">
                        <span className={`pill ${source.health.status === 'healthy' ? 'pill--primary' : source.health.status === 'unhealthy' ? 'pill--red' : ''}`}>
                          {source.health.status}
                        </span>
                        <span>Tier {source.trust_tier}</span>
                      </div>
                      <strong style={{ display: 'block', fontSize: '1.25rem', marginBottom: '0.25rem' }}>{source.name}</strong>
                      <p style={{ opacity: 0.8, fontSize: '0.85rem' }}>
                        {source.health.reason}
                      </p>
                      <div className="cluster-row cluster-row--tight" style={{ marginTop: '0.5rem' }}>
                        <span>Ingested (24h): {source.documents_ingested_24h}</span>
                        {source.last_successful_fetch && (
                          <span>Last sync: {new Date(source.last_successful_fetch).toLocaleString()}</span>
                        )}
                      </div>
                    </div>
                    
                    <button 
                      type="button"
                      className="pill pill--cyan"
                      style={{ cursor: syncingSources[source.id] ? "wait" : "pointer" }}
                      disabled={syncingSources[source.id] || !source.is_active}
                      onClick={() => handleTrigger(source)}
                    >
                      {syncingSources[source.id] ? "Syncing..." : "Trigger Sync"}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </article>
      </div>
    </section>
  );
}
