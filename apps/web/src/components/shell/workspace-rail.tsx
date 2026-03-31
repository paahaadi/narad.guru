"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WORKSPACES } from "@/components/shell/navigation";

export function WorkspaceRail() {
  const pathname = usePathname();

  return (
    <aside className="workspace-rail">
      <div className="workspace-rail__brand">
        <div className="workspace-rail__seal">
          <span className="material-symbols-outlined">security</span>
        </div>
        <span className="workspace-rail__wordmark">NARAD</span>
      </div>

      <nav className="workspace-rail__nav" aria-label="Workspaces">
        {WORKSPACES.map((workspace) => {
          const active = pathname === workspace.path || pathname.startsWith(`${workspace.path}/`);

          return (
            <Link
              key={workspace.path}
              href={workspace.path}
              className={`workspace-link${active ? " is-active" : ""}`}
            >
              <span className="material-symbols-outlined">{workspace.icon}</span>
              <span>{workspace.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="workspace-rail__footer">
        <button type="button" className="workspace-link workspace-link--ghost">
          <span className="material-symbols-outlined">settings</span>
          <span>Settings</span>
        </button>
        <button type="button" className="workspace-link workspace-link--ghost">
          <span className="material-symbols-outlined">workspaces</span>
          <span>Workspace</span>
        </button>
      </div>
    </aside>
  );
}
