import { CorpWatchSearchPage } from "@/features/corpwatch/corpwatch-search-page";
import { getCorpWatchWorkspaceData } from "@/lib/workspaces/corpwatch";
import { getServerPrincipal } from "@/lib/server-session";

export default async function CorpWatchPage() {
  const session = await getServerPrincipal();
  const data = await getCorpWatchWorkspaceData(session.tenantId);

  return <CorpWatchSearchPage data={data} />;
}
