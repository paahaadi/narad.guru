import { WatchlistsWorkspace } from "@/features/workspaces/live-workspaces";
import { getServerPrincipal } from "@/lib/server-session";
import { getWatchlistsWorkspaceData } from "@/lib/workspaces/watchlists";

export default async function WatchlistsPage() {
  const session = await getServerPrincipal();
  const data = await getWatchlistsWorkspaceData(session.tenantId);

  return <WatchlistsWorkspace data={data} />;
}
