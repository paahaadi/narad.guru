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

type CorpWatchTab = "overview" | "filings" | "events" | "geography";

const interactivePillStyle = {
  border: "none",
  cursor: "pointer",
} as const;

function riskPill(score: number) {
  if (score >= 70) {
    return "pill pill--critical";
  }
  if (score >= 40) {
    return "pill pill--high";
  }
  if (score > 0) {
    return "pill pill--cyan";
  }
  return "pill";
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
  if (value === null || !Number.isFinite(value)) {
    return "Not available";
  }

  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
  }).format(value);
}

function severityPill(severity: string) {
  switch (severity) {
    case "critical":
      return "pill pill--critical";
    case "high":
      return "pill pill--high";
    case "medium":
      return "pill pill--medium";
    case "low":
      return "pill pill--low";
    default:
      return "pill pill--informational";
  }
}

function LoadingState() {
  return (
    <section className="workspace-screen">
      <div className="workspace-columns workspace-columns--three">
        <article className="panel panel--document">
          <p className="eyebrow">CorpWatch profile</p>
          <h1 className="hero-title">Loading entity profile</h1>
          <p className="hero-copy">Fetching relationships, filings, recent events, and narrative synthesis.</p>
        </article>
        <aside className="panel panel--muted">
          <p className="eyebrow">Relationship graph</p>
          <div className="graph-surface">
            <div className="graph-node graph-node--primary">CW</div>
            <div className="graph-node graph-node--secondary">R1</div>
            <div className="graph-node graph-node--secondary">R2</div>
            <div className="graph-node graph-node--secondary">R3</div>
          </div>
        </aside>
        <aside className="panel">
          <p className="eyebrow">Monitoring rail</p>
          <div className="feed-card">
            <strong>Preparing entity desk</strong>
            <p>Loading the current posture, recent signals, and filing trail.</p>
          </div>
        </aside>
      </div>
    </section>
  );
}

function TabButtons({
  activeTab,
  onSelect,
}: {
  activeTab: CorpWatchTab;
  onSelect: (tab: CorpWatchTab) => void;
}) {
  return (
    <div className="cluster-row">
      {(["overview", "filings", "events", "geography"] as const).map((tab) => (
        <button
          key={tab}
          type="button"
          className={`pill${activeTab === tab ? " pill--primary" : ""}`}
          style={interactivePillStyle}
          onClick={() => onSelect(tab)}
        >
          {tab}
        </button>
      ))}
    </div>
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

        if (isCancelled) {
          return;
        }

        setProfile(profileResponse);
        setGraph(graphResponse);
        setFilings(filingResponse.items);
        setEvents(eventResponse.items);
        setNarrative(resolvedNarrative);
      })
      .catch((reason) => {
        if (isCancelled) {
          return;
        }
        setError(reason instanceof Error ? reason.message : "Unable to load entity profile");
      })
      .finally(() => {
        if (!isCancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [entityId]);

  const refreshNarrative = () => {
    startNarrativeRefresh(() => {
      void getEntityNarrative(entityId, { forceRefresh: true })
        .then((nextNarrative) => {
          setNarrative(nextNarrative);
        })
        .catch((reason) => {
          setError(reason instanceof Error ? reason.message : "Unable to refresh narrative");
        });
    });
  };

  if (isLoading && !profile) {
    return <LoadingState />;
  }

  if (!profile) {
    return (
      <section className="workspace-screen">
        <article className="panel panel--document">
          <p className="eyebrow">CorpWatch profile</p>
          <h1 className="hero-title">Entity unavailable</h1>
          <p className="hero-copy">{error ?? "The requested entity profile could not be loaded."}</p>
          <Link href="/corpwatch" className="feed-card is-active">
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
  const graphNodes = graph?.nodes.filter((node) => !node.isCentral).slice(0, 3) ?? [];
  const graphEdges = graph?.edges.slice(0, 8) ?? [];

  return (
    <section className="workspace-screen">
      <div className="workspace-columns workspace-columns--three">
        <article className="panel panel--document">
          <div className="section-heading section-heading--row">
            <div>
              <p className="eyebrow">CorpWatch entity profile</p>
              <h1 className="hero-title">{profile.canonicalName}</h1>
            </div>
            <div className="cluster-row">
              <span className={riskPill(profile.riskScore)}>
                risk {Math.round(profile.riskScore) || "warming"}
              </span>
              <span className="pill">{profile.corpWatch.companyStatus}</span>
              <span className="pill">{profile.corpWatch.sector}</span>
            </div>
          </div>

          <p className="hero-copy">{profile.description}</p>

          <div className="story-sections">
            <section className="panel panel--muted">
              <p className="eyebrow">Hero panel</p>
              <div className="data-grid">
                <div className="data-point">
                  <span>Location</span>
                  <strong>{profile.location.label}</strong>
                </div>
                <div className="data-point">
                  <span>Listing</span>
                  <strong>{profile.corpWatch.listingStatus}</strong>
                </div>
                <div className="data-point">
                  <span>Risk / health</span>
                  <strong>
                    {Math.round(profile.riskScore)} / {Math.round(profile.healthScore)}
                  </strong>
                </div>
                <div className="data-point">
                  <span>Last filing</span>
                  <strong>{formatDate(profile.corpWatch.lastFilingDate, "No filing found")}</strong>
                </div>
              </div>
              {Object.entries(profile.externalIds).length > 0 ? (
                <ul className="timeline-list">
                  {Object.entries(profile.externalIds).map(([label, value]) => (
                    <li key={label}>
                      {label.toUpperCase()}: {value}
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>

            <section className="panel panel--muted">
              <div className="section-heading section-heading--row">
                <div>
                  <p className="eyebrow">AI synthesis</p>
                  <strong>{activeNarrative?.generatedBy ?? "Narrative pending"}</strong>
                </div>
                <button
                  type="button"
                  className={`pill${isRefreshingNarrative ? " pill--cyan" : " pill--primary"}`}
                  style={interactivePillStyle}
                  onClick={refreshNarrative}
                >
                  {isRefreshingNarrative ? "Refreshing" : "Refresh"}
                </button>
              </div>
              <p className="hero-copy">
                {activeNarrative?.narrative ??
                  "Narrative synthesis is not available yet. Use refresh to rebuild the current summary."}
              </p>
              <p className="cluster-row--tight">
                Confidence {Math.round((activeNarrative?.confidence ?? 0.58) * 100)}% ·{" "}
                {activeNarrative?.cached ? "cached" : "fresh"} · expires{" "}
                {formatDateTime(activeNarrative?.expiresAt, "on demand")}
              </p>
              {error ? <p className="cluster-row--tight">{error}</p> : null}
            </section>
          </div>
        </article>

        <article className="panel panel--document">
          <div className="section-heading section-heading--row">
            <div>
              <p className="eyebrow">Tabbed intelligence</p>
              <strong>Overview, filings, events, and geography</strong>
            </div>
            <TabButtons activeTab={activeTab} onSelect={setActiveTab} />
          </div>

          {activeTab === "overview" ? (
            <div className="story-sections">
              <section className="panel panel--muted">
                <p className="eyebrow">Executive data</p>
                <div className="data-grid">
                  <div className="data-point">
                    <span>Registered office</span>
                    <strong>{profile.corpWatch.registeredOffice}</strong>
                  </div>
                  <div className="data-point">
                    <span>Filing completeness</span>
                    <strong>{Math.round(profile.corpWatch.filingCompleteness)}%</strong>
                  </div>
                  <div className="data-point">
                    <span>Paid-up capital</span>
                    <strong>{formatCurrency(profile.corpWatch.paidUpCapitalInr)}</strong>
                  </div>
                  <div className="data-point">
                    <span>Compliance breaches</span>
                    <strong>{profile.corpWatch.complianceBreachCount}</strong>
                  </div>
                </div>
              </section>

              <section className="panel panel--muted">
                <p className="eyebrow">Directors</p>
                <div className="list-stack">
                  {profile.corpWatch.directors.length > 0 ? (
                    profile.corpWatch.directors.map((director) => (
                      <div key={`${director.name}-${director.role}`} className="feed-card">
                        <strong>{director.name}</strong>
                        <p>{director.role}</p>
                      </div>
                    ))
                  ) : (
                    <div className="feed-card">
                      <strong>No director roster yet</strong>
                      <p>Director and officer data will appear here when the corp_watch profile is populated.</p>
                    </div>
                  )}
                </div>
              </section>

              <section className="panel panel--muted">
                <p className="eyebrow">Shareholders</p>
                <div className="list-stack">
                  {profile.corpWatch.shareholders.length > 0 ? (
                    profile.corpWatch.shareholders.map((shareholder) => (
                      <div key={`${shareholder.name}-${shareholder.stake}`} className="feed-card">
                        <strong>{shareholder.name}</strong>
                        <p>{shareholder.stake}% stake</p>
                      </div>
                    ))
                  ) : (
                    <div className="feed-card">
                      <strong>No shareholder table yet</strong>
                      <p>Ownership exposure will appear here when structured corp_watch data is available.</p>
                    </div>
                  )}
                </div>
              </section>
            </div>
          ) : null}

          {activeTab === "filings" ? (
            <div className="list-stack">
              {filings.length > 0 ? (
                filings.map((filing) => (
                  <div key={filing.documentId} className="feed-card">
                    <div className="feed-card__meta">
                      <span className="pill pill--cyan">{filing.docType}</span>
                      <span>{formatDateTime(filing.publishedAt, "pending publication")}</span>
                    </div>
                    <strong>{filing.title}</strong>
                    <p>{filing.sourceName}</p>
                    <p>{filing.excerpt}</p>
                    {filing.fetchUrl ? (
                      <a href={filing.fetchUrl} target="_blank" rel="noreferrer">
                        Open filing source
                      </a>
                    ) : null}
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

          {activeTab === "events" ? (
            <div className="list-stack">
              {events.length > 0 ? (
                events.map((event) => (
                  <div key={event.eventId} className="feed-card">
                    <div className="feed-card__meta">
                      <span className={severityPill(event.severity)}>{event.severity}</span>
                      <span>{formatDateTime(event.occurredAt, "pending time")}</span>
                    </div>
                    <strong>{event.title}</strong>
                    <p>{event.summary ?? `${event.eventType} signal linked to this entity.`}</p>
                    <p>{event.sourceName ?? "Source pending"}</p>
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

          {activeTab === "geography" ? (
            <div className="story-sections">
              <section className="panel panel--muted">
                <p className="eyebrow">Registered footprint</p>
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
                    <strong>
                      {profile.location.lat ?? "?"}, {profile.location.lon ?? "?"}
                    </strong>
                  </div>
                </div>
              </section>
              <section className="panel panel--muted">
                <p className="eyebrow">Entity-linked event trail</p>
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

        <aside className="panel">
          <p className="eyebrow">Relationship graph</p>
          <div className="graph-surface">
            <div className="graph-node graph-node--primary">{entityBadge(profile.canonicalName)}</div>
            {graphNodes.map((node) => (
              <Link key={node.entityId} href={`/corpwatch/${node.entityId}`} className="graph-node graph-node--secondary">
                {entityBadge(node.name)}
              </Link>
            ))}
          </div>

          <div className="list-stack">
            {graphEdges.length > 0 ? (
              graphEdges.map((edge) => (
                <Link key={edge.relationshipId} href={`/corpwatch/${edge.targetEntityId}`} className="feed-card">
                  <div className="feed-card__meta">
                    <span className="pill">{edge.relationshipType}</span>
                    <span>{Math.round(edge.confidence * 100)}% confidence</span>
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
                <p>Relationship edges will populate when cross-entity links are projected for this entity.</p>
              </div>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}
