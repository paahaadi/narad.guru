import { PulseboardWorkspace } from "@/features/pulseboard/pulseboard-workspace";
import { getPulseboardEventDetail, listPulseboardCards } from "@/lib/pulseboard";
import { getServerPrincipal } from "@/lib/server-session";

export default async function PulseBoardPage() {
  const session = await getServerPrincipal();
  const initialCards = await listPulseboardCards(session.tenantId);
  const initialDetail = initialCards[0]
    ? await getPulseboardEventDetail(session.tenantId, initialCards[0].eventId)
    : null;

  return <PulseboardWorkspace initialCards={initialCards} initialDetail={initialDetail} />;
}
