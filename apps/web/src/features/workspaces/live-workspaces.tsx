import type { BriefingsWorkspaceData } from "@/lib/workspaces/briefings";
import type { CorpWatchWorkspaceData } from "@/lib/workspaces/corpwatch";
import type { InvestigationsWorkspaceData } from "@/lib/workspaces/investigations";
import type { LexPulseWorkspaceData } from "@/lib/workspaces/lexpulse";
import { formatDate, formatDateTime } from "@/lib/workspaces/formatting";
import type { WatchlistsWorkspaceData } from "@/lib/workspaces/watchlists";
import { WorkspaceMetricStrip, WorkspaceTabs } from "@/features/workspaces/workspace-primitives";
import { WatchlistsInteractiveWorkspace } from "@/features/watchlists/watchlists-workspace";

function entityBadge(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 4);
}

function statusPill(status: string) {
  switch (status) {
    case "active":
    case "published":
    case "approved":
      return "pill pill--primary";
    case "under_review":
    case "under_review":
    case "triaged":
      return "pill pill--cyan";
    case "closed":
    case "resolved":
      return "pill pill--low";
    default:
      return "pill";
  }
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

export function CorpWatchWorkspace({ data }: { data: CorpWatchWorkspaceData }) {
  const graphNodes = data.featured.keyRelationships.slice(0, 3);

  return (
    <section className="workspace-screen">
      <WorkspaceMetricStrip items={data.metrics} />

      <div className="workspace-columns workspace-columns--three">
        <article className="panel panel--document">
          <div className="section-heading">
            <p className="eyebrow">Entity Hero</p>
            <WorkspaceTabs
              items={[
                data.featured.entityType,
                data.isFallback ? "fallback" : "projection",
                data.featured.companyStatus,
              ]}
              active={data.featured.entityType}
            />
          </div>
          <h1 className="hero-title">{data.featured.name}</h1>
          <p className="hero-copy">{data.featured.description}</p>

          <div className="story-sections">
            <section className="panel panel--muted">
              <p className="eyebrow">Risk summary</p>
              <ul className="timeline-list">
                {data.featured.recentEvents.slice(0, 3).map((event) => (
                  <li key={event.eventId}>
                    {event.title} · {formatDateTime(event.occurredAt)}
                  </li>
                ))}
                {data.featured.aliases.length > 0 ? (
                  <li>Aliases: {data.featured.aliases.join(", ")}</li>
                ) : null}
                {data.featured.externalIds.length > 0 ? (
                  <li>
                    External IDs:{" "}
                    {data.featured.externalIds.map((entry) => `${entry.label} ${entry.value}`).join(" · ")}
                  </li>
                ) : null}
              </ul>
            </section>
            <section className="panel panel--muted">
              <p className="eyebrow">Executive data</p>
              <div className="data-grid">
                <div className="data-point">
                  <span>Location</span>
                  <strong>{data.featured.locationLabel}</strong>
                </div>
                <div className="data-point">
                  <span>Sector</span>
                  <strong>{data.featured.sector}</strong>
                </div>
                <div className="data-point">
                  <span>Risk / health</span>
                  <strong>
                    {Math.round(data.featured.riskScore)} / {Math.round(data.featured.healthScore)}
                  </strong>
                </div>
                <div className="data-point">
                  <span>Last filing</span>
                  <strong>{formatDate(data.featured.lastFilingDate, "Not filed in projection")}</strong>
                </div>
              </div>
            </section>
          </div>
        </article>

        <aside className="panel panel--muted">
          <p className="eyebrow">Relationship Graph</p>
          <div className="graph-surface">
            <div className="graph-node graph-node--primary">{entityBadge(data.featured.name)}</div>
            {graphNodes.map((relationship) => (
              <div key={relationship.entityId} className="graph-node graph-node--secondary">
                {entityBadge(relationship.name)}
              </div>
            ))}
          </div>
        </aside>

        <aside className="panel">
          <p className="eyebrow">Monitoring Rail</p>
          <div className="list-stack">
            {data.trackedEntities.map((entity) => (
              <div key={entity.entityId} className={`feed-card${entity.entityId === data.featured.entityId ? " is-active" : ""}`}>
                <div className="feed-card__meta">
                  <span className={entity.riskScore >= 70 ? "pill pill--critical" : "pill pill--cyan"}>
                    risk {Math.round(entity.riskScore) || "warming"}
                  </span>
                  <span>{formatDateTime(entity.updatedAt, "Pending projection")}</span>
                </div>
                <strong>{entity.name}</strong>
                <p>
                  {entity.relationshipCount} linked relationships · {entity.eventCount} recent entity signals
                </p>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}

export function LexPulseWorkspace({ data }: { data: LexPulseWorkspaceData }) {
  return (
    <section className="workspace-screen">
      <article className="panel panel--document">
        <div className="section-heading section-heading--row">
          <div>
            <p className="eyebrow">Regulatory Terminal</p>
            <h2>LexPulse answer surface</h2>
          </div>
          <span className={`pill${data.isFallback ? "" : " pill--cyan"}`}>
            {data.isFallback ? "canonical fallback" : "projection-backed"}
          </span>
        </div>
        <label className="command-bar">
          <span className="material-symbols-outlined">gavel</span>
          <input value={data.queryText} readOnly />
          <span className="command-bar__hint">RAG</span>
        </label>

        <div className="workspace-columns workspace-columns--three">
          <article className="panel panel--muted">
            <p className="eyebrow">Direct answer</p>
            <div className="cluster-row">
              <span className={severityPill(data.featured.severity)}>{data.featured.severity}</span>
              <span className="pill">{data.featured.regulatorLabel}</span>
            </div>
            <p className="hero-copy">{data.featured.answer}</p>
          </article>
          <article className="panel panel--muted">
            <p className="eyebrow">Change summary</p>
            <ul className="timeline-list">
              {data.featured.changeSummary.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            {data.recent.length > 0 ? (
              <div className="list-stack">
                {data.recent.slice(0, 2).map((digest) => (
                  <div key={digest.eventId} className="feed-card">
                    <strong>{digest.title}</strong>
                    <p>
                      {digest.regulatorLabel} · effective {formatDate(digest.effectiveDate, "pending")}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
          </article>
          <aside className="panel">
            <p className="eyebrow">Evidence rail</p>
            <div className="list-stack">
              {data.featured.evidence.length > 0 ? (
                data.featured.evidence.map((document) => (
                  <div key={document.documentId} className="feed-card">
                    <strong>{document.title}</strong>
                    <p>
                      {document.docType} · {document.linkType} · {formatDate(document.publishedAt, "pending")}
                    </p>
                  </div>
                ))
              ) : (
                <div className="feed-card">
                  <strong>No linked documents yet</strong>
                  <p>Evidence rail will populate from event-document links or digest documents.</p>
                </div>
              )}
            </div>
          </aside>
        </div>
      </article>
    </section>
  );
}

export function WatchlistsWorkspace({ data }: { data: WatchlistsWorkspaceData }) {
  return <WatchlistsInteractiveWorkspace data={data} />;
}

export function InvestigationsWorkspace({ data }: { data: InvestigationsWorkspaceData }) {
  return (
    <section className="workspace-screen">
      <div className="workspace-columns workspace-columns--three investigations-layout">
        <aside className="panel panel--muted">
          <p className="eyebrow">Case directory</p>
          <div className="list-stack">
            {data.cases.map((investigation) => (
              <div
                key={investigation.investigationId}
                className={`feed-card${
                  investigation.investigationId === data.featured.investigationId ? " is-active" : ""
                }`}
              >
                <strong>{investigation.investigationId.slice(0, 8).toUpperCase()}</strong>
                <p>{investigation.title}</p>
              </div>
            ))}
          </div>
        </aside>

        <article className="panel panel--document">
          <p className="eyebrow">Case hero</p>
          <h1 className="hero-title">{data.featured.title}</h1>
          <p className="hero-copy">{data.featured.description}</p>
          <div className="story-sections">
            <section className="panel panel--muted">
              <p className="eyebrow">Evidence chain</p>
              <ul className="timeline-list">
                {data.evidenceChain.map((entry) => (
                  <li key={entry}>{entry}</li>
                ))}
              </ul>
            </section>
            <section className="panel panel--muted">
              <p className="eyebrow">Timeline</p>
              <ul className="timeline-list">
                {data.timeline.map((entry) => (
                  <li key={entry}>{entry}</li>
                ))}
              </ul>
            </section>
          </div>
        </article>

        <aside className="panel">
          <p className="eyebrow">Case integrity rail</p>
          <div className="data-grid">
            <div className="data-point">
              <span>Status</span>
              <strong>{data.featured.status}</strong>
            </div>
            <div className="data-point">
              <span>Confidence</span>
              <strong>{data.featured.confidence === null ? "pending" : data.featured.confidence.toFixed(2)}</strong>
            </div>
            <div className="data-point">
              <span>Evidence docs</span>
              <strong>{data.featured.evidenceCount}</strong>
            </div>
            <div className="data-point">
              <span>Owner</span>
              <strong>{data.featured.ownerName}</strong>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

export function BriefingsWorkspace({ data }: { data: BriefingsWorkspaceData }) {
  return (
    <section className="workspace-screen">
      <div className="workspace-columns workspace-columns--three briefings-layout">
        <aside className="panel panel--muted">
          <p className="eyebrow">Library rail</p>
          <div className="list-stack">
            {data.briefings.map((briefing) => (
              <div
                key={briefing.briefingId}
                className={`feed-card${briefing.briefingId === data.featured.briefingId ? " is-active" : ""}`}
              >
                <div className="feed-card__meta">
                  <span className={statusPill(briefing.status)}>{briefing.status}</span>
                  <span>{briefing.audience}</span>
                </div>
                <strong>{briefing.title}</strong>
                <p>Updated {formatDateTime(briefing.updatedAt, "pending")}</p>
              </div>
            ))}
          </div>
        </aside>

        <article className="panel panel--document editorial-surface">
          <p className="eyebrow">Publication surface</p>
          <h1 className="hero-title">{data.featured.title}</h1>
          <p className="hero-copy">
            {data.isFallback
              ? "The authored briefing surface is ready and now reads from workflow.briefings plus workflow.briefing_versions."
              : `Audience: ${data.featured.audience}`}
          </p>
          <section className="note-card">
            <p className="eyebrow">Executive overview</p>
            <p>{data.featured.executiveOverview}</p>
          </section>
          <section className="story-sections">
            <div className="panel panel--muted">
              <p className="eyebrow">Sections</p>
              <ul className="timeline-list">
                {data.featured.sectionTitles.map((section) => (
                  <li key={section}>{section}</li>
                ))}
              </ul>
            </div>
            <div className="panel panel--muted">
              <p className="eyebrow">Distribution</p>
              <ul className="timeline-list">
                {data.distribution.map((entry) => (
                  <li key={entry}>{entry}</li>
                ))}
              </ul>
            </div>
          </section>
        </article>

        <aside className="panel">
          <p className="eyebrow">Briefing AI rail</p>
          <div className="list-stack">
            {data.assistantNotes.map((note) => (
              <div key={note} className="feed-card">
                <strong>Editorial signal</strong>
                <p>{note}</p>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}
