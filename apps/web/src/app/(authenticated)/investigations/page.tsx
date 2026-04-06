import { InvestigationsInteractiveWorkspace } from "@/features/investigations/investigations-workspace";
import { getServerPrincipal } from "@/lib/server-session";
import { getInvestigationsWorkspaceData } from "@/lib/workspaces/investigations";

export default async function InvestigationsPage() {
  const session = await getServerPrincipal();
  const data = await getInvestigationsWorkspaceData(session.tenantId);

  return <InvestigationsInteractiveWorkspace data={data} />;
}
