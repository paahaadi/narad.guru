import { CorpWatchEntityPage } from "@/features/corpwatch/corpwatch-entity-page";
import { getServerPrincipal } from "@/lib/server-session";

export default async function CorpWatchEntityRoute({
  params,
}: {
  params: Promise<{ entityId: string }>;
}) {
  await getServerPrincipal();
  const { entityId } = await params;

  return <CorpWatchEntityPage entityId={entityId} />;
}
