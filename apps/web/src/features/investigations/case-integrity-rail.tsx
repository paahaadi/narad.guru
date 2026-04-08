"use client";

import { useState } from "react";
import { useInvestigationsStore } from "@/stores/investigations-store";

async function fetchSuggestions(investigationId: string): Promise<{
  entities: { label: string; type: string; confidence: number }[];
  events: { label: string; eventType: string; confidence: number }[];
  reasoning: string;
}> {
  const res = await fetch(`/api/investigations/${investigationId}/suggest`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export function CaseIntegrityRail() {
  const { cases, selectedCaseId, custodyLog } = useInvestigationsStore();
  const selected = cases.find((c) => c.id === selectedCaseId) ?? null;

  const [suggestions, setSuggestions] = useState<{
    entities: { label: string; type: string; confidence: number }[];
    events: { label: string; eventType: string; confidence: number }[];
    reasoning: string;
  } | null>(null);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);

  async function handleSuggest() {
    if (!selectedCaseId) return;
    setLoadingSuggestions(true);
    setSuggestionError(null);
    setSuggestions(null);
    try {
      const result = await fetchSuggestions(selectedCaseId);
      setSuggestions(result);
    } catch (err) {
      setSuggestionError(err instanceof Error ? err.message : "Suggestion failed");
    } finally {
      setLoadingSuggestions(false);
    }
  }

  if (!selected) {
    return (
      <aside className="panel panel--muted investigations-rail sovereign-empty-state">
        <span className="material-symbols-outlined text--muted" style={{ fontSize: "32px" }}>
          gpp_maybe
        </span>
        <p className="text--muted" style={{ fontSize: "0.8rem" }}>
          Select a case to view integrity metrics and AI discovery signals.
        </p>
      </aside>
    );
  }

  const verifiedCount = custodyLog.filter((e) => e.action === "verified").length;
  const custodyActions = custodyLog.length;

  return (
    <aside className="panel investigations-rail">
      <div className="section-heading section-heading--row">
        <p className="eyebrow accent-cyan">CASE INTEGRITY</p>
        <span className="material-symbols-outlined" style={{ fontSize: "18px", opacity: 0.6 }}>
          encrypted
        </span>
      </div>

      {/* ── Metadata grid ── */}
      <div className="data-grid data-grid--sovereign" style={{ marginBottom: "2rem" }}>
        <div className="data-point">
          <span className="data-point__label">PROTECTION</span>
          <strong className="data-point__value">{selected.classification.toUpperCase()}</strong>
        </div>
        <div className="data-point">
          <span className="data-point__label">CONFIDENCE</span>
          <strong className="data-point__value">
            {selected.confidence === null ? "PENDING" : `${Math.round(selected.confidence * 100)}%`}
          </strong>
        </div>
        <div className="data-point">
          <span className="data-point__label">EVIDENCE PKG</span>
          <strong className="data-point__value">{selected.evidenceCount}</strong>
        </div>
        <div className="data-point">
          <span className="data-point__label">UPDATED</span>
          <strong className="data-point__value">{new Date(selected.updatedAt).toLocaleDateString()}</strong>
        </div>
      </div>

      {/* ── Chain-of-custody summary ── */}
      {custodyActions > 0 && (
        <section className="integrity-section" style={{ marginBottom: "2rem" }}>
          <p className="eyebrow" style={{ marginBottom: "0.75rem" }}>
            LINEAGE LOG
          </p>
          <div className="list-stack list-stack--compact" style={{ maxHeight: "15rem", overflowY: "auto" }}>
            {custodyLog.slice(0, 8).map((entry) => (
              <div
                key={entry.id}
                className="metric-card metric-card--sovereign"
                style={{ padding: "0.75rem", marginBottom: "0.5rem" }}
              >
                <div className="feed-card__meta" style={{ marginBottom: "0.25rem" }}>
                  <span className="pill pill--muted" style={{ fontSize: "0.55rem" }}>
                    {entry.action.toUpperCase()}
                  </span>
                  <span style={{ fontSize: "0.6rem", opacity: 0.6 }}>{entry.userName}</span>
                </div>
                <div className="provenance-block" style={{ background: "rgba(0,0,0,0.15)", padding: "0.35rem 0.5rem", borderRadius: "2px" }}>
                  <code style={{ fontSize: "0.6rem", color: "var(--accent-cyan)", fontFamily: "monospace" }}>
                    SHA256:{entry.evidenceHashAtAction.slice(0, 10)}...
                  </code>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── AI Suggestions ── */}
      <section className="integrity-section">
        <div className="section-heading section-heading--row" style={{ marginBottom: "1rem" }}>
          <p className="eyebrow accent-orange">AI DISCOVERY</p>
          <button
            className="pill pill--accent"
            onClick={handleSuggest}
            disabled={loadingSuggestions}
            style={{ fontSize: "0.65rem", padding: "0.25rem 0.75rem" }}
          >
            {loadingSuggestions ? "SCANNING..." : "SCAN SIGNALS"}
          </button>
        </div>

        {suggestionError && <p className="text--error" style={{ fontSize: "0.75rem" }}>{suggestionError}</p>}

        {suggestions && (
          <div className="suggestions-container">
            {suggestions.reasoning && (
              <div className="note-card" style={{ marginBottom: "1rem", borderLeft: "1px solid var(--accent-orange)" }}>
                <p style={{ fontSize: "0.75rem", opacity: 0.8, fontStyle: "italic" }}>{suggestions.reasoning}</p>
              </div>
            )}

            {[...suggestions.entities, ...suggestions.events].map((s, i) => (
              <div
                key={i}
                className="metric-card metric-card--sovereign accent-orange"
                style={{ padding: "0.75rem", marginBottom: "0.5rem" }}
              >
                <div className="feed-card__meta" style={{ marginBottom: "0.25rem" }}>
                  <span className="pill pill--muted" style={{ fontSize: "0.55rem" }}>
                    {'eventType' in s ? s.eventType.toUpperCase() : s.type.toUpperCase()}
                  </span>
                  <span style={{ fontSize: "0.6rem", color: "var(--accent-orange)" }}>
                    {Math.round(s.confidence * 100)}% Match
                  </span>
                </div>
                <strong style={{ fontSize: "0.85rem", display: "block", marginBottom: "0.5rem" }}>{s.label}</strong>
                <div className="confidence-bar" style={{ height: "2px", background: "rgba(255,145,0,0.1)", width: "100%" }}>
                  <div
                    style={{
                      height: "100%",
                      background: "var(--accent-orange)",
                      width: `${s.confidence * 100}%`,
                      boxShadow: "0 0 5px var(--accent-orange)",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </aside>
  );
}
