"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useState } from "react";
import type { CorpWatchWorkspaceData } from "@/lib/workspaces/corpwatch";
import { searchEntities } from "@/lib/workspaces/corpwatch-client";
import type { CorpWatchSearchResult } from "@/lib/workspaces/corpwatch-types";
import { formatDate, formatDateTime } from "@/lib/workspaces/formatting";

function riskPill(score: number) {
  if (score >= 70) return "pill pill--critical";
  if (score >= 40) return "pill pill--high";
  if (score > 0) return "pill pill--cyan";
  return "pill";
}

function riskBorder(score: number) {
  if (score >= 70) return "risk-critical";
  if (score >= 40) return "risk-high";
  if (score > 0) return "risk-medium";
  return "risk-low";
}

function resultHeadline(result: CorpWatchSearchResult) {
  if (result.description) return result.description;
  if (result.aliases.length > 0) return `Aliases: ${result.aliases.join(", ")}`;
  return "Entity profile ready for deep inspection.";
}

function RiskGauge({ score, size = 56 }: { score: number; size?: number }) {
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
      <span className="risk-gauge__label" style={{ color }}>
        {score > 0 ? Math.round(score) : "–"}
      </span>
    </div>
  );
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
        if (isCancelled) return;
        setResults(items);
        setError(null);
      })
      .catch((reason) => {
        if (isCancelled) return;
        setResults([]);
        setError(reason instanceof Error ? reason.message : "Unable to search entities");
      })
      .finally(() => {
        if (!isCancelled) setIsSearching(false);
      });

    return () => { isCancelled = true; };
  }, [deferredQuery]);

  return (
    <section className="workspace-screen" style={{ paddingBottom: "3rem" }}>
      {/* ── Sovereign Metric Strip ── */}
      <div className="metric-strip">
        {data.metrics.map((item) => (
          <article
            key={item.label}
            className={`metric-card metric-card--sovereign${item.accent ? ` ${item.accent}` : ""}`}
          >
            <span className="metric-card__label">{item.label}</span>
            <strong className="metric-card__value">{item.value}</strong>
            {item.meta ? (
              <p className="cluster-row--tight" style={{ marginTop: "0.25rem" }}>
                {item.meta}
              </p>
            ) : null}
          </article>
        ))}
      </div>

      {/* ── Three-Column Layout ── */}
      <div className="corpwatch-layout">
        {/* ── Search & Results ── */}
        <article className="panel panel--document corpwatch-layout__profile">
          <div className="section-heading" style={{ marginBottom: "1.25rem" }}>
            <p className="eyebrow">Entity Search</p>
            <h1 className="hero-title" style={{ fontSize: "1.5rem" }}>
              CorpWatch Intelligence Desk
            </h1>
            <div className="cluster-row" style={{ marginTop: "0.45rem" }}>
              <span className={`pill${data.isFallback ? "" : " pill--cyan"}`}>
                {data.isFallback ? "core fallback" : "projection-backed"}
              </span>
            </div>
          </div>

          <label className="command-bar" aria-label="Search CorpWatch entities" style={{ marginBottom: "1.2rem" }}>
            <span className="material-symbols-outlined">travel_explore</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search company, director, CIN, ISIN, LLPIN"
            />
            <span className="command-bar__hint">⌘K</span>
          </label>

          <div className="list-stack">
            {error ? (
              <div className="feed-card entity-card--sovereign risk-critical">
                <strong>Search unavailable</strong>
                <p>{error}</p>
              </div>
            ) : null}

            {deferredQuery.length >= 2 ? (
              <>
                <div className="feed-card is-active">
                  <div className="feed-card__meta">
                    <span className="pill pill--primary">
                      {isSearching ? "scanning" : `${results.length} results`}
                    </span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.72rem" }}>
                      {deferredQuery}
                    </span>
                  </div>
                  <strong>Structured and fuzzy entity search</strong>
                  <p>Matches combine exact IDs, text search, and projection-backed entity metadata.</p>
                </div>

                {results.map((result) => (
                  <Link
                    key={result.entityId}
                    href={`/corpwatch/${result.entityId}`}
                    className={`feed-card entity-card--sovereign ${riskBorder(result.riskScore)}`}
                  >
                    <div className="feed-card__meta">
                      <span className={riskPill(result.riskScore)}>
                        risk {Math.round(result.riskScore) || "warming"}
                      </span>
                      <span>{result.matchType}</span>
                    </div>
                    <strong>{result.canonicalName}</strong>
                    <p>{resultHeadline(result)}</p>
                    <p style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>
                      {result.entityType} · {result.locationLabel || "Location pending"} · updated{" "}
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
                <Link
                  key={entity.entityId}
                  href={`/corpwatch/${entity.entityId}`}
                  className={`feed-card entity-card--sovereign ${riskBorder(entity.riskScore)}`}
                >
                  <div className="feed-card__meta">
                    <span className={riskPill(entity.riskScore)}>
                      risk {Math.round(entity.riskScore) || "warming"}
                    </span>
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

        {/* ── Spotlight Dossier (Featured Profile) ── */}
        <article className="panel panel--document corpwatch-layout__intel">
          <div className="dossier-banner" style={{ marginBottom: "1.25rem" }}>
            <div className="dossier-banner__seal">
              {data.featured.name
                .split(/\s+/)
                .slice(0, 2)
                .map((w) => w[0]?.toUpperCase() ?? "")
                .join("")}
            </div>
            <div className="dossier-banner__body">
              <p className="eyebrow">Spotlight Dossier</p>
              <h1>{data.featured.name}</h1>
              <div className="cluster-row" style={{ marginTop: "0.4rem" }}>
                <span className={riskPill(data.featured.riskScore)}>
                  risk {Math.round(data.featured.riskScore) || "warming"}
                </span>
                <span className="pill">{data.featured.companyStatus}</span>
                <span className="pill">{data.featured.sector}</span>
              </div>
            </div>
            <RiskGauge score={data.featured.riskScore} />
          </div>

          <p className="hero-copy" style={{ marginBottom: "1.2rem" }}>{data.featured.description}</p>

          <div className="story-sections">
            <section className="panel panel--muted">
              <p className="eyebrow">Current Posture</p>
              <div className="data-grid">
                <div className="data-point">
                  <span>Location</span>
                  <strong>{data.featured.locationLabel}</strong>
                </div>
                <div className="data-point">
                  <span>Risk / Health</span>
                  <strong>
                    {Math.round(data.featured.riskScore)} / {Math.round(data.featured.healthScore)}
                  </strong>
                </div>
                <div className="data-point">
                  <span>Last Filing</span>
                  <strong>{formatDate(data.featured.lastFilingDate, "Projection pending")}</strong>
                </div>
                <div className="data-point">
                  <span>Completeness</span>
                  <strong>{Math.round(data.featured.filingCompleteness)}%</strong>
                </div>
              </div>
            </section>

            <section className="panel panel--muted">
              <p className="eyebrow">Why Inspect Now</p>
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

          <Link
            href={`/corpwatch/${data.featured.entityId}`}
            className="feed-card is-active"
            style={{ marginTop: "1rem" }}
          >
            <div className="feed-card__meta">
              <span className="pill pill--primary">Open Desk</span>
              <span>{data.featured.entityType}</span>
            </div>
            <strong>View full entity profile</strong>
            <p>Open filings, events, relationships, and narrative synthesis for this entity.</p>
          </Link>
        </article>

        {/* ── Watchlist Rail ── */}
        <aside className="panel corpwatch-layout__rail">
          <div className="section-heading">
            <p className="eyebrow">Watchlist Rail</p>
            <h2 style={{ fontSize: "1.1rem", marginTop: "0.15rem" }}>Tracked Entities</h2>
          </div>

          <div className="list-stack">
            {data.trackedEntities.map((entity) => (
              <Link
                key={entity.entityId}
                href={`/corpwatch/${entity.entityId}`}
                className={`feed-card entity-card--sovereign ${riskBorder(entity.riskScore)}${
                  entity.entityId === data.featured.entityId ? " is-active" : ""
                }`}
              >
                <div className="feed-card__meta">
                  <span className={riskPill(entity.riskScore)}>
                    risk {Math.round(entity.riskScore) || "warming"}
                  </span>
                  <span>{entity.eventCount} events</span>
                </div>
                <strong>{entity.name}</strong>
                <p>
                  {entity.companyStatus} · {entity.relationshipCount} rel · {entity.locationLabel}
                </p>
              </Link>
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}
