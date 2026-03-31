export type WorkspaceDescriptor = {
  path: string;
  label: string;
  icon: string;
  accent: string;
};

export const WORKSPACES: WorkspaceDescriptor[] = [
  { path: "/geostrat", label: "GeoStrat", icon: "public", accent: "orange" },
  { path: "/pulseboard", label: "PulseBoard", icon: "dashboard", accent: "orange" },
  { path: "/corpwatch", label: "CorpWatch", icon: "business_center", accent: "blue" },
  { path: "/lexpulse", label: "LexPulse", icon: "gavel", accent: "cyan" },
  { path: "/watchlists", label: "Watchlists", icon: "visibility", accent: "cyan" },
  { path: "/investigations", label: "Investigations", icon: "troubleshoot", accent: "red" },
  { path: "/briefings", label: "Briefings", icon: "description", accent: "orange" },
];

export function getWorkspaceForPath(pathname: string) {
  return (
    WORKSPACES.find(
      (workspace) => pathname === workspace.path || pathname.startsWith(`${workspace.path}/`),
    ) ?? WORKSPACES[0]
  );
}
