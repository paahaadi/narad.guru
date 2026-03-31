"use client";

import { useState } from "react";
import { useWatchlistsStore } from "@/stores/watchlists-store";
import { createWatchlist } from "@/lib/workspaces/watchlists-client";

export function DirectoryPanel() {
  const {
    watchlists, selectedWatchlistId, isCreatingWatchlist,
    selectWatchlist, setIsCreatingWatchlist, addWatchlist,
  } = useWatchlistsStore();

  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const created = await createWatchlist({
        name: newName.trim(),
        category: newCategory.trim() || undefined,
      });
      addWatchlist(created);
      setNewName("");
      setNewCategory("");
    } finally {
      setSaving(false);
    }
  }

  const grouped = new Map<string, typeof watchlists>();
  for (const w of watchlists) {
    const cat = w.category ?? "Uncategorized";
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(w);
  }

  return (
    <aside className="panel panel--muted">
      <div className="section-heading section-heading--row">
        <p className="eyebrow">Watchlist Directory</p>
        <button
          className="pill pill--primary"
          onClick={() => setIsCreatingWatchlist(!isCreatingWatchlist)}
        >
          {isCreatingWatchlist ? "Cancel" : "+ New"}
        </button>
      </div>

      {isCreatingWatchlist && (
        <div className="panel panel--glass" style={{ marginBottom: "0.75rem" }}>
          <input
            className="command-bar__input"
            placeholder="Watchlist name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
          <input
            className="command-bar__input"
            placeholder="Category (optional)"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            style={{ marginTop: "0.5rem" }}
          />
          <button
            className="pill pill--primary"
            onClick={handleCreate}
            disabled={saving || !newName.trim()}
            style={{ marginTop: "0.5rem" }}
          >
            {saving ? "Creating..." : "Create"}
          </button>
        </div>
      )}

      <div className="list-stack">
        {[...grouped.entries()].map(([category, items]) => (
          <div key={category}>
            <p className="eyebrow" style={{ fontSize: "0.65rem", marginBottom: "0.25rem" }}>{category}</p>
            {items.map((w) => (
              <div
                key={w.id}
                className={`feed-card${w.id === selectedWatchlistId ? " is-active" : ""}`}
                onClick={() => selectWatchlist(w.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && selectWatchlist(w.id)}
              >
                <div className="feed-card__meta">
                  <span className={w.isActive ? "pill pill--primary" : "pill"}>
                    {w.isActive ? "active" : "paused"}
                  </span>
                  {w.isPriority && <span className="pill pill--critical">priority</span>}
                  <span>{w.ruleCount} rules</span>
                </div>
                <strong>{w.name}</strong>
                <p>{w.alertCount} alerts · {w.folderPath}</p>
              </div>
            ))}
          </div>
        ))}
        {watchlists.length === 0 && (
          <div className="feed-card">
            <strong>No watchlists yet</strong>
            <p>Click &quot;+ New&quot; to create your first watchlist.</p>
          </div>
        )}
      </div>
    </aside>
  );
}
