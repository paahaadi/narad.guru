"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import {
  getEntityEvents,
  getEntityFilings,
  getEntityGraph,
  getEntityNarrative,
  getEntityProfile,
} from "@/lib/workspaces/corpwatch-client";
import type {
  CorpWatchEntityProfile,
  CorpWatchEvent,
  CorpWatchFiling,
  CorpWatchGraphData,
  CorpWatchNarrative,
} from "@/lib/workspaces/corpwatch-types";
import { formatDate, formatDateTime } from "@/lib/workspaces/formatting";
import { NetworkGraph } from "./network-graph";

type CorpWatchTab = "overview" | "filings" | "events" | "geography";

function riskPill(score: number) {
  if (score >= 70) return "pill pill--critical";
  if (score >= 40) return "pill pill--high";
  if (score > 0) return "pill pill--cyan";
  return "pill";
}

function severityPill(severity: string) {
  switch (severity) {
    case "critical": return "pill pill--critical";
    case "high": return "pill pill--high";
    case "medium": return "pill pill--medium";
    case "low": return "pill pill--low";
    default: return "pill pill--informational";
  }
}

function entityBadge(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 4);
}

function formatCurrency(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "Not available";
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(value);
}

function RiskGauge({ score, size = 72 }: { score: number; size?: number }) {
  const r = (size - 8) / 2;
  const circumference = 2 * Math.PI * r;
  const pct = Math.min(Math.max(score, 0), 100) / 100;
  const offset = circumference * (1 - pct);
  const color = score >= 70 ? "#ee7d77" : score >= 40 ? "#ec7609" : score > 0 ? "#8ce7ff" : "#6c758c";

  return (
    <div className="risk-gauge" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`}>
        <circle className="risk-gauge__track" cx={size / 2} cy={size / 2} r={r} />
        <circle
          className="risk-gauge__fill"
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="risk-gauge__label" style={{ color, fontSize: size > 60 ? "1.4rem" : "1.1rem" }}>
        {score > 0 ? Math.round(score) : "–"}
      </span>
    </div>
  );
}

function SovereignTabBar({
  activeTab,
  onSelect,
}: {
  activeTab: CorpWatchTab;
  onSelect: (tab: CorpWatchTab) => void;
}) {
  return (
    <div className="sovereign-tab-bar">
      {(["overview", "filings", "events", "geography"] as const).map((tab) => (
        <button
          key={tab}
          type="button"
          className={`sovereign-tab${activeTab === tab ? " is-active" : ""}`}
          onClick={() => onSelect(tab)}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}

function LoadingState() {
  return (
    <section className="workspace-screen">
      <div className="corpwatch-layout">
        <article className="panel panel--document">
          <div className="dossier-banner">
            <div className="dossier-banner__seal">CW</div>
            <div className="dossier-banner__body">
              <p className="eyebrow">CorpWatch Profile</p>
              <h1>Loading entity profile</h1>
              <p>Fetching relationships, filings, recent events, and narrative synthesis.</p>
            </div>
          </div>
        </article>
        <article className="panel panel--muted">
          <p className="eyebrow">Relationship Graph</p>
          <div className="graph-canvas" style={{ height: "300px", display: "grid", placeItems: "center" }}>
            <span style={{ color: "var(--text-secondary)" }}>Initializing force simulation…</span>
          </div>
        </article>
        <aside className="panel">
          <p className="eyebrow">Intelligence Rail</p>
          <div className="feed-card">
            <strong>Preparing entity desk</strong>
            <p>Loading the current posture, recent signals, and filing trail.</p>
          </div>
        </aside>
      </div>
    </section>
  );
}

export function CorpWatchEntityPage({ entityId }: { entityId: string }) {
  const [profile, setProfile] = useState<CorpWatchEntityProfile | null>(null);
  const [graph, setGraph] = useState<CorpWatchGraphData | null>(null);
  const [filings, setFilings] = useState<CorpWatchFiling[]>([]);
  const [events, setEvents] = useState<CorpWatchEvent[]>([]);
  const [narrative, setNarrative] = useState<CorpWatchNarrative | null>(null);
  const [activeTab, setActiveTab] = useState<CorpWatchTab>("overview");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshingNarrative, startNarrativeRefresh] = useTransition();

  useEffect(() => {
    let isCancelled = false;
    setIsLoading(true);
    setError(null);

    void Promise.all([
      getEntityProfile(entityId),
      getEntityGraph(entityId),
      getEntityFilings(entityId, { limit: 8 }),
      getEntityEvents(entityId, { limit: 8 }),
    ])
      .then(async ([profileResponse, graphResponse, filingResponse, eventResponse]) => {
        const resolvedNarrative =
          profileResponse.narrative ??
          (await getEntityNarrative(entityId).catch(() => null));

        if (isCancelled) return;
        setProfile(profileResponse);
        setGraph(graphResponse);
        setFilings(filingResponse.items);
        setEvents(eventResponse.items);
        setNarrative(resolvedNarrative);
      })
      .catch((reason) => {
        if (isCancelled) return;
        setError(reason instanceof Error ? reason.message : "Unable to load entity profile");
      })
      .finally(() => {
        if (!isCancelled) setIsLoading(false);
      });

    return () => { isCancelled = true; };
  }, [entityId]);

  const refreshNarrative = () => {
    startNarrativeRefresh(() => {
      void getEntityNarrative(entityId, { forceRefresh: true })
        .then((nextNarrative) => setNarrative(nextNarrative))
        .catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to refresh narrative"));
    });
  };

  if (isLoading && !profile) return <LoadingState />;

  if (!profile) {
    return (
      <section className="workspace-screen">
        <article className="panel panel--document">
          <div className="dossier-banner">
            <div className="dossier-banner__seal">!</div>
            <div className="dossier-banner__body">
              <p className="eyebrow">CorpWatch Profile</p>
              <h1>Entity unavailable</h1>
              <p>{error ?? "The requested entity profile could not be loaded."}</p>
            </div>
          </div>
          <Link href="/corpwatch" className="feed-card is-active" style={{ marginTop: "1.25rem" }}>
            <div className="feed-card__meta">
              <span className="pill pill--primary">Back</span>
              <span>CorpWatch</span>
            </div>
            <strong>Return to search</strong>
            <p>Search for another entity or reopen the featured desk.</p>
          </Link>
        </article>
      </section>
    );
  }

  const activeNarrative = narrative ?? profile.narrative;
  const graphEdges = graph?.edges.slice(0, 8) ?? [];

  return (
    <section className="workspace-screen" style={{ paddingBottom: "3rem" }}>
      {/* ── Metric Strip ── */}
      <div className="metric-strip">
        <article className="metric-card metric-card--sovereign accent-orange">
          <span className="metric-card__label">Risk Score</span>
          <strong className="metric-card__value">{Math.round(profile.riskScore) || "–"}</strong>
        </article>
        <article className="metric-card metric-card--sovereign">
          <span className="metric-card__label">Health Score</span>
          <strong className="metric-card__value">{Math.round(profile.healthScore) || "–"}</strong>
        </article>
        <article className="metric-card metric-card--sovereign accent-cyan">
          <span className="metric-card__label">Relationships</span>
          <strong className="metric-card__value">{profile.keyRelationships.length}</strong>
        </article>
        <article className="metric-card metric-card--sovereign">
          <span className="metric-card__label">Recent Events</span>
          <strong className="metric-card__value">{profile.recentEvents.length}</strong>
        </article>
        <article className="metric-card metric-card--sovereign accent-red">
          <span className="metric-card__label">Breaches</span>
          <strong className="metric-card__value">{profile.corpWatch.complianceBreachCount}</strong>
        </article>
      </div>

      {/* ── Three-Column Desk ── */}
      <div className="corpwatch-layout">
        {/* ── Left: Entity Dossier + Tabs ── */}
        <article className="panel panel--document corpwatch-layout__profile" style={{ padding: "1.25rem" }}>
          {/* Dossier Banner */}
          <div className="dossier-banner" style={{ marginBottom: "1.25rem" }}>
            <div className="dossier-banner__seal">{entityBadge(profile.canonicalName)}</div>
            <div className="dossier-banner__body">
              <p className="eyebrow">CorpWatch Entity Profile</p>
              <h1>{profile.canonicalName}</h1>
              <div className="cluster-row" style={{ marginTop: "0.35rem" }}>
                <span className={riskPill(profile.riskScore)}>
                  risk {Math.round(profile.riskScore) || "warming"}
                </span>
                <span className="pill">{profile.corpWatch.companyStatus}</span>
                <span className="pill">{profile.corpWatch.sector}</span>
                <span className="pill pill--cyan">{profile.corpWatch.listingStatus}</span>
              </div>
            </div>
            <RiskGauge score={profile.riskScore} />
          </div>

          <p className="hero-copy" style={{ marginBottom: "1rem" }}>{profile.description}</p>

          {/* External IDs */}
          {Object.entries(profile.externalIds).length > 0 ? (
            <div className="cluster-row" style={{ marginBottom: "1.25rem" }}>
              {Object.entries(profile.externalIds).map(([label, value]) => (
                <span key={label} className="pill pill--cyan" style={{ fontFamily: "var(--font-mono)", fontSize: "0.68rem" }}>
                  {label.toUpperCase()}: {value}
                </span>
              ))}
            </div>
          ) : null}

          {/* Tab Bar */}
          <SovereignTabBar activeTab={activeTab} onSelect={setActiveTab} />

          {/* ── OVERVIEW TAB ── */}
          {activeTab === "overview" ? (
            <div className="story-sections" style={{ marginTop: "1.25rem" }}>
              <section className="panel panel--muted">
                <p className="eyebrow">Executive Data</p>
                <div className="data-grid">
                  <div className="data-point">
                    <span>Registered Office</span>
                    <strong>{profile.corpWatch.registeredOffice}</strong>
                  </div>
                  <div className="data-point">
                    <span>Filing Completeness</span>
                    <strong>{Math.round(profile.corpWatch.filingCompleteness)}%</strong>
                  </div>
                  <div className="data-point">
                    <span>Paid-up Capital</span>
                    <strong style={{ fontFamily: "var(--font-mono)" }}>
                      ₹{formatCurrency(profile.corpWatch.paidUpCapitalInr)}
                    </strong>
                  </div>
                  <div className="data-point">
                    <span>Compliance Breaches</span>
                    <strong style={{ color: profile.corpWatch.complianceBreachCount > 0 ? "#ee7d77" : "inherit" }}>
                      {profile.corpWatch.complianceBreachCount}
                    </strong>
                  </div>
                </div>
              </section>

              <section className="panel panel--muted">
                <p className="eyebrow">Board of Directors</p>
                <div className="list-stack">
                  {profile.corpWatch.directors.length > 0 ? (
                    profile.corpWatch.directors.map((director) => (
                      <div key={`${director.name}-${director.role}`} className="feed-card entity-card--sovereign risk-medium">
                        <div className="feed-card__meta">
                          <span className="pill pill--cyan">{director.role}</span>
                        </div>
                        <strong>{director.name}</strong>
                      </div>
                    ))
                  ) : (
                    <div className="feed-card">
                      <strong>No director roster yet</strong>
                      <p>Director and officer data will appear here when the profile is enriched.</p>
                    </div>
                  )}
                </div>
              </section>

              <section className="panel panel--muted">
                <p className="eyebrow">Shareholder Structure</p>
                <div className="list-stack">
                  {profile.corpWatch.shareholders.length > 0 ? (
                    profile.corpWatch.shareholders.map((sh) => (
                      <div key={`${sh.name}-${sh.stake}`} className="feed-card entity-card--sovereign risk-high">
                        <div className="feed-card__meta">
                          <span className="pill pill--high">{sh.stake}% stake</span>
                        </div>
                        <strong>{sh.name}</strong>
                      </div>
                    ))
                  ) : (
                    <div className="feed-card">
                      <strong>No shareholder table yet</strong>
                      <p>Ownership exposure will appear here when structured data is available.</p>
                    </div>
                  )}
                </div>
              </section>
            </div>
          ) : null}

          {/* ── FILINGS TAB ── */}
          {activeTab === "filings" ? (
            <div className="list-stack" style={{ marginTop: "1.25rem" }}>
              {filings.length > 0 ? (
                filings.map((filing) => (
                  <div key={filing.documentId} className="filing-ledger">
                    <div className="filing-ledger__header">
                      <strong className="filing-ledger__title">{filing.title}</strong>
                      <span className="pill pill--cyan" style={{ fontSize: "0.62rem" }}>
                        {filing.docType}
                      </span>
                    </div>
                    <p className="filing-ledger__excerpt">{filing.excerpt}</p>
                    <div className="filing-ledger__source">
                      <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>
                        source
                      </span>
                      <span>{filing.sourceName}</span>
                      <span>·</span>
                      <span>{formatDateTime(filing.publishedAt, "pending publication")}</span>
                      {filing.fetchUrl ? (
                        <>
                          <span>·</span>
                          <a
                            href={filing.fetchUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={{ color: "var(--tertiary)" }}
                          >
                            Open source
                          </a>
                        </>
                      ) : null}
                    </div>
                  </div>
                ))
              ) : (
                <div className="feed-card">
                  <strong>No linked filings yet</strong>
                  <p>Filings will appear here as soon as document links are projected for this entity.</p>
                </div>
              )}
            </div>
          ) : null}

          {/* ── EVENTS TAB ── */}
          {activeTab === "events" ? (
            <div className="list-stack" style={{ marginTop: "1.25rem" }}>
              {events.length > 0 ? (
                events.map((event) => (
                  <div key={event.eventId} className="feed-card entity-card--sovereign risk-medium">
                    <div className="feed-card__meta">
                      <span className={severityPill(event.severity)}>{event.severity}</span>
                      <span>{formatDateTime(event.occurredAt, "pending time")}</span>
                    </div>
                    <strong>{event.title}</strong>
                    <p>{event.summary ?? `${event.eventType} signal linked to this entity.`}</p>
                    <p style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>
                      {event.sourceName ?? "Source pending"}
                    </p>
                  </div>
                ))
              ) : (
                <div className="feed-card">
                  <strong>No recent events</strong>
                  <p>Event-linked signals will appear here when the entity becomes part of a live event chain.</p>
                </div>
              )}
            </div>
          ) : null}

          {/* ── GEOGRAPHY TAB ── */}
          {activeTab === "geography" ? (
            <div className="story-sections" style={{ marginTop: "1.25rem" }}>
              <section className="panel panel--muted">
                <p className="eyebrow">Registered Footprint</p>
                <div className="data-grid">
                  <div className="data-point">
                    <span>Label</span>
                    <strong>{profile.location.label}</strong>
                  </div>
                  <div className="data-point">
                    <span>State</span>
                    <strong>{profile.location.stateCode ?? "Unavailable"}</strong>
                  </div>
                  <div className="data-point">
                    <span>District</span>
                    <strong>{profile.location.districtCode ?? "Unavailable"}</strong>
                  </div>
                  <div className="data-point">
                    <span>Coordinates</span>
                    <strong style={{ fontFamily: "var(--font-mono)" }}>
                      {profile.location.lat ?? "?"}, {profile.location.lon ?? "?"}
                    </strong>
                  </div>
                </div>
              </section>
              <section className="panel panel--muted">
                <p className="eyebrow">Entity-linked Event Trail</p>
                <ul className="timeline-list">
                  {events.length > 0 ? (
                    events.map((event) => (
                      <li key={event.eventId}>
                        {event.title} · {formatDateTime(event.occurredAt, "pending time")} · {event.sourceName ?? "source pending"}
                      </li>
                    ))
                  ) : (
                    <li>No event geography is linked yet.</li>
                  )}
                </ul>
              </section>
            </div>
          ) : null}
        </article>

        {/* ── Center: Graph + Narrative ── */}
        <div className="corpwatch-layout__intel" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {/* Interactive Force Graph */}
          <div className="panel" style={{ padding: "1rem" }}>
            <div className="section-heading" style={{ marginBottom: "0.75rem" }}>
              <p className="eyebrow">Relationship Network</p>
              <p className="cluster-row--tight">
                {graph ? `${graph.nodes.length} nodes · ${graph.edges.length} edges` : "Loading graph…"}
              </p>
            </div>
            {graph ? (
              <NetworkGraph data={graph} height={340} />
            ) : (
              <div className="graph-canvas" style={{ height: "340px", display: "grid", placeItems: "center" }}>
                <span style={{ color: "var(--text-secondary)" }}>Initializing force simulation…</span>
              </div>
            )}
          </div>

          {/* AI Narrative */}
          <div className="narrative-panel">
            <div className="narrative-panel__header">
              <div>
                <p className="eyebrow">Intelligence Narrative</p>
                <strong style={{ fontSize: "0.92rem" }}>
                  {activeNarrative?.generatedBy ?? "Narrative pending"}
                </strong>
              </div>
              <button
                type="button"
                className={`pill${isRefreshingNarrative ? " pill--cyan" : " pill--primary"}`}
                style={{ border: "none", cursor: "pointer" }}
                onClick={refreshNarrative}
              >
                {isRefreshingNarrative ? "Synthesizing…" : "Refresh"}
              </button>
            </div>
            <p className="hero-copy" style={{ fontSize: "0.86rem" }}>
              {activeNarrative?.narrative ??
                "Narrative synthesis is not available yet. Use refresh to rebuild the current summary."}
            </p>
            <div className="narrative-panel__confidence">
              <div
                className="narrative-panel__confidence-fill"
                style={{ width: `${Math.round((activeNarrative?.confidence ?? 0.58) * 100)}%` }}
              />
            </div>
            <p className="cluster-row--tight" style={{ marginTop: "0.5rem" }}>
              Confidence {Math.round((activeNarrative?.confidence ?? 0.58) * 100)}% ·{" "}
              {activeNarrative?.cached ? "cached" : "fresh"} · expires{" "}
              {formatDateTime(activeNarrative?.expiresAt, "on demand")}
            </p>
            {error ? <p className="cluster-row--tight" style={{ color: "var(--danger)" }}>{error}</p> : null}
          </div>
        </div>

        {/* ── Right: Relationship Rail ── */}
        <aside className="panel corpwatch-layout__rail" style={{ padding: "1.25rem" }}>
          <div className="section-heading">
            <p className="eyebrow">Relationship Graph</p>
            <h2 style={{ fontSize: "1.1rem" }}>Connected Entities</h2>
          </div>

          <div className="list-stack">
            {graphEdges.length > 0 ? (
              graphEdges.map((edge) => (
                <Link
                  key={edge.relationshipId}
                  href={`/corpwatch/${edge.targetEntityId}`}
                  className="feed-card entity-card--sovereign risk-medium"
                >
                  <div className="feed-card__meta">
                    <span className="pill">{edge.relationshipType}</span>
                    <span>{Math.round(edge.confidence * 100)}%</span>
                  </div>
                  <strong>{edge.targetName}</strong>
                  <p>
                    {edge.direction} · {edge.targetType}
                  </p>
                </Link>
              ))
            ) : (
              <div className="feed-card">
                <strong>Graph still warming</strong>
                <p>Relationship edges will populate when cross-entity links are projected.</p>
              </div>
            )}
          </div>

          {/* Quick nav back */}
          <Link href="/corpwatch" className="feed-card is-active" style={{ marginTop: "auto" }}>
            <div className="feed-card__meta">
              <span className="pill pill--primary">
                <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>arrow_back</span>
              </span>
              <span>CorpWatch</span>
            </div>
            <strong>Back to search</strong>
          </Link>
        </aside>
      </div>
    </section>
  );
}
