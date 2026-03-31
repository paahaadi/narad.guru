import { InvestigationsWorkspace } from "@/features/workspaces/live-workspaces";
import { getServerPrincipal } from "@/lib/server-session";
import { getInvestigationsWorkspaceData } from "@/lib/workspaces/investigations";

export default async function InvestigationsPage() {
  const session = await getServerPrincipal();
  const data = await getInvestigationsWorkspaceData(session.tenantId);

  return <InvestigationsWorkspace data={data} />;
}
