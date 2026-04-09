"use client";

import { startTransition, useEffect, useState, useTransition } from "react";
import { WorkspaceMetricStrip } from "@/features/workspaces/workspace-primitives";
import {
  getDigest,
  getDigests,
  getSectorForecasts,
  getWatchlists,
  queryRegulatory,
  submitFeedback,
  type LexPulseEvidence,
} from "@/lib/workspaces/lexpulse-client";
import { formatDate, formatDateTime, formatMetric } from "@/lib/workspaces/formatting";
import type { LexPulseWorkspaceData } from "@/lib/workspaces/lexpulse";
import type {
  LexPulseAnswer,
  LexPulseEvidenceDocument,
  LexPulseDigestSummary,
  LexPulseSectorForecast,
  LexPulseWatchlist,
} from "@/lib/workspaces/lexpulse-types";

type LexPulseWorkspaceTerminalProps = {
  initialData: LexPulseWorkspaceData;
};

function severityClass(severity: string) {
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

function confidenceLabel(confidence: number) {
  return `${Math.round(confidence * 100)}% confidence`;
}

function trustLabel(score: number) {
  return `${Math.round(score * 100)}% trust`;
}

function isRichEvidence(
  document: LexPulseEvidenceDocument | LexPulseEvidence,
): document is LexPulseEvidenceDocument {
  return "trustScore" in document;
}

function formatEvidenceLinkLabel(documentId: string) {
  return documentId.slice(0, 8).toUpperCase();
}

function summarizeSectors(sectors: string[]) {
  return sectors.length > 0 ? sectors.join(" · ") : "No sectors classified yet";
}

function DigestPreview({
  digest,
  active,
  onSelect,
  loading,
}: {
  digest: LexPulseDigestSummary;
  active: boolean;
  onSelect: (digestId: string) => void;
  loading: boolean;
}) {
  return (
    <button
      type="button"
      className={`feed-card${active ? " is-active" : ""}`}
      onClick={() => onSelect(digest.digestId)}
    >
      <div className="feed-card__meta">
        <span className={severityClass(digest.severity)}>{digest.severity}</span>
        <span>{digest.regulatorLabel}</span>
      </div>
      <strong>{digest.title}</strong>
      <p>{digest.whyItMatters}</p>
      <div className="cluster-row cluster-row--tight">
        <span>{formatDate(digest.effectiveDate, "Pending date")}</span>
        <span>{loading && active ? "Refreshing" : digest.evidence.length ? `${digest.evidence.length} sources` : "No sources"}</span>
      </div>
    </button>
  );
}

export function LexPulseWorkspaceTerminal({ initialData }: LexPulseWorkspaceTerminalProps) {
  const [queryText, setQueryText] = useState(initialData.queryText);
  const [answer, setAnswer] = useState<LexPulseAnswer | null>(null);
  const [watchlists, setWatchlists] = useState<LexPulseWatchlist[]>([]);
  const [digests, setDigests] = useState<LexPulseDigestSummary[]>([]);
  const [forecasts, setForecasts] = useState<LexPulseSectorForecast[]>([]);
  const [selectedDigestId, setSelectedDigestId] = useState<string | null>(null);
  const [selectedDigest, setSelectedDigest] = useState<LexPulseDigestSummary | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResourcesLoading, setIsResourcesLoading] = useState(true);
  const [isDigestLoadingId, setIsDigestLoadingId] = useState<string | null>(null);
  const [forceRefresh, setForceRefresh] = useState(false);
  const [resourceError, setResourceError] = useState<string | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [feedbackPending, setFeedbackPending] = useState<"up" | "down" | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;

    async function loadResources() {
      try {
        const [watchlistsResponse, digestsResponse, forecastsResponse] = await Promise.all([
          getWatchlists(),
          getDigests({ limit: 6 }),
          getSectorForecasts(),
        ]);

        if (cancelled) {
          return;
        }

        setWatchlists(watchlistsResponse);
        setDigests(digestsResponse.items);
        setForecasts(forecastsResponse);
        setSelectedDigestId(digestsResponse.items[0]?.digestId ?? null);
        setSelectedDigest(digestsResponse.items[0] ?? null);
      } catch (error) {
        if (!cancelled) {
          setResourceError(error instanceof Error ? error.message : "Unable to load LexPulse resources.");
        }
      } finally {
        if (!cancelled) {
          setIsResourcesLoading(false);
        }
      }
    }

    void loadResources();

    return () => {
      cancelled = true;
    };
  }, []);

  const activeDigest = selectedDigest ?? digests.find((digest) => digest.digestId === selectedDigestId) ?? null;
  const activeEvidence: Array<LexPulseEvidenceDocument | LexPulseEvidence> =
    answer?.evidence ?? activeDigest?.evidence ?? initialData.featured.evidence;
  const visibleAnswer = answer;
  const visibleTitle = visibleAnswer?.title ?? initialData.featured.title;
  const visibleDirectAnswer = visibleAnswer?.directAnswer ?? initialData.featured.answer;
  const visibleWhatChanged = visibleAnswer?.whatChanged ?? initialData.featured.changeSummary;
  const visibleWhyItMatters = visibleAnswer?.whyItMatters ?? initialData.featured.summary;
  const visibleAffectedSectors = visibleAnswer?.affectedSectors ?? [];
  const visibleConfidence = visibleAnswer?.confidence ?? 0;
  const metrics = [
    {
      label: "Watchlists",
      value: formatMetric(watchlists.length),
      meta: isResourcesLoading ? "Loading" : "Live data",
    },
    {
      label: "Digest cards",
      value: formatMetric(digests.length || initialData.recent.length + 1),
      accent: "accent-cyan",
      meta: initialData.isFallback ? "Baseline feed" : "Projection-backed",
    },
    {
      label: "Forecast sectors",
      value: formatMetric(forecasts.length),
      accent: "accent-orange",
      meta: isResourcesLoading ? "Loading" : "Live forecasts",
    },
    {
      label: "Confidence",
      value: answer ? confidenceLabel(answer.confidence) : "Standby",
      accent: answer ? "accent-primary" : undefined,
      meta: answer?.generatedBy ?? initialData.featured.regulatorLabel,
    },
  ];

  const suggestedPrompts = [
    queryText,
    `What changed in ${activeDigest?.title ?? initialData.featured.title}?`,
    forecasts[0]?.sectorName
      ? `Which sectors are most exposed in ${forecasts[0].sectorName}?`
      : "Which sectors are most exposed?",
    watchlists[0]?.name ? `Summarize ${watchlists[0].name} for me.` : "Summarize the latest regulatory changes.",
  ].filter((item, index, items) => item.trim().length > 0 && items.indexOf(item) === index);

  async function loadDigestDetail(digestId: string) {
    setIsDigestLoadingId(digestId);
    try {
      const detail = await getDigest(digestId);
      setDigests((current) => {
        const next = current.filter((item) => item.digestId !== detail.digestId);
        return [detail, ...next].sort((left, right) => (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""));
      });
      startTransition(() => {
        setSelectedDigestId(detail.digestId);
        setSelectedDigest(detail);
      });
    } catch (error) {
      setResourceError(error instanceof Error ? error.message : "Unable to refresh digest detail.");
    } finally {
      setIsDigestLoadingId(null);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedQuery = queryText.trim();
    if (!trimmedQuery || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setQueryError(null);
    setFeedbackMessage(null);

    try {
      const response = await queryRegulatory({
        queryText: trimmedQuery,
        forceRefresh,
      });

      startTransition(() => {
        setAnswer(response);
      });
    } catch (error) {
      setQueryError(error instanceof Error ? error.message : "Unable to answer the regulatory question.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleFeedback(rating: "up" | "down") {
    if (!answer?.cacheId || feedbackPending) {
      return;
    }

    setFeedbackPending(rating);
    setFeedbackMessage(null);

    try {
      await submitFeedback({
        queryCacheId: answer.cacheId,
        rating,
      });
      setFeedbackMessage(rating === "up" ? "Marked helpful." : "Marked not helpful.");
    } catch (error) {
      setFeedbackMessage(error instanceof Error ? error.message : "Unable to store feedback.");
    } finally {
      setFeedbackPending(null);
    }
  }

  return (
    <section className="workspace-screen">
      <WorkspaceMetricStrip items={metrics} />

      <div className="workspace-columns workspace-columns--three">
        <aside className="panel">
          <div className="section-heading">
            <p className="eyebrow">Watchlists</p>
            <h2>Operational radar</h2>
          </div>

          <div className="list-stack">
            {watchlists.length > 0 ? (
              watchlists.map((watchlist) => (
                <article key={watchlist.watchlistId} className="feed-card">
                  <div className="feed-card__meta">
                    <span className={watchlist.isActive ? "pill pill--primary" : "pill"}>{watchlist.isActive ? "active" : "paused"}</span>
                    <span>{watchlist.alertCount} alerts</span>
                  </div>
                  <strong>{watchlist.name}</strong>
                  <p>{watchlist.description || "Watchlist coverage is active and synced to the current tenant."}</p>
                  <div className="cluster-row cluster-row--tight">
                    <span>{watchlist.unresolvedAlertCount} unresolved</span>
                    <span>{formatDateTime(watchlist.updatedAt, "Awaiting update")}</span>
                  </div>
                </article>
              ))
            ) : (
              <div className="empty-surface">
                {isResourcesLoading ? "Loading watchlists..." : "No watchlists are available for this tenant yet."}
              </div>
            )}
          </div>

          <section className="panel panel--muted">
            <p className="eyebrow">Sector forecasts</p>
            <div className="list-stack">
              {forecasts.length > 0 ? (
                forecasts.map((forecast) => (
                  <article key={`${forecast.sectorName}-${forecast.periodLabel}`} className="feed-card">
                    <div className="feed-card__meta">
                      <span className="pill pill--cyan">{forecast.periodLabel}</span>
                      <span>{forecast.frictionChangePct >= 0 ? "+" : ""}
                        {Math.round(forecast.frictionChangePct)}%</span>
                    </div>
                    <strong>{forecast.sectorName}</strong>
                    <p>{forecast.narrative}</p>
                  </article>
                ))
              ) : (
                <div className="empty-surface">
                  {isResourcesLoading ? "Loading forecasts..." : "No sector forecasts available yet."}
                </div>
              )}
            </div>
          </section>
        </aside>

        <article className="panel panel--document">
          <div className="section-heading section-heading--row">
            <div>
              <p className="eyebrow">Regulatory Terminal</p>
              <h1>LexPulse</h1>
            </div>
            <div className="cluster-row">
              <span className={answer ? "pill pill--primary" : "pill pill--cyan"}>{answer ? "live answer" : "projection-backed"}</span>
              <span className="pill">{forceRefresh ? "force refresh" : "semantic cache"}</span>
            </div>
          </div>

          <form className="command-bar" onSubmit={handleSubmit}>
            <span className="material-symbols-outlined">gavel</span>
            <input
              value={queryText}
              onChange={(event) => setQueryText(event.target.value)}
              placeholder="Ask about a gazette, circular, or sector shift"
              aria-label="Regulatory question"
            />
            <button type="submit" className="pill pill--primary" disabled={isSubmitting || queryText.trim().length === 0}>
              {isSubmitting ? "Synthesizing..." : "Ask"}
            </button>
          </form>

          <div className="cluster-row cluster-row--tight" style={{ flexWrap: "wrap" }}>
            <button type="button" className="pill" onClick={() => setForceRefresh((current) => !current)}>
              {forceRefresh ? "Disable force refresh" : "Force refresh"}
            </button>
            {suggestedPrompts.map((prompt) => (
              <button key={prompt} type="button" className="pill pill--cyan" style={{ whiteSpace: "normal", textAlign: "left" }} onClick={() => setQueryText(prompt)}>
                {prompt}
              </button>
            ))}
          </div>

          {queryError ? <div className="empty-surface">{queryError}</div> : null}

          <div className="story-sections">
            <section className="panel panel--muted">
              <p className="eyebrow">Direct answer</p>
              <div className="cluster-row">
                <span className={answer ? "pill pill--primary" : "pill pill--cyan"}>{answer ? answer.generatedBy : initialData.isFallback ? "fallback" : "projection"}</span>
                <span className={answer ? "pill" : "pill pill--low"}>{answer ? (answer.cached ? "cached" : "fresh") : "baseline"}</span>
                <span className="pill">{answer ? confidenceLabel(answer.confidence) : "awaiting query"}</span>
              </div>
              <h2 className="hero-title">{visibleTitle}</h2>
              <p className="hero-copy">{visibleDirectAnswer}</p>
              <div className="data-grid">
                <div className="data-point">
                  <span>Confidence</span>
                  <strong>{answer ? confidenceLabel(visibleConfidence) : "Standby"}</strong>
                </div>
                <div className="data-point">
                  <span>Generated by</span>
                  <strong>{answer?.generatedBy ?? initialData.featured.regulatorLabel}</strong>
                </div>
                <div className="data-point">
                  <span>Cache</span>
                  <strong>{answer?.cacheId ? answer.cacheId.slice(0, 8).toUpperCase() : "None"}</strong>
                </div>
                <div className="data-point">
                  <span>Evidence</span>
                  <strong>{activeEvidence.length}</strong>
                </div>
              </div>
            </section>

            <section className="panel panel--muted">
              <p className="eyebrow">What changed</p>
              <ul className="timeline-list">
                {visibleWhatChanged.length > 0 ? (
                  visibleWhatChanged.map((item) => <li key={item}>{item}</li>)
                ) : (
                  <li>Run a query to synthesize the latest regulatory changes.</li>
                )}
              </ul>
              <p className="eyebrow">Why it matters</p>
              <p className="hero-copy">{visibleWhyItMatters}</p>
              <p className="eyebrow">Affected sectors</p>
              <div className="cluster-row">
                {visibleAffectedSectors.length > 0 ? (
                  visibleAffectedSectors.map((sector) => (
                    <span key={sector} className="pill pill--cyan">
                      {sector}
                    </span>
                  ))
                ) : (
                  <span className="pill">No sectors classified</span>
                )}
              </div>
            </section>
          </div>

          <div className="story-sections">
            <section className="panel panel--muted">
              <p className="eyebrow">Baseline dossier</p>
              <div className="feed-card is-active">
                <div className="feed-card__meta">
                  <span className={severityClass(initialData.featured.severity)}>{initialData.featured.severity}</span>
                  <span>{initialData.featured.regulatorLabel}</span>
                </div>
                <strong>{initialData.featured.title}</strong>
                <p>{initialData.featured.answer}</p>
                <div className="cluster-row cluster-row--tight">
                  <span>{formatDate(initialData.featured.effectiveDate, "Pending effective date")}</span>
                  <span>{initialData.featured.evidence.length} linked sources</span>
                </div>
              </div>

              {initialData.recent.length > 0 ? (
                <div className="list-stack">
                  {initialData.recent.slice(0, 3).map((digest) => (
                    <div key={digest.eventId} className="feed-card">
                      <div className="feed-card__meta">
                        <span className={severityClass(digest.severity)}>{digest.severity}</span>
                        <span>{digest.regulatorLabel}</span>
                      </div>
                      <strong>{digest.title}</strong>
                      <p>{digest.summary}</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>

            <section className="panel panel--muted">
              <p className="eyebrow">Recent digests</p>
              <div className="list-stack">
                {digests.length > 0 ? (
                  digests.map((digest) => (
                    <DigestPreview
                      key={digest.digestId}
                      digest={digest}
                      active={digest.digestId === selectedDigestId}
                      onSelect={(digestId) => void loadDigestDetail(digestId)}
                      loading={isDigestLoadingId === digest.digestId}
                    />
                  ))
                ) : (
                  <div className="empty-surface">
                    {isResourcesLoading ? "Loading digests..." : "No digest projections are available yet."}
                  </div>
                )}
              </div>

              {activeDigest ? (
                <div className="story-sections">
                  <section className="panel panel--muted">
                    <p className="eyebrow">Digest detail</p>
                    <h3 className="hero-title">{activeDigest.title}</h3>
                    <p className="hero-copy">{activeDigest.summary}</p>
                    <div className="data-grid">
                      <div className="data-point">
                        <span>Effective date</span>
                        <strong>{formatDate(activeDigest.effectiveDate, "TBD")}</strong>
                      </div>
                      <div className="data-point">
                        <span>Severity</span>
                        <strong>{activeDigest.severity}</strong>
                      </div>
                      <div className="data-point">
                        <span>Updated</span>
                        <strong>{formatDateTime(activeDigest.updatedAt, "Pending")}</strong>
                      </div>
                      <div className="data-point">
                        <span>Sources</span>
                        <strong>{activeDigest.evidence.length}</strong>
                      </div>
                    </div>
                  </section>
                </div>
              ) : null}
            </section>
          </div>
        </article>

        <aside className="panel panel--muted">
          <div className="section-heading">
            <p className="eyebrow">Evidence rail</p>
            <h2>Source ledger</h2>
          </div>

          <div className="list-stack">
            {activeEvidence.length > 0 ? (
              activeEvidence.map((document) => (
                <a
                  key={document.documentId}
                  href={isRichEvidence(document) ? document.fetchUrl ?? "#" : "#"}
                  className="feed-card"
                  target={isRichEvidence(document) && document.fetchUrl ? "_blank" : undefined}
                  rel={isRichEvidence(document) && document.fetchUrl ? "noreferrer" : undefined}
                >
                  <div className="feed-card__meta">
                    <span className="pill">{document.docType}</span>
                    <span>{isRichEvidence(document) ? trustLabel(document.trustScore) : document.linkType}</span>
                  </div>
                  <strong>{document.title}</strong>
                  <p>{isRichEvidence(document) ? document.excerpt : "Linked digest evidence from the regulatory timeline."}</p>
                  <div className="cluster-row cluster-row--tight">
                    <span>{isRichEvidence(document) ? document.regulator ?? "Source document" : "Digest reference"}</span>
                    <span>{document.publishedAt ? formatDateTime(document.publishedAt) : "No publish timestamp"}</span>
                  </div>
                </a>
              ))
            ) : (
              <div className="empty-surface">Evidence will appear here after a query or digest selection.</div>
            )}
          </div>

          <section className="panel panel--muted">
            <p className="eyebrow">Feedback</p>
            <div className="cluster-row">
              <button
                type="button"
                className="pill pill--primary"
                disabled={!answer?.cacheId || feedbackPending !== null}
                onClick={() => void handleFeedback("up")}
              >
                {feedbackPending === "up" ? "Saving..." : "Helpful"}
              </button>
              <button
                type="button"
                className="pill"
                disabled={!answer?.cacheId || feedbackPending !== null}
                onClick={() => void handleFeedback("down")}
              >
                {feedbackPending === "down" ? "Saving..." : "Not helpful"}
              </button>
            </div>
            <p className="cluster-row--tight">{feedbackMessage ?? "Feedback attaches to the latest answer cache entry."}</p>
          </section>

          <section className="panel panel--muted">
            <p className="eyebrow">Session state</p>
            <ul className="timeline-list">
              <li>{initialData.isFallback ? "Starting from a canonical fallback dossier." : "Starting from a projection-backed digest."}</li>
              <li>{watchlists.length > 0 ? `${watchlists.length} watchlists loaded.` : "Watchlists are still loading."}</li>
              <li>{forecasts.length > 0 ? `${forecasts.length} sector forecasts loaded.` : "Sector forecasts are still loading."}</li>
              <li>{isPending ? "Transitioning digest selection." : "Ready for interactive queries."}</li>
              {resourceError ? <li>{resourceError}</li> : null}
            </ul>
          </section>
        </aside>
      </div>
    </section>
  );
}
