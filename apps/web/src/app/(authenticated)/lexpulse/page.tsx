import { getLexPulseWorkspaceData } from "@/lib/workspaces/lexpulse";
import { getServerPrincipal } from "@/lib/server-session";
import { LexPulseWorkspaceTerminal } from "@/features/lexpulse/lexpulse-terminal";

export default async function LexPulsePage() {
  const session = await getServerPrincipal();
  const data = await getLexPulseWorkspaceData(session.tenantId);

  return <LexPulseWorkspaceTerminal initialData={data} />;
}
