"use client";

import { useInvestigationsStore } from "@/stores/investigations-store";

export function CaseIntegrityRail() {
  const { cases, selectedCaseId } = useInvestigationsStore();
  const selected = cases.find((c) => c.id === selectedCaseId) ?? null;

  if (!selected) {
    return (
      <aside className="panel">
        <p className="eyebrow">Case Integrity</p>
        <p className="text--muted">Select a case to view details.</p>
      </aside>
    );
  }

  return (
    <aside className="panel">
      <p className="eyebrow">Case Integrity</p>
      <div className="data-grid">
        <div className="data-point">
          <span>Status</span>
          <strong>{selected.status.replace("_", " ")}</strong>
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
          <strong>{selected.updatedAt}</strong>
        </div>
      </div>
    </aside>
  );
}
