"use client";

import { useEffect, useState, useCallback } from "react";
import type { BriefingsWorkspaceData, BriefingDetail, BriefingSection } from "@/lib/workspaces/briefings";
import { useBriefingsStore } from "@/stores/briefings-store";
import {
  fetchBriefings,
  fetchBriefing,
  createBriefing,
  updateBriefing,
  fetchBriefingVersions,
  createBriefingVersion,
  approveBriefing,
  publishBriefing,
} from "@/lib/workspaces/briefings-client";
import { formatDateTime } from "@/lib/workspaces/formatting";

/* ── Library Rail (left) ─────────────────────────────────────────────────── */

function LibraryRail() {
  const briefings = useBriefingsStore((s) => s.briefings);
  const selectedId = useBriefingsStore((s) => s.selectedBriefingId);
  const selectBriefing = useBriefingsStore((s) => s.selectBriefing);
  const statusFilter = useBriefingsStore((s) => s.statusFilter);
  const setStatusFilter = useBriefingsStore((s) => s.setStatusFilter);
  const isCreating = useBriefingsStore((s) => s.isCreatingBriefing);
  const setIsCreating = useBriefingsStore((s) => s.setIsCreatingBriefing);
  const addBriefing = useBriefingsStore((s) => s.addBriefing);

  const [newTitle, setNewTitle] = useState("");
  const [newAudience, setNewAudience] = useState("");

  const filtered = statusFilter
    ? briefings.filter((b) => b.status === statusFilter)
    : briefings;

  async function handleCreate() {
    if (!newTitle.trim()) return;
    const created = await createBriefing({
      title: newTitle.trim(),
      audience: newAudience.trim() || undefined,
    });
    addBriefing({
      id: created.id,
      title: created.title,
      audience: created.audience,
      status: created.status,
      currentVersion: created.currentVersion,
      ownerName: created.ownerName,
      ownerId: created.ownerId,
      approvedBy: created.approvedBy,
      approvedAt: created.approvedAt,
      publishedAt: created.publishedAt,
      supersedesId: created.supersedesId,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    });
    setNewTitle("");
    setNewAudience("");
  }

  return (
    <aside className="panel panel--muted">
      <div className="section-heading section-heading--row">
        <p className="eyebrow">Library</p>
        <button className="pill pill--primary" onClick={() => setIsCreating(!isCreating)}>
          {isCreating ? "Cancel" : "+ New"}
        </button>
      </div>

      <select
        className="command-bar__hint"
        value={statusFilter ?? ""}
        onChange={(e) => setStatusFilter(e.target.value || null)}
        style={{ width: "100%", marginBottom: "0.5rem", padding: "0.25rem" }}
      >
        <option value="">All statuses</option>
        <option value="draft">Draft</option>
        <option value="under_review">Under review</option>
        <option value="approved">Approved</option>
        <option value="published">Published</option>
        <option value="superseded">Superseded</option>
        <option value="withdrawn">Withdrawn</option>
      </select>

      {isCreating && (
        <div className="panel" style={{ marginBottom: "0.5rem" }}>
          <input
            className="command-bar"
            placeholder="Briefing title"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            style={{ width: "100%", marginBottom: "0.25rem" }}
          />
          <input
            className="command-bar"
            placeholder="Audience (optional)"
            value={newAudience}
            onChange={(e) => setNewAudience(e.target.value)}
            style={{ width: "100%", marginBottom: "0.25rem" }}
          />
          <button className="pill pill--primary" onClick={handleCreate}>
            Create
          </button>
        </div>
      )}

      <div className="list-stack">
        {filtered.map((b) => (
          <div
            key={b.id}
            className={`feed-card${b.id === selectedId ? " is-active" : ""}`}
            onClick={() => selectBriefing(b.id)}
            style={{ cursor: "pointer" }}
          >
            <div className="feed-card__meta">
              <span className={statusPill(b.status)}>{b.status}</span>
              <span>v{b.currentVersion}</span>
            </div>
            <strong>{b.title}</strong>
            <p>{b.audience ?? "No audience"} · {formatDateTime(b.updatedAt, "pending")}</p>
          </div>
        ))}
        {filtered.length === 0 && (
          <p style={{ opacity: 0.5, padding: "0.5rem" }}>No briefings found</p>
        )}
      </div>
    </aside>
  );
}

/* ── Editorial Surface (center) ──────────────────────────────────────────── */

function EditorialSurface() {
  const selectedId = useBriefingsStore((s) => s.selectedBriefingId);
  const activeTab = useBriefingsStore((s) => s.activeTab);
  const setActiveTab = useBriefingsStore((s) => s.setActiveTab);
  const versions = useBriefingsStore((s) => s.versions);
  const setVersions = useBriefingsStore((s) => s.setVersions);
  const editingSections = useBriefingsStore((s) => s.editingSections);
  const setEditingSections = useBriefingsStore((s) => s.setEditingSections);
  const isDirty = useBriefingsStore((s) => s.isDirty);
  const markDirty = useBriefingsStore((s) => s.markDirty);
  const isSaving = useBriefingsStore((s) => s.isSavingVersion);
  const setIsSaving = useBriefingsStore((s) => s.setIsSavingVersion);
  const addVersion = useBriefingsStore((s) => s.addVersion);
  const patchBriefing = useBriefingsStore((s) => s.patchBriefing);
  const briefings = useBriefingsStore((s) => s.briefings);

  const [detail, setDetail] = useState<BriefingDetail | null>(null);

  const current = briefings.find((b) => b.id === selectedId);

  // Load detail and versions when selection changes
  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    fetchBriefing(selectedId).then((d) => {
      setDetail(d);
      setEditingSections(d.sections.length > 0 ? d.sections : [{ title: "", body: "" }]);
    });
    fetchBriefingVersions(selectedId).then((r) => setVersions(r.items));
  }, [selectedId, setEditingSections, setVersions]);

  const updateSection = useCallback((idx: number, field: "title" | "body", value: string) => {
    const updated = editingSections.map((s, i) =>
      i === idx ? { ...s, [field]: value } : s,
    );
    setEditingSections(updated);
    markDirty();
  }, [editingSections, setEditingSections, markDirty]);

  const addSection = useCallback(() => {
    setEditingSections([...editingSections, { title: "", body: "" }]);
    markDirty();
  }, [editingSections, setEditingSections, markDirty]);

  const removeSection = useCallback((idx: number) => {
    setEditingSections(editingSections.filter((_, i) => i !== idx));
    markDirty();
  }, [editingSections, setEditingSections, markDirty]);

  async function handleSaveVersion() {
    if (!selectedId || !detail) return;
    setIsSaving(true);
    const version = await createBriefingVersion(selectedId, {
      sections: editingSections,
      sourceInvestigationIds: detail.sourceInvestigationIds,
      sourceEventIds: detail.sourceEventIds,
      sourceWatchlistIds: detail.sourceWatchlistIds,
    });
    addVersion(version);
    patchBriefing(selectedId, { currentVersion: version.versionNumber });
  }

  async function handleStatusAction() {
    if (!selectedId || !current) return;
    if (current.status === "draft") {
      const updated = await updateBriefing(selectedId, { status: "under_review" });
      patchBriefing(selectedId, { status: updated.status });
      setDetail(updated);
    } else if (current.status === "under_review") {
      const updated = await approveBriefing(selectedId);
      patchBriefing(selectedId, { status: updated.status, approvedBy: updated.approvedBy, approvedAt: updated.approvedAt });
      setDetail(updated);
    } else if (current.status === "approved") {
      const updated = await publishBriefing(selectedId);
      patchBriefing(selectedId, { status: updated.status, publishedAt: updated.publishedAt });
      setDetail(updated);
    }
  }

  if (!selectedId || !current) {
    return (
      <article className="panel panel--document">
        <p className="eyebrow">Editorial surface</p>
        <p style={{ opacity: 0.5, padding: "1rem" }}>Select a briefing to begin editing</p>
      </article>
    );
  }

  const statusActionLabel: Record<string, string> = {
    draft: "Submit for Review",
    under_review: "Approve",
    approved: "Publish",
  };

  return (
    <article className="panel panel--document editorial-surface">
      <div className="section-heading section-heading--row">
        <p className="eyebrow">Editorial surface</p>
        <div className="cluster-row">
          <button
            className={`pill${activeTab === "editorial" ? " pill--primary" : ""}`}
            onClick={() => setActiveTab("editorial")}
          >
            Editorial
          </button>
          <button
            className={`pill${activeTab === "versions" ? " pill--primary" : ""}`}
            onClick={() => setActiveTab("versions")}
          >
            Versions ({versions.length})
          </button>
          <button
            className={`pill${activeTab === "lineage" ? " pill--primary" : ""}`}
            onClick={() => setActiveTab("lineage")}
          >
            Lineage
          </button>
        </div>
      </div>

      <h1 className="hero-title">{current.title}</h1>

      {activeTab === "editorial" && (
        <>
          <div className="cluster-row" style={{ marginBottom: "0.75rem" }}>
            <span className={statusPill(current.status)}>{current.status}</span>
            {statusActionLabel[current.status] && (
              <button className="pill pill--cyan" onClick={handleStatusAction}>
                {statusActionLabel[current.status]}
              </button>
            )}
            {isDirty && (
              <button className="pill pill--primary" onClick={handleSaveVersion} disabled={isSaving}>
                {isSaving ? "Saving..." : "Save Version"}
              </button>
            )}
          </div>

          <div className="story-sections">
            {editingSections.map((section, idx) => (
              <div key={idx} className="panel panel--muted" style={{ marginBottom: "0.5rem" }}>
                <div className="section-heading section-heading--row">
                  <input
                    className="command-bar"
                    placeholder={`Section ${idx + 1} title`}
                    value={section.title}
                    onChange={(e) => updateSection(idx, "title", e.target.value)}
                    style={{ flex: 1 }}
                  />
                  {editingSections.length > 1 && (
                    <button
                      className="pill pill--critical"
                      onClick={() => removeSection(idx)}
                      style={{ marginLeft: "0.5rem" }}
                    >
                      Remove
                    </button>
                  )}
                </div>
                <textarea
                  placeholder="Section body..."
                  value={section.body}
                  onChange={(e) => updateSection(idx, "body", e.target.value)}
                  rows={4}
                  style={{
                    width: "100%",
                    background: "transparent",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: "0.375rem",
                    padding: "0.5rem",
                    color: "inherit",
                    fontFamily: "inherit",
                    fontSize: "0.875rem",
                    resize: "vertical",
                  }}
                />
              </div>
            ))}
            <button className="pill" onClick={addSection}>
              + Add Section
            </button>
          </div>
        </>
      )}

      {activeTab === "versions" && (
        <div className="list-stack">
          {versions.map((v) => (
            <div key={v.id} className="feed-card">
              <div className="feed-card__meta">
                <span className="pill pill--cyan">v{v.versionNumber}</span>
                <span>{v.editedByName}</span>
              </div>
              <strong>{v.sections.length} section{v.sections.length !== 1 ? "s" : ""}</strong>
              <p>
                {formatDateTime(v.createdAt, "pending")}
                {v.sourceInvestigationIds.length > 0 && ` · ${v.sourceInvestigationIds.length} investigations`}
                {v.sourceEventIds.length > 0 && ` · ${v.sourceEventIds.length} events`}
                {v.sourceWatchlistIds.length > 0 && ` · ${v.sourceWatchlistIds.length} watchlists`}
                {v.aiDraftModel && ` · AI: ${v.aiDraftModel}`}
              </p>
            </div>
          ))}
          {versions.length === 0 && (
            <p style={{ opacity: 0.5, padding: "0.5rem" }}>No versions yet</p>
          )}
        </div>
      )}

      {activeTab === "lineage" && detail && (
        <div className="story-sections">
          <div className="panel panel--muted">
            <p className="eyebrow">Source Investigations ({detail.sourceInvestigationIds.length})</p>
            {detail.sourceInvestigationIds.length > 0 ? (
              <ul className="timeline-list">
                {detail.sourceInvestigationIds.map((id) => (
                  <li key={id}>
                    <a href={`/investigations?case=${id}`} className="pill pill--cyan">
                      {id.slice(0, 8)}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ opacity: 0.5 }}>No linked investigations</p>
            )}
          </div>
          <div className="panel panel--muted">
            <p className="eyebrow">Source Events ({detail.sourceEventIds.length})</p>
            {detail.sourceEventIds.length > 0 ? (
              <ul className="timeline-list">
                {detail.sourceEventIds.map((id) => (
                  <li key={id}>
                    <a href={`/pulseboard?event=${id}`} className="pill pill--cyan">
                      {id.slice(0, 8)}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ opacity: 0.5 }}>No linked events</p>
            )}
          </div>
          <div className="panel panel--muted">
            <p className="eyebrow">Source Watchlists ({detail.sourceWatchlistIds.length})</p>
            {detail.sourceWatchlistIds.length > 0 ? (
              <ul className="timeline-list">
                {detail.sourceWatchlistIds.map((id) => (
                  <li key={id}>
                    <a href={`/watchlists?list=${id}`} className="pill pill--cyan">
                      {id.slice(0, 8)}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ opacity: 0.5 }}>No linked watchlists</p>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

/* ── Briefing AI Rail (right) ────────────────────────────────────────────── */

function BriefingAIRail() {
  const selectedId = useBriefingsStore((s) => s.selectedBriefingId);
  const briefings = useBriefingsStore((s) => s.briefings);
  const versions = useBriefingsStore((s) => s.versions);

  const current = briefings.find((b) => b.id === selectedId);

  if (!current) {
    return (
      <aside className="panel">
        <p className="eyebrow">Briefing AI rail</p>
        <p style={{ opacity: 0.5, padding: "0.5rem" }}>Select a briefing</p>
      </aside>
    );
  }

  const signals: string[] = [];
  if (current.status === "published") {
    signals.push("Published briefings should be reviewed for supersedence on the next editorial cycle.");
  } else {
    signals.push("Editorial warning: this briefing is still pre-publication and may need a final approver pass.");
  }
  if (current.approvedBy) {
    signals.push(`Approved by ${current.approvedBy} on ${formatDateTime(current.approvedAt, "pending")}.`);
  } else {
    signals.push("Pending approval.");
  }

  return (
    <aside className="panel">
      <p className="eyebrow">Briefing AI rail</p>
      <div className="data-grid">
        <div className="data-point">
          <span>Status</span>
          <strong>{current.status}</strong>
        </div>
        <div className="data-point">
          <span>Version</span>
          <strong>{current.currentVersion}</strong>
        </div>
        <div className="data-point">
          <span>Audience</span>
          <strong>{current.audience ?? "Unspecified"}</strong>
        </div>
        <div className="data-point">
          <span>Owner</span>
          <strong>{current.ownerName}</strong>
        </div>
        <div className="data-point">
          <span>Published</span>
          <strong>{current.publishedAt ? formatDateTime(current.publishedAt) : "Unpublished"}</strong>
        </div>
        <div className="data-point">
          <span>Versions</span>
          <strong>{versions.length}</strong>
        </div>
      </div>

      <div className="list-stack" style={{ marginTop: "0.75rem" }}>
        {signals.map((note) => (
          <div key={note} className="feed-card">
            <strong>Editorial signal</strong>
            <p>{note}</p>
          </div>
        ))}
      </div>
    </aside>
  );
}

/* ── Status pill helper ──────────────────────────────────────────────────── */

function statusPill(status: string) {
  switch (status) {
    case "published":
    case "approved":
      return "pill pill--primary";
    case "under_review":
      return "pill pill--cyan";
    case "superseded":
    case "withdrawn":
      return "pill pill--low";
    default:
      return "pill";
  }
}

/* ── Main Workspace ──────────────────────────────────────────────────────── */

export function BriefingsInteractiveWorkspace({ data }: { data: BriefingsWorkspaceData }) {
  const hydrate = useBriefingsStore((s) => s.hydrate);

  useEffect(() => {
    // Hydrate from SSR data first
    const initial = data.briefings.map((b) => ({
      id: b.briefingId,
      title: b.title,
      audience: b.audience,
      status: b.status,
      currentVersion: b.currentVersion,
      ownerName: b.ownerName,
      ownerId: "",
      approvedBy: null as string | null,
      approvedAt: null as string | null,
      publishedAt: b.publishedAt,
      supersedesId: null as string | null,
      createdAt: b.updatedAt ?? new Date().toISOString(),
      updatedAt: b.updatedAt ?? new Date().toISOString(),
    }));
    hydrate(initial);

    // Then fetch fresh API data
    fetchBriefings({ limit: 50 }).then((r) => {
      if (r.items.length > 0) hydrate(r.items);
    });
  }, [data.briefings, hydrate]);

  return (
    <section className="workspace-screen">
      <div className="workspace-columns workspace-columns--three briefings-layout">
        <LibraryRail />
        <EditorialSurface />
        <BriefingAIRail />
      </div>
    </section>
  );
}
