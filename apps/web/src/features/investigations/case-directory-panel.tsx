"use client";

import { useState } from "react";
import { useInvestigationsStore } from "@/stores/investigations-store";
import { createInvestigation } from "@/lib/workspaces/investigations-client";

const STATUS_OPTIONS = ["all", "draft", "under_review", "active", "on_hold", "closed", "archived"] as const;
const CLASSIFICATION_BADGES: Record<string, string> = {
  unclassified: "pill--muted",
  restricted: "pill--warning",
  confidential: "pill--accent",
  secret: "pill--danger",
};

export function CaseDirectoryPanel() {
  const {
    cases,
    selectedCaseId,
    statusFilter,
    isCreatingCase,
    selectCase,
    setStatusFilter,
    setIsCreatingCase,
    addCase,
  } = useInvestigationsStore();

  const [newTitle, setNewTitle] = useState("");
  const [newClassification, setNewClassification] = useState("unclassified");
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!newTitle.trim()) return;
    setSaving(true);
    try {
      const created = await createInvestigation({
        title: newTitle.trim(),
        classification: newClassification,
      });
      addCase(created);
      setNewTitle("");
      setNewClassification("unclassified");
    } finally {
      setSaving(false);
    }
  }

  const filtered = statusFilter
    ? cases.filter((c) => c.status === statusFilter)
    : cases;

  return (
    <aside className="panel panel--muted">
      <div className="section-heading section-heading--row">
        <p className="eyebrow">Case Directory</p>
        <button
          className="pill pill--primary"
          onClick={() => setIsCreatingCase(!isCreatingCase)}
        >
          {isCreatingCase ? "Cancel" : "+ New"}
        </button>
      </div>

      <select
        className="command-bar__input"
        value={statusFilter ?? "all"}
        onChange={(e) => setStatusFilter(e.target.value === "all" ? null : e.target.value)}
        style={{ marginBottom: "0.75rem" }}
      >
        {STATUS_OPTIONS.map((s) => (
          <option key={s} value={s}>
            {s === "all" ? "All statuses" : s.replace("_", " ")}
          </option>
        ))}
      </select>

      {isCreatingCase && (
        <div className="panel panel--glass" style={{ marginBottom: "0.75rem" }}>
          <input
            className="command-bar__input"
            placeholder="Investigation title"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
          <select
            className="command-bar__input"
            value={newClassification}
            onChange={(e) => setNewClassification(e.target.value)}
            style={{ marginTop: "0.5rem" }}
          >
            <option value="unclassified">Unclassified</option>
            <option value="restricted">Restricted</option>
            <option value="confidential">Confidential</option>
            <option value="secret">Secret</option>
          </select>
          <button
            className="pill pill--primary"
            onClick={handleCreate}
            disabled={saving || !newTitle.trim()}
            style={{ marginTop: "0.5rem" }}
          >
            {saving ? "Creating..." : "Create"}
          </button>
        </div>
      )}

      <div className="list-stack">
        {filtered.map((c) => (
          <div
            key={c.id}
            className={`feed-card${c.id === selectedCaseId ? " is-active" : ""}`}
            onClick={() => selectCase(c.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && selectCase(c.id)}
          >
            <div className="feed-card__meta">
              <span className={`pill ${CLASSIFICATION_BADGES[c.classification] ?? "pill--muted"}`}>
                {c.classification}
              </span>
              <span className="pill">{c.status.replace("_", " ")}</span>
            </div>
            <strong>{c.id.slice(0, 8).toUpperCase()}</strong>
            <p>{c.title}</p>
            <div className="feed-card__meta">
              <span>{c.itemCount} items</span>
              <span>{c.evidenceCount} evidence</span>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text--muted">No investigations found.</p>
        )}
      </div>
    </aside>
  );
}
