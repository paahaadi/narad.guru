"use client";

import { usePathname } from "next/navigation";
import { GlobalCommandBar } from "@/components/shell/global-command-bar";
import { HeaderUtilityCluster } from "@/components/shell/header-utility-cluster";
import { getWorkspaceForPath } from "@/components/shell/navigation";
import { WorkspaceRail } from "@/components/shell/workspace-rail";
import { AskNaradPanel } from "@/features/ask-narad/ask-narad-panel";
import type { SessionPrincipal } from "@/lib/auth";

type AppShellProps = {
  session: SessionPrincipal;
  children: React.ReactNode;
};

export function AppShell({ session, children }: AppShellProps) {
  const pathname = usePathname();
  const workspace = getWorkspaceForPath(pathname);

  return (
    <div className="app-shell">
      <WorkspaceRail />
      <div className="app-shell__main">
        <header className="app-shell__header">
          <div className="app-shell__identity">
            <p className="eyebrow">Sovereign Intelligence</p>
            <h1>{workspace.label}</h1>
          </div>
          <GlobalCommandBar workspaceLabel={workspace.label} />
          <HeaderUtilityCluster session={session} />
        </header>
        <div className="app-shell__content">{children}</div>
        <AskNaradPanel />
      </div>
    </div>
  );
}
