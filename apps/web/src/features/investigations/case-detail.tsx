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
      <article className="panel panel--document">
        <p className="text--muted">Select an investigation from the directory.</p>
      </article>
    );
  }

  async function handleStatusTransition(target: string) {
    if (!selectedCaseId) return;
    const updated = await updateInvestigation(selectedCaseId, { status: target });
    patchCase(selectedCaseId, updated);
  }

  return (
    <article className="panel panel--document">
      <div className="tab-bar" style={{ marginBottom: "1rem" }}>
        {TABS.map((tab) => (
          <button
            key={tab}
            className={`pill${activeTab === tab ? " pill--primary" : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <OverviewTab
          selected={selected}
          onTransition={handleStatusTransition}
        />
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
    <>
      <h1 className="hero-title">{selected.title}</h1>
      <p className="hero-copy">{selected.description ?? "No description."}</p>
      {selected.hypothesis && (
        <section className="note-card">
          <p className="eyebrow">Hypothesis</p>
          <p>{selected.hypothesis}</p>
        </section>
      )}
      {transitions.length > 0 && (
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
          {transitions.map((t) => (
            <button
              key={t.target}
              className="pill pill--primary"
              onClick={() => onTransition(t.target)}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
    </>
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
          <div key={item.id} className="feed-card">
            <div className="feed-card__meta">
              <span className="pill">{item.itemType}</span>
              <span className="pill pill--accent">{item.role}</span>
            </div>
            <strong>{item.itemId.slice(0, 8).toUpperCase()}</strong>
            {item.notes && <p>{item.notes}</p>}
            <p className="text--muted">Added by {item.addedByName}</p>
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
          <div key={e.id} className="feed-card">
            <div className="feed-card__meta">
              <span className={`pill ${e.isVerified ? "pill--primary" : "pill--warning"}`}>
                {e.isVerified ? "Verified" : "Unverified"}
              </span>
            </div>
            <strong>{e.documentTitle}</strong>
            <p className="text--muted">Hash: {e.evidenceHash.slice(0, 16)}...</p>
            {!e.isVerified && (
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                <button className="pill pill--primary" onClick={() => handleVerify(e.id, "verified")}>Verify</button>
                <button className="pill pill--danger" onClick={() => handleVerify(e.id, "challenged")}>Challenge</button>
              </div>
            )}
            {e.isVerified && e.verifiedByName && (
              <p className="text--muted">Verified by {e.verifiedByName} on {e.verifiedAt}</p>
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
          <div key={n.id} className="feed-card">
            <div className="feed-card__meta">
              <span className="pill">{n.noteType}</span>
              {n.isAiGenerated && <span className="pill pill--accent">AI</span>}
              <span className="pill">{n.verificationStatus}</span>
            </div>
            <p>{n.body}</p>
            <p className="text--muted">{n.authorName} &middot; {n.createdAt}</p>
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
          <div key={`${entry.timestamp}-${idx}`} className="feed-card">
            <div className="feed-card__meta">
              <span className="pill">{entry.action}</span>
              <span>{entry.timestamp}</span>
            </div>
            <p>{entry.detail}</p>
          </div>
        ))}
        {entries.length === 0 && <p className="text--muted">No activity yet.</p>}
      </div>
    </>
  );
}
