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
      <aside className="panel">
        <p className="eyebrow">Case Integrity</p>
        <p className="text--muted">Select a case to view integrity details.</p>
      </aside>
    );
  }

  const verifiedCount = custodyLog.filter((e) => e.action === "verified").length;
  const custodyActions = custodyLog.length;

  return (
    <aside className="panel">
      <p className="eyebrow">Case Integrity</p>

      {/* ── Metadata grid ── */}
      <div className="data-grid">
        <div className="data-point">
          <span>Status</span>
          <strong>{selected.status.replace(/_/g, " ")}</strong>
        </div>
        <div className="data-point">
          <span>Classification</span>
          <strong>{selected.classification}</strong>
        </div>
        <div className="data-point">
          <span>Confidence</span>
          <strong>{selected.confidence === null ? "pending" : selected.confidence.toFixed(2)}</strong>
        </div>
        <div className="data-point">
          <span>Owner</span>
          <strong>{selected.ownerName}</strong>
        </div>
        <div className="data-point">
          <span>Items</span>
          <strong>{selected.itemCount}</strong>
        </div>
        <div className="data-point">
          <span>Evidence</span>
          <strong>{selected.evidenceCount}</strong>
        </div>
        <div className="data-point">
          <span>Notes</span>
          <strong>{selected.noteCount}</strong>
        </div>
        <div className="data-point">
          <span>Updated</span>
          <strong>{new Date(selected.updatedAt).toLocaleDateString()}</strong>
        </div>
      </div>

      {/* ── Chain-of-custody summary ── */}
      {custodyActions > 0 && (
        <div style={{ marginTop: "1rem" }}>
          <p className="eyebrow">Chain of Custody</p>
          <div className="data-grid" style={{ marginTop: "0.5rem" }}>
            <div className="data-point">
              <span>Custody events</span>
              <strong>{custodyActions}</strong>
            </div>
            <div className="data-point">
              <span>Verified actions</span>
              <strong>{verifiedCount}</strong>
            </div>
          </div>
          <div className="list-stack" style={{ marginTop: "0.5rem", maxHeight: "12rem", overflowY: "auto" }}>
            {custodyLog.slice(0, 6).map((entry) => (
              <div key={entry.id} className="feed-card" style={{ fontSize: "0.75rem" }}>
                <div className="feed-card__meta">
                  <span className="pill">{entry.action}</span>
                  <span className="text--muted">{entry.userName}</span>
                </div>
                <p className="text--muted" style={{ fontFamily: "monospace", fontSize: "0.7rem" }}>
                  Hash: {entry.evidenceHashAtAction.slice(0, 12)}…
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── AI Suggestions (4D hook) ── */}
      <div style={{ marginTop: "1.25rem" }}>
        <div className="section-heading section-heading--row">
          <p className="eyebrow">AI Discovery</p>
          <button
            className="pill pill--cyan"
            onClick={handleSuggest}
            disabled={loadingSuggestions}
          >
            {loadingSuggestions ? "Analysing…" : "Suggest"}
          </button>
        </div>

        {suggestionError && (
          <p className="text--muted" style={{ color: "var(--color-critical, #f87171)", marginTop: "0.5rem" }}>
            {suggestionError}
          </p>
        )}

        {suggestions && (
          <div style={{ marginTop: "0.5rem" }}>
            {suggestions.reasoning && (
              <p style={{ fontSize: "0.75rem", opacity: 0.7, marginBottom: "0.5rem" }}>
                {suggestions.reasoning}
              </p>
            )}
            {suggestions.entities.length > 0 && (
              <>
                <p className="eyebrow" style={{ fontSize: "0.65rem" }}>Suggested Entities</p>
                <div className="list-stack">
                  {suggestions.entities.map((e, i) => (
                    <div key={i} className="feed-card" style={{ fontSize: "0.75rem" }}>
                      <div className="feed-card__meta">
                        <span className="pill">{e.type}</span>
                        <span className="text--muted">{(e.confidence * 100).toFixed(0)}%</span>
                      </div>
                      <strong>{e.label}</strong>
                    </div>
                  ))}
                </div>
              </>
            )}
            {suggestions.events.length > 0 && (
              <>
                <p className="eyebrow" style={{ fontSize: "0.65rem", marginTop: "0.5rem" }}>Suggested Events</p>
                <div className="list-stack">
                  {suggestions.events.map((e, i) => (
                    <div key={i} className="feed-card" style={{ fontSize: "0.75rem" }}>
                      <div className="feed-card__meta">
                        <span className="pill">{e.eventType}</span>
                        <span className="text--muted">{(e.confidence * 100).toFixed(0)}%</span>
                      </div>
                      <strong>{e.label}</strong>
                    </div>
                  ))}
                </div>
              </>
            )}
            <p
              style={{
                fontSize: "0.65rem",
                opacity: 0.5,
                marginTop: "0.5rem",
                fontStyle: "italic",
              }}
            >
              AI suggestions require analyst verification before use in published briefings.
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
