"use client";

import { useShellStore } from "@/stores/shell-store";

type GlobalCommandBarProps = {
  workspaceLabel: string;
};

export function GlobalCommandBar({ workspaceLabel }: GlobalCommandBarProps) {
  const commandQuery = useShellStore((state) => state.commandQuery);
  const setCommandQuery = useShellStore((state) => state.setCommandQuery);
  const setAskNaradOpen = useShellStore((state) => state.setAskNaradOpen);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && commandQuery.trim()) {
      e.preventDefault();
      setAskNaradOpen(true);
    }
  };

  return (
    <label className="command-bar" aria-label="Global command search">
      <span className="material-symbols-outlined">search</span>
      <input
        value={commandQuery}
        onChange={(event) => setCommandQuery(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={`Ask NARAD inside ${workspaceLabel}...`}
      />
      <span className="command-bar__hint">CMD</span>
      <span className="command-bar__hint">K</span>
    </label>
  );
}
