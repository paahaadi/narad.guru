"use client";

import { useShellStore } from "@/stores/shell-store";

type GlobalCommandBarProps = {
  workspaceLabel: string;
};

export function GlobalCommandBar({ workspaceLabel }: GlobalCommandBarProps) {
  const commandQuery = useShellStore((state) => state.commandQuery);
  const setCommandQuery = useShellStore((state) => state.setCommandQuery);

  return (
    <label className="command-bar" aria-label="Global command search">
      <span className="material-symbols-outlined">search</span>
      <input
        value={commandQuery}
        onChange={(event) => setCommandQuery(event.target.value)}
        placeholder={`Ask NARAD inside ${workspaceLabel}...`}
      />
      <span className="command-bar__hint">CMD</span>
      <span className="command-bar__hint">K</span>
    </label>
  );
}
