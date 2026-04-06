"use client";

import { useEffect, useState } from "react";

type UserPreferences = {
  regions: string[];
  entityTypes: string[];
  eventTypes: string[];
  severityFilter: string;
};

const DEFAULT_PREFERENCES: UserPreferences = {
  regions: [],
  entityTypes: [],
  eventTypes: [],
  severityFilter: "all",
};

const INDIAN_STATES = [
  "AN","AP","AR","AS","BR","CG","CH","DD","DL","GA","GJ","HP","HR",
  "JH","JK","KA","KL","LA","MH","ML","MN","MP","MZ","NL","OD","PB",
  "PY","RJ","SK","TN","TG","TR","UK","UP","WB",
];

const EVENT_TYPES = [
  "security_incident", "disaster_natural", "disaster_man_made",
  "political_development", "economic_indicator", "infrastructure",
  "health_outbreak", "social_unrest", "environmental",
  "conflict", "terrorism", "cybersecurity", "governance",
];

const SEVERITY_OPTIONS = ["all", "critical", "high", "medium", "low"] as const;

export default function SettingsPage() {
  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/preferences", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : DEFAULT_PREFERENCES))
      .then((data) => {
        setPrefs({ ...DEFAULT_PREFERENCES, ...data });
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  function toggleArrayItem(key: keyof Pick<UserPreferences, "regions" | "entityTypes" | "eventTypes">, value: string) {
    setPrefs((prev) => {
      const list = prev[key];
      const updated = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
      return { ...prev, [key]: updated };
    });
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(prefs),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) {
    return (
      <section className="workspace-screen settings-screen">
        <div className="section-heading">
          <p className="eyebrow">Configuration</p>
          <h2>Settings</h2>
        </div>
        <div className="panel"><p className="muted">Loading preferences…</p></div>
      </section>
    );
  }

  return (
    <section className="workspace-screen settings-screen">
      <div className="section-heading section-heading--row">
        <div>
          <p className="eyebrow">Configuration</p>
          <h2>Preferences & Personalization</h2>
        </div>
        <button
          className="btn btn--primary"
          disabled={saving}
          onClick={handleSave}
        >
          {saving ? "Saving…" : saved ? "✓ Saved" : "Save preferences"}
        </button>
      </div>

      {/* ── Severity filter ────────────────────────── */}
      <div className="panel">
        <p className="eyebrow">Severity threshold</p>
        <p className="muted" style={{ marginBottom: "0.75rem" }}>
          Filter your PulseBoard feed to show events at or above this severity level.
        </p>
        <div className="cluster-row">
          {SEVERITY_OPTIONS.map((s) => (
            <button
              key={s}
              className={`pill pill--selectable ${prefs.severityFilter === s ? "is-active pill--" + (s === "all" ? "primary" : s) : ""}`}
              onClick={() => {
                setPrefs((prev) => ({ ...prev, severityFilter: s }));
                setSaved(false);
              }}
            >
              {s === "all" ? "All events" : s.charAt(0).toUpperCase() + s.slice(1) + "+"}
            </button>
          ))}
        </div>
      </div>

      {/* ── Region filter ──────────────────────────── */}
      <div className="panel">
        <p className="eyebrow">Region focus</p>
        <p className="muted" style={{ marginBottom: "0.75rem" }}>
          Select state codes to prioritize in your feed. Leave empty for all regions.
        </p>
        <div className="cluster-row" style={{ flexWrap: "wrap", gap: "0.375rem" }}>
          {INDIAN_STATES.map((code) => (
            <button
              key={code}
              className={`pill pill--selectable ${prefs.regions.includes(code) ? "is-active pill--primary" : ""}`}
              onClick={() => toggleArrayItem("regions", code)}
            >
              {code}
            </button>
          ))}
        </div>
        {prefs.regions.length > 0 && (
          <p className="muted" style={{ marginTop: "0.5rem" }}>
            {prefs.regions.length} region{prefs.regions.length !== 1 ? "s" : ""} selected
          </p>
        )}
      </div>

      {/* ── Event type filter ──────────────────────── */}
      <div className="panel">
        <p className="eyebrow">Event types</p>
        <p className="muted" style={{ marginBottom: "0.75rem" }}>
          Select event types to prioritize in your personalized feed.
        </p>
        <div className="cluster-row" style={{ flexWrap: "wrap", gap: "0.375rem" }}>
          {EVENT_TYPES.map((t) => (
            <button
              key={t}
              className={`pill pill--selectable ${prefs.eventTypes.includes(t) ? "is-active pill--primary" : ""}`}
              onClick={() => toggleArrayItem("eventTypes", t)}
            >
              {t.replace(/_/g, " ")}
            </button>
          ))}
        </div>
        {prefs.eventTypes.length > 0 && (
          <p className="muted" style={{ marginTop: "0.5rem" }}>
            {prefs.eventTypes.length} type{prefs.eventTypes.length !== 1 ? "s" : ""} selected
          </p>
        )}
      </div>
    </section>
  );
}
