"use client";

import { useEffect, useState } from "react";
import { useInvestigationsStore } from "@/stores/investigations-store";
import {
  fetchInvestigationItems,
  fetchInvestigationEvidence,
  fetchInvestigationNotes,
  fetchCustodyLog,
  updateInvestigation,
  attachInvestigationItem,
  attachInvestigationEvidence,
  createInvestigationNote,
  verifyEvidence,
} from "@/lib/workspaces/investigations-client";
import type {
  InvestigationSummary,
  InvestigationItem,
  EvidenceRecord,
  InvestigationNote,
  CustodyEntry,
} from "@/lib/workspaces/investigations";

const VALID_TRANSITIONS: Record<string, { label: string; target: string }[]> = {
  draft: [{ label: "Submit for Review", target: "under_review" }],
  under_review: [
    { label: "Activate", target: "active" },
    { label: "Put on Hold", target: "on_hold" },
  ],
  active: [
    { label: "Put on Hold", target: "on_hold" },
    { label: "Close", target: "closed" },
  ],
  on_hold: [
    { label: "Resume (Active)", target: "active" },
    { label: "Back to Review", target: "under_review" },
  ],
  closed: [{ label: "Archive", target: "archived" }],
};

const TABS = ["overview", "items", "evidence", "notes", "timeline"] as const;

export function CaseDetail() {
  const {
    cases,
    selectedCaseId,
    activeTab,
    items,
    evidence,
    notes,
    custodyLog,
    isAttachingItem,
    isAttachingEvidence,
    isWritingNote,
    setActiveTab,
    setItems,
    setEvidence,
    setNotes,
    setCustodyLog,
    addItem,
    addEvidence,
    addNote,
    patchCase,
    patchEvidence,
    setIsAttachingItem,
    setIsAttachingEvidence,
    setIsWritingNote,
  } = useInvestigationsStore();

  const selected = cases.find((c) => c.id === selectedCaseId) ?? null;

  useEffect(() => {
    if (!selectedCaseId) return;
    if (activeTab === "items") {
      fetchInvestigationItems(selectedCaseId).then((r) => setItems(r.items));
    } else if (activeTab === "evidence") {
      fetchInvestigationEvidence(selectedCaseId).then((r) => setEvidence(r.items));
    } else if (activeTab === "notes") {
      fetchInvestigationNotes(selectedCaseId).then((r) => setNotes(r.items));
    } else if (activeTab === "timeline") {
      Promise.all([
        fetchInvestigationItems(selectedCaseId),
        fetchInvestigationEvidence(selectedCaseId),
        fetchInvestigationNotes(selectedCaseId),
        fetchCustodyLog(selectedCaseId),
      ]).then(([i, e, n, c]) => {
        setItems(i.items);
        setEvidence(e.items);
        setNotes(n.items);
        setCustodyLog(c.entries);
      });
    }
  }, [selectedCaseId, activeTab, setItems, setEvidence, setNotes, setCustodyLog]);

  if (!selected) {
    return (
      <article className="panel panel--document sovereign-empty-state">
        <span className="material-symbols-outlined text--muted" style={{ fontSize: "48px" }}>
          folder_managed
        </span>
        <p className="text--muted">Select an investigation from the directory to begin link analysis.</p>
      </article>
    );
  }

  async function handleStatusTransition(target: string) {
    if (!selectedCaseId) return;
    const updated = await updateInvestigation(selectedCaseId, { status: target });
    patchCase(selectedCaseId, updated);
  }

  return (
    <article className="panel panel--document investigations-detail">
      <div className="tab-bar tab-bar--sovereign">
        {TABS.map((tab) => (
          <button
            key={tab}
            className={`tab-item${activeTab === tab ? " is-active" : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="investigations-detail__content">
        {activeTab === "overview" && (
          <OverviewTab selected={selected} onTransition={handleStatusTransition} />
        )}
        {activeTab === "items" && (
          <ItemsTab
            items={items}
            investigationId={selectedCaseId!}
            isAttaching={isAttachingItem}
            setIsAttaching={setIsAttachingItem}
            addItem={addItem}
          />
        )}
        {activeTab === "evidence" && (
          <EvidenceTab
            evidence={evidence}
            investigationId={selectedCaseId!}
            isAttaching={isAttachingEvidence}
            setIsAttaching={setIsAttachingEvidence}
            addEvidence={addEvidence}
            patchEvidence={patchEvidence}
          />
        )}
        {activeTab === "notes" && (
          <NotesTab
            notes={notes}
            investigationId={selectedCaseId!}
            isWriting={isWritingNote}
            setIsWriting={setIsWritingNote}
            addNote={addNote}
          />
        )}
        {activeTab === "timeline" && (
          <TimelineTab items={items} evidence={evidence} notes={notes} custodyLog={custodyLog} />
        )}
      </div>
    </article>
  );
}

/* ── Tab sub-components ── */

function OverviewTab({
  selected,
  onTransition,
}: {
  selected: InvestigationSummary;
  onTransition: (target: string) => void;
}) {
  const transitions = VALID_TRANSITIONS[selected.status] ?? [];
  return (
    <div className="overview-tab">
      <header className="overview-tab__header">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <span className="eyebrow accent-cyan" style={{ marginBottom: "0.5rem", display: "block" }}>
              INVESTIGATION #{selected.id.slice(0, 8).toUpperCase()}
            </span>
            <h1 className="hero-title" style={{ fontSize: "2rem", marginBottom: "1rem" }}>
              {selected.title}
            </h1>
          </div>
          <div className="metric-card metric-card--sovereign accent-orange" style={{ padding: "0.5rem 1rem" }}>
            <span className="metric-card__label" style={{ fontSize: "0.6rem" }}>
              Confidence
            </span>
            <strong className="metric-card__value" style={{ fontSize: "1.2rem" }}>
              {Math.round((selected.confidence ?? 0) * 100)}%
            </strong>
          </div>
        </div>

        <div className="feed-card__meta" style={{ marginBottom: "2rem" }}>
          <span className="pill pill--primary">{selected.status.toUpperCase()}</span>
          <span className="text--muted">Owned by {selected.ownerName}</span>
          <span className="text--muted">Updated {new Date(selected.updatedAt).toLocaleDateString()}</span>
        </div>
      </header>

      <section className="overview-tab__info">
        <div className="grid grid--2" style={{ gap: "2rem" }}>
          <div className="info-block">
            <h3 className="eyebrow" style={{ marginBottom: "0.75rem" }}>
              Case Briefing
            </h3>
            <p className="hero-copy" style={{ fontSize: "1rem", lineHeight: "1.6" }}>
              {selected.description ?? "No description provided for this investigation."}
            </p>
          </div>

          <div className="info-block">
            <h3 className="eyebrow" style={{ marginBottom: "0.75rem" }}>
              Active Hypothesis
            </h3>
            <div className="note-card" style={{ borderLeft: "2px solid var(--accent-orange)", background: "rgba(255, 145, 0, 0.05)" }}>
              <p style={{ fontStyle: "italic", color: "var(--text-bright)" }}>
                {selected.hypothesis ??
                  "Preliminary investigative phase. No formal hypothesis has been established yet."}
              </p>
            </div>
          </div>
        </div>
      </section>

      {transitions.length > 0 && (
        <section className="overview-tab__actions" style={{ marginTop: "3rem", paddingTop: "2rem", borderTop: "1px solid var(--border-subtle)" }}>
          <h3 className="eyebrow" style={{ marginBottom: "1rem" }}>
            Workflow Transitions
          </h3>
          <div style={{ display: "flex", gap: "1rem" }}>
            {transitions.map((t) => (
              <button key={t.target} className="pill pill--primary" onClick={() => onTransition(t.target)}>
                {t.label}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ItemsTab({
  items,
  investigationId,
  isAttaching,
  setIsAttaching,
  addItem,
}: {
  items: InvestigationItem[];
  investigationId: string;
  isAttaching: boolean;
  setIsAttaching: (v: boolean) => void;
  addItem: (item: InvestigationItem) => void;
}) {
  const [itemType, setItemType] = useState("event");
  const [itemId, setItemId] = useState("");
  const [role, setRole] = useState("evidence");
  const [itemNotes, setItemNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleAttach() {
    if (!itemId.trim()) return;
    setSaving(true);
    try {
      const created = await attachInvestigationItem(investigationId, {
        itemType,
        itemId: itemId.trim(),
        role,
        notes: itemNotes.trim() || undefined,
      });
      addItem(created);
      setItemId("");
      setItemNotes("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="section-heading section-heading--row">
        <p className="eyebrow">Linked Items ({items.length})</p>
        <button className="pill pill--primary" onClick={() => setIsAttaching(!isAttaching)}>
          {isAttaching ? "Cancel" : "+ Attach"}
        </button>
      </div>

      {isAttaching && (
        <div className="panel panel--glass" style={{ marginBottom: "0.75rem" }}>
          <select className="command-bar__input" value={itemType} onChange={(e) => setItemType(e.target.value)}>
            <option value="event">Event</option>
            <option value="entity">Entity</option>
            <option value="document">Document</option>
            <option value="claim">Claim</option>
          </select>
          <input
            className="command-bar__input"
            placeholder="Item ID (UUID)"
            value={itemId}
            onChange={(e) => setItemId(e.target.value)}
            style={{ marginTop: "0.5rem" }}
          />
          <select
            className="command-bar__input"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            style={{ marginTop: "0.5rem" }}
          >
            <option value="evidence">Evidence</option>
            <option value="key_evidence">Key Evidence</option>
            <option value="supporting">Supporting</option>
            <option value="context">Context</option>
            <option value="lead">Lead</option>
            <option value="exculpatory">Exculpatory</option>
            <option value="disputed">Disputed</option>
          </select>
          <textarea
            className="command-bar__input"
            placeholder="Notes (optional)"
            value={itemNotes}
            onChange={(e) => setItemNotes(e.target.value)}
            rows={2}
            style={{ marginTop: "0.5rem" }}
          />
          <button
            className="pill pill--primary"
            onClick={handleAttach}
            disabled={saving || !itemId.trim()}
            style={{ marginTop: "0.5rem" }}
          >
            {saving ? "Attaching..." : "Attach Item"}
          </button>
        </div>
      )}

      <div className="list-stack">
        {items.map((item) => (
          <div key={item.id} className="metric-card metric-card--sovereign accent-cyan" style={{ padding: "1rem", marginBottom: "0.75rem" }}>
            <div className="feed-card__meta" style={{ marginBottom: "0.5rem" }}>
              <span className="pill pill--accent" style={{ fontSize: "0.6rem" }}>
                {item.itemType.toUpperCase()}
              </span>
              <span className="eyebrow" style={{ fontSize: "0.6rem" }}>
                {item.role.replace("_", " ")}
              </span>
            </div>
            <strong style={{ fontSize: "0.9rem", display: "block", marginBottom: "0.5rem" }}>
              ID: {item.itemId.slice(0, 8).toUpperCase()}
            </strong>
            {item.notes && <p className="text--muted" style={{ fontSize: "0.85rem", marginBottom: "1rem" }}>{item.notes}</p>}
            <div className="feed-card__meta" style={{ opacity: 0.7 }}>
              <span style={{ fontSize: "0.65rem" }}>Added by {item.addedByName}</span>
              <span style={{ fontSize: "0.65rem" }}>{new Date(item.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
        ))}
        {items.length === 0 && <p className="text--muted">No items linked yet.</p>}
      </div>
    </>
  );
}

function EvidenceTab({
  evidence,
  investigationId,
  isAttaching,
  setIsAttaching,
  addEvidence,
  patchEvidence,
}: {
  evidence: EvidenceRecord[];
  investigationId: string;
  isAttaching: boolean;
  setIsAttaching: (v: boolean) => void;
  addEvidence: (e: EvidenceRecord) => void;
  patchEvidence: (id: string, patch: Partial<EvidenceRecord>) => void;
}) {
  const [docId, setDocId] = useState("");
  const [hash, setHash] = useState("");
  const [s3Key, setS3Key] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleAttach() {
    if (!docId.trim() || !hash.trim() || !s3Key.trim()) return;
    setSaving(true);
    try {
      const created = await attachInvestigationEvidence(investigationId, {
        documentId: docId.trim(),
        evidenceHash: hash.trim(),
        s3KeyWorm: s3Key.trim(),
      });
      addEvidence(created);
      setDocId("");
      setHash("");
      setS3Key("");
    } finally {
      setSaving(false);
    }
  }

  async function handleVerify(evidenceId: string, action: "verified" | "challenged") {
    const result = await verifyEvidence(investigationId, evidenceId, action);
    patchEvidence(evidenceId, {
      isVerified: result.isVerified,
      verifiedBy: result.verifiedBy,
      verifiedAt: result.verifiedAt,
    });
  }

  return (
    <>
      <div className="section-heading section-heading--row">
        <p className="eyebrow">Evidence Chain ({evidence.length})</p>
        <button className="pill pill--primary" onClick={() => setIsAttaching(!isAttaching)}>
          {isAttaching ? "Cancel" : "+ Attach"}
        </button>
      </div>

      {isAttaching && (
        <div className="panel panel--glass" style={{ marginBottom: "0.75rem" }}>
          <input className="command-bar__input" placeholder="Document ID (UUID)" value={docId} onChange={(e) => setDocId(e.target.value)} />
          <input className="command-bar__input" placeholder="Evidence hash (SHA-256)" value={hash} onChange={(e) => setHash(e.target.value)} style={{ marginTop: "0.5rem" }} />
          <input className="command-bar__input" placeholder="S3 WORM key" value={s3Key} onChange={(e) => setS3Key(e.target.value)} style={{ marginTop: "0.5rem" }} />
          <button className="pill pill--primary" onClick={handleAttach} disabled={saving || !docId.trim() || !hash.trim() || !s3Key.trim()} style={{ marginTop: "0.5rem" }}>
            {saving ? "Attaching..." : "Attach Evidence"}
          </button>
        </div>
      )}

      <div className="list-stack">
        {evidence.map((e) => (
          <div
            key={e.id}
            className={`metric-card metric-card--sovereign ${e.isVerified ? "accent-cyan" : "accent-orange"}`}
            style={{ padding: "1rem", marginBottom: "0.75rem" }}
          >
            <div className="feed-card__meta" style={{ marginBottom: "0.75rem" }}>
              <span className={`pill ${e.isVerified ? "pill--primary" : "pill--warning"}`} style={{ fontSize: "0.6rem" }}>
                {e.isVerified ? "VERIFIED" : "PENDING VERIFICATION"}
              </span>
            </div>
            <strong style={{ fontSize: "1rem", display: "block", marginBottom: "0.5rem" }}>{e.documentTitle}</strong>

            <div className="provenance-block" style={{ background: "rgba(0,0,0,0.2)", padding: "0.75rem", borderRadius: "4px", marginBottom: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.25rem" }}>
                <span className="eyebrow" style={{ fontSize: "0.55rem", opacity: 0.6 }}>SHA-256 PROOF</span>
                <span className="material-symbols-outlined" style={{ fontSize: "12px", opacity: 0.6 }}>fingerprint</span>
              </div>
              <code style={{ fontSize: "0.7rem", color: "var(--accent-cyan)", wordBreak: "break-all" }}>
                {e.evidenceHash}
              </code>
            </div>

            {!e.isVerified && (
              <div style={{ display: "flex", gap: "1rem", marginTop: "1rem" }}>
                <button
                  className="pill pill--primary"
                  onClick={() => handleVerify(e.id, "verified")}
                  style={{ flex: 1, justifyContent: "center" }}
                >
                  Confirm Integrity
                </button>
                <button
                  className="pill pill--danger"
                  onClick={() => handleVerify(e.id, "challenged")}
                  style={{ flex: 1, justifyContent: "center" }}
                >
                  Challenge
                </button>
              </div>
            )}
            {e.isVerified && e.verifiedByName && (
              <div className="feed-card__meta" style={{ marginTop: "0.5rem", opacity: 0.7 }}>
                <span style={{ fontSize: "0.65rem" }}>Signed by {e.verifiedByName}</span>
                <span style={{ fontSize: "0.65rem" }}>{new Date(e.verifiedAt!).toLocaleDateString()}</span>
              </div>
            )}
          </div>
        ))}
        {evidence.length === 0 && <p className="text--muted">No evidence attached yet.</p>}
      </div>
    </>
  );
}

function NotesTab({
  notes,
  investigationId,
  isWriting,
  setIsWriting,
  addNote,
}: {
  notes: InvestigationNote[];
  investigationId: string;
  isWriting: boolean;
  setIsWriting: (v: boolean) => void;
  addNote: (note: InvestigationNote) => void;
}) {
  const [noteBody, setNoteBody] = useState("");
  const [noteType, setNoteType] = useState("note");
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!noteBody.trim()) return;
    setSaving(true);
    try {
      const created = await createInvestigationNote(investigationId, {
        body: noteBody.trim(),
        noteType,
      });
      addNote(created);
      setNoteBody("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="section-heading section-heading--row">
        <p className="eyebrow">Notes ({notes.length})</p>
        <button className="pill pill--primary" onClick={() => setIsWriting(!isWriting)}>
          {isWriting ? "Cancel" : "+ Add Note"}
        </button>
      </div>

      {isWriting && (
        <div className="panel panel--glass" style={{ marginBottom: "0.75rem" }}>
          <select className="command-bar__input" value={noteType} onChange={(e) => setNoteType(e.target.value)}>
            <option value="note">Note</option>
            <option value="hypothesis">Hypothesis</option>
            <option value="task">Task</option>
            <option value="decision">Decision</option>
          </select>
          <textarea
            className="command-bar__input"
            placeholder="Write your note..."
            value={noteBody}
            onChange={(e) => setNoteBody(e.target.value)}
            rows={4}
            style={{ marginTop: "0.5rem" }}
          />
          <button
            className="pill pill--primary"
            onClick={handleCreate}
            disabled={saving || !noteBody.trim()}
            style={{ marginTop: "0.5rem" }}
          >
            {saving ? "Saving..." : "Save Note"}
          </button>
        </div>
      )}

      <div className="list-stack">
        {notes.map((n) => (
          <div
            key={n.id}
            className={`metric-card metric-card--sovereign ${n.noteType === "hypothesis" ? "accent-orange" : ""}`}
            style={{ padding: "1rem", marginBottom: "0.75rem" }}
          >
            <div className="feed-card__meta" style={{ marginBottom: "0.5rem" }}>
              <span className="pill pill--muted" style={{ fontSize: "0.6rem" }}>
                {n.noteType.toUpperCase()}
              </span>
              {n.isAiGenerated && (
                <span className="pill pill--accent" style={{ fontSize: "0.6rem" }}>
                  AI SUGGESTION
                </span>
              )}
            </div>
            <p style={{ fontSize: "0.95rem", lineHeight: "1.5", marginBottom: "1rem" }}>{n.body}</p>
            <div className="feed-card__meta" style={{ opacity: 0.7 }}>
              <span style={{ fontSize: "0.65rem" }}>{n.authorName}</span>
              <span style={{ fontSize: "0.65rem" }}>{new Date(n.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
        ))}
        {notes.length === 0 && <p className="text--muted">No notes yet.</p>}
      </div>
    </>
  );
}

function TimelineTab({
  items,
  evidence,
  notes,
  custodyLog,
}: {
  items: InvestigationItem[];
  evidence: EvidenceRecord[];
  notes: InvestigationNote[];
  custodyLog: CustodyEntry[];
}) {
  type TimelineEntry = { timestamp: string; action: string; detail: string };

  const entries: TimelineEntry[] = [
    ...items.map((i) => ({
      timestamp: i.createdAt,
      action: "Item attached",
      detail: `${i.itemType} (${i.role}) by ${i.addedByName}`,
    })),
    ...evidence.map((e) => ({
      timestamp: e.createdAt,
      action: "Evidence attached",
      detail: e.documentTitle,
    })),
    ...notes.map((n) => ({
      timestamp: n.createdAt,
      action: `${n.noteType} added`,
      detail: n.body.slice(0, 100),
    })),
    ...custodyLog.map((c) => ({
      timestamp: c.createdAt,
      action: `Evidence ${c.action}`,
      detail: `by ${c.userName}`,
    })),
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return (
    <>
      <p className="eyebrow">Activity Timeline ({entries.length})</p>
      <div className="list-stack">
        {entries.map((entry, idx) => (
          <div
            key={`${entry.timestamp}-${idx}`}
            className="metric-card metric-card--sovereign"
            style={{ padding: "1rem", marginBottom: "0.75rem", borderLeft: "2px solid var(--border-subtle)" }}
          >
            <div className="feed-card__meta" style={{ marginBottom: "0.5rem" }}>
              <span className="eyebrow accent-cyan" style={{ fontSize: "0.6rem" }}>
                {entry.action.toUpperCase()}
              </span>
              <span style={{ fontSize: "0.65rem", opacity: 0.6 }}>{new Date(entry.timestamp).toLocaleString()}</span>
            </div>
            <p style={{ fontSize: "0.9rem" }}>{entry.detail}</p>
          </div>
        ))}
        {entries.length === 0 && <p className="text--muted">No activity yet.</p>}
      </div>
    </>
  );
}
