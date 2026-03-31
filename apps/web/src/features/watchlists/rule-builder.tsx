"use client";

import { useState } from "react";
import { useWatchlistsStore } from "@/stores/watchlists-store";
import { createWatchlistRule } from "@/lib/workspaces/watchlists-client";

type ConditionRow = {
  field: string;
  operator: string;
  value: string;
};

const FIELDS = [
  { value: "severity", label: "Severity" },
  { value: "source_type", label: "Source type" },
  { value: "doc_type", label: "Document type" },
  { value: "category", label: "Category" },
  { value: "region", label: "Region" },
  { value: "entity_name", label: "Entity name" },
  { value: "risk_score", label: "Risk score" },
  { value: "title", label: "Title" },
];

const OPERATORS = [
  { value: "==", label: "equals" },
  { value: "!=", label: "not equals" },
  { value: ">", label: "greater than" },
  { value: ">=", label: "greater or equal" },
  { value: "<", label: "less than" },
  { value: "<=", label: "less or equal" },
  { value: "in", label: "in list" },
];

const SEVERITIES = ["critical", "high", "medium", "low", "informational"];

function buildJsonLogic(rows: ConditionRow[]): Record<string, unknown> {
  const conditions = rows
    .filter((r) => r.field && r.value)
    .map((r) => {
      const varRef = { var: r.field };
      const numericFields = ["risk_score"];
      const val = numericFields.includes(r.field) ? Number(r.value) : r.value;

      if (r.operator === "in") {
        const list = String(r.value).split(",").map((s) => s.trim()).filter(Boolean);
        return { in: [varRef, list] };
      }
      return { [r.operator]: [varRef, val] };
    });

  if (conditions.length === 0) return {};
  if (conditions.length === 1) return conditions[0];
  return { and: conditions };
}

export function RuleBuilder() {
  const { selectedWatchlistId, isCreatingRule, setIsCreatingRule, addRule } =
    useWatchlistsStore();

  const [ruleName, setRuleName] = useState("");
  const [description, setDescription] = useState("");
  const [severityOverride, setSeverityOverride] = useState("");
  const [rows, setRows] = useState<ConditionRow[]>([
    { field: "severity", operator: "==", value: "critical" },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addRow() {
    setRows([...rows, { field: "", operator: "==", value: "" }]);
  }

  function updateRow(index: number, patch: Partial<ConditionRow>) {
    setRows(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function removeRow(index: number) {
    if (rows.length <= 1) return;
    setRows(rows.filter((_, i) => i !== index));
  }

  async function handleSave() {
    if (!selectedWatchlistId || !ruleName.trim()) return;
    const condition = buildJsonLogic(rows);
    if (Object.keys(condition).length === 0) {
      setError("At least one valid condition is required.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const created = await createWatchlistRule(selectedWatchlistId, {
        ruleName: ruleName.trim(),
        description: description.trim() || undefined,
        condition,
        severityOverride: severityOverride || undefined,
      });
      addRule(created);
      setRuleName("");
      setDescription("");
      setSeverityOverride("");
      setRows([{ field: "severity", operator: "==", value: "critical" }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create rule");
    } finally {
      setSaving(false);
    }
  }

  if (!isCreatingRule) {
    return (
      <button
        className="pill pill--primary"
        onClick={() => setIsCreatingRule(true)}
        style={{ marginBottom: "0.75rem" }}
      >
        + Add Rule
      </button>
    );
  }

  return (
    <div className="panel panel--glass" style={{ marginBottom: "1rem" }}>
      <div className="section-heading section-heading--row">
        <p className="eyebrow">New Rule</p>
        <button className="pill" onClick={() => setIsCreatingRule(false)}>Cancel</button>
      </div>

      <input
        className="command-bar__input"
        placeholder="Rule name"
        value={ruleName}
        onChange={(e) => setRuleName(e.target.value)}
      />
      <input
        className="command-bar__input"
        placeholder="Description (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        style={{ marginTop: "0.5rem" }}
      />

      <p className="eyebrow" style={{ marginTop: "0.75rem" }}>Conditions (AND)</p>
      {rows.map((row, i) => (
        <div key={i} className="cluster-row" style={{ gap: "0.25rem", marginTop: "0.25rem", flexWrap: "wrap" }}>
          <select
            className="command-bar__input"
            value={row.field}
            onChange={(e) => updateRow(i, { field: e.target.value })}
            style={{ maxWidth: "10rem" }}
          >
            <option value="">Field...</option>
            {FIELDS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
          <select
            className="command-bar__input"
            value={row.operator}
            onChange={(e) => updateRow(i, { operator: e.target.value })}
            style={{ maxWidth: "8rem" }}
          >
            {OPERATORS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <input
            className="command-bar__input"
            placeholder="Value"
            value={row.value}
            onChange={(e) => updateRow(i, { value: e.target.value })}
            style={{ maxWidth: "10rem" }}
          />
          {rows.length > 1 && (
            <button className="pill" onClick={() => removeRow(i)} style={{ padding: "0.15rem 0.5rem" }}>
              x
            </button>
          )}
        </div>
      ))}
      <button className="pill pill--cyan" onClick={addRow} style={{ marginTop: "0.5rem" }}>
        + Condition
      </button>

      <div style={{ marginTop: "0.75rem" }}>
        <p className="eyebrow">Severity override (optional)</p>
        <select
          className="command-bar__input"
          value={severityOverride}
          onChange={(e) => setSeverityOverride(e.target.value)}
          style={{ maxWidth: "10rem" }}
        >
          <option value="">Use rule engine default</option>
          {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {error && <p style={{ color: "var(--danger)", marginTop: "0.5rem" }}>{error}</p>}

      <div className="cluster-row" style={{ marginTop: "0.75rem", gap: "0.5rem" }}>
        <button className="pill pill--primary" onClick={handleSave} disabled={saving || !ruleName.trim()}>
          {saving ? "Saving..." : "Create Rule"}
        </button>
        <span className="eyebrow">
          JSON: {JSON.stringify(buildJsonLogic(rows)).slice(0, 80)}
        </span>
      </div>
    </div>
  );
}
