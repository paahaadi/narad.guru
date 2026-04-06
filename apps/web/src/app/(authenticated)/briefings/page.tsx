import { BriefingsInteractiveWorkspace } from "@/features/briefings/briefings-workspace";
import { getBriefingsWorkspaceData } from "@/lib/workspaces/briefings";
import { getServerPrincipal } from "@/lib/server-session";

export default async function BriefingsPage() {
  const session = await getServerPrincipal();
  const data = await getBriefingsWorkspaceData(session.tenantId);

  return <BriefingsInteractiveWorkspace data={data} />;
}
