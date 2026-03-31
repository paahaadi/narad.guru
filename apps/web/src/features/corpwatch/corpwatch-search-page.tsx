"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useState } from "react";
import type { CorpWatchWorkspaceData } from "@/lib/workspaces/corpwatch";
import { searchEntities } from "@/lib/workspaces/corpwatch-client";
import type { CorpWatchSearchResult } from "@/lib/workspaces/corpwatch-types";
import { formatDate, formatDateTime } from "@/lib/workspaces/formatting";
import { WorkspaceMetricStrip } from "@/features/workspaces/workspace-primitives";

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

function resultHeadline(result: CorpWatchSearchResult) {
  if (result.description) {
    return result.description;
  }
  if (result.aliases.length > 0) {
    return `Aliases: ${result.aliases.join(", ")}`;
  }
  return "Entity profile ready for deep inspection.";
}

export function CorpWatchSearchPage({ data }: { data: CorpWatchWorkspaceData }) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim());
  const [results, setResults] = useState<CorpWatchSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (deferredQuery.length < 2) {
      setResults([]);
      setIsSearching(false);
      setError(null);
      return;
    }

    let isCancelled = false;
    setIsSearching(true);

    void searchEntities(deferredQuery, { limit: 10 })
      .then((items) => {
        if (isCancelled) {
          return;
        }
        setResults(items);
        setError(null);
      })
      .catch((reason) => {
        if (isCancelled) {
          return;
        }
        setResults([]);
        setError(reason instanceof Error ? reason.message : "Unable to search entities");
      })
      .finally(() => {
        if (!isCancelled) {
          setIsSearching(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [deferredQuery]);

  return (
    <section className="workspace-screen">
      <WorkspaceMetricStrip items={data.metrics} />

      <div className="workspace-columns workspace-columns--three">
        <article className="panel panel--document">
          <div className="section-heading section-heading--row">
            <div>
              <p className="eyebrow">Entity Search</p>
              <h1 className="hero-title">CorpWatch intelligence desk</h1>
            </div>
            <span className={`pill${data.isFallback ? "" : " pill--cyan"}`}>
              {data.isFallback ? "core fallback" : "projection-backed"}
            </span>
          </div>

          <label className="command-bar" aria-label="Search CorpWatch entities">
            <span className="material-symbols-outlined">travel_explore</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search company, director, CIN, ISIN, LLPIN"
            />
            <span className="command-bar__hint">Search</span>
          </label>

          <div className="list-stack">
            {error ? (
              <div className="feed-card">
                <strong>Search unavailable</strong>
                <p>{error}</p>
              </div>
            ) : null}

            {deferredQuery.length >= 2 ? (
              <>
                <div className="feed-card is-active">
                  <div className="feed-card__meta">
                    <span className="pill pill--primary">
                      {isSearching ? "searching" : `${results.length} results`}
                    </span>
                    <span>{deferredQuery}</span>
                  </div>
                  <strong>Structured and fuzzy entity search</strong>
                  <p>Matches combine exact IDs, text search, and projection-backed entity metadata.</p>
                </div>

                {results.map((result) => (
                  <Link key={result.entityId} href={`/corpwatch/${result.entityId}`} className="feed-card">
                    <div className="feed-card__meta">
                      <span className={riskPill(result.riskScore)}>
                        risk {Math.round(result.riskScore) || "warming"}
                      </span>
                      <span>{result.matchType}</span>
                    </div>
                    <strong>{result.canonicalName}</strong>
                    <p>{resultHeadline(result)}</p>
                    <p>
                      {result.entityType} · {result.locationLabel} · updated{" "}
                      {formatDateTime(result.updatedAt, "recently")}
                    </p>
                  </Link>
                ))}

                {!isSearching && results.length === 0 ? (
                  <div className="feed-card">
                    <strong>No entity matches yet</strong>
                    <p>Try a shorter company name, alias, or structured identifier.</p>
                  </div>
                ) : null}
              </>
            ) : (
              data.trackedEntities.map((entity) => (
                <Link key={entity.entityId} href={`/corpwatch/${entity.entityId}`} className="feed-card">
                  <div className="feed-card__meta">
                    <span className={riskPill(entity.riskScore)}>risk {Math.round(entity.riskScore) || "warming"}</span>
                    <span>{formatDateTime(entity.updatedAt, "projection pending")}</span>
                  </div>
                  <strong>{entity.name}</strong>
                  <p>
                    {entity.relationshipCount} relationships · {entity.eventCount} recent signals
                  </p>
                </Link>
              ))
            )}
          </div>
        </article>

        <article className="panel panel--document">
          <div className="section-heading">
            <p className="eyebrow">Featured Profile</p>
            <div className="cluster-row">
              <span className={riskPill(data.featured.riskScore)}>
                risk {Math.round(data.featured.riskScore) || "warming"}
              </span>
              <span className="pill">{data.featured.companyStatus}</span>
              <span className="pill">{data.featured.sector}</span>
            </div>
          </div>

          <h2 className="hero-title">{data.featured.name}</h2>
          <p className="hero-copy">{data.featured.description}</p>

          <div className="story-sections">
            <section className="panel panel--muted">
              <p className="eyebrow">Current posture</p>
              <div className="data-grid">
                <div className="data-point">
                  <span>Location</span>
                  <strong>{data.featured.locationLabel}</strong>
                </div>
                <div className="data-point">
                  <span>Risk / health</span>
                  <strong>
                    {Math.round(data.featured.riskScore)} / {Math.round(data.featured.healthScore)}
                  </strong>
                </div>
                <div className="data-point">
                  <span>Last filing</span>
                  <strong>{formatDate(data.featured.lastFilingDate, "Projection pending")}</strong>
                </div>
                <div className="data-point">
                  <span>Completeness</span>
                  <strong>{Math.round(data.featured.filingCompleteness)}%</strong>
                </div>
              </div>
            </section>

            <section className="panel panel--muted">
              <p className="eyebrow">Why inspect now</p>
              <ul className="timeline-list">
                {data.featured.recentEvents.slice(0, 3).map((event) => (
                  <li key={event.eventId}>
                    {event.title} · {formatDateTime(event.occurredAt, "Awaiting timestamp")}
                  </li>
                ))}
                {data.featured.externalIds.length > 0 ? (
                  <li>
                    IDs: {data.featured.externalIds.map((entry) => `${entry.label} ${entry.value}`).join(" · ")}
                  </li>
                ) : null}
              </ul>
            </section>
          </div>

          <Link href={`/corpwatch/${data.featured.entityId}`} className="feed-card is-active">
            <div className="feed-card__meta">
              <span className="pill pill--primary">Open desk</span>
              <span>{data.featured.entityType}</span>
            </div>
            <strong>View full entity profile</strong>
            <p>Open filings, events, relationships, and narrative synthesis for this entity.</p>
          </Link>
        </article>

        <aside className="panel">
          <p className="eyebrow">Monitoring Rail</p>
          <div className="list-stack">
            {data.trackedEntities.map((entity) => (
              <Link
                key={entity.entityId}
                href={`/corpwatch/${entity.entityId}`}
                className={`feed-card${entity.entityId === data.featured.entityId ? " is-active" : ""}`}
              >
                <div className="feed-card__meta">
                  <span className={riskPill(entity.riskScore)}>
                    risk {Math.round(entity.riskScore) || "warming"}
                  </span>
                  <span>{entity.eventCount} events</span>
                </div>
                <strong>{entity.name}</strong>
                <p>
                  {entity.companyStatus} · {entity.relationshipCount} relationships · {entity.locationLabel}
                </p>
              </Link>
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}
