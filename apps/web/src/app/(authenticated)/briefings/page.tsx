import { BriefingsWorkspace } from "@/features/workspaces/live-workspaces";
import { getBriefingsWorkspaceData } from "@/lib/workspaces/briefings";
import { getServerPrincipal } from "@/lib/server-session";

export default async function BriefingsPage() {
  const session = await getServerPrincipal();
  const data = await getBriefingsWorkspaceData(session.tenantId);

  return <BriefingsWorkspace data={data} />;
}
