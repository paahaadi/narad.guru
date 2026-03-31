import { GeoStratWorkspace } from "@/features/geostrat/geostrat-workspace";
import { getGeoStratKpis, listGeoEvents, listGeoLayers } from "@/lib/geostrat";
import { getServerPrincipal } from "@/lib/server-session";

export default async function GeoStratPage() {
  const session = await getServerPrincipal();
  const [initialKpis, initialLayers, initialEvents] = await Promise.all([
    getGeoStratKpis(session.tenantId),
    listGeoLayers(session.tenantId),
    listGeoEvents(session.tenantId, { limit: 180 }),
  ]);

  return (
    <GeoStratWorkspace
      initialKpis={initialKpis}
      initialLayers={initialLayers}
      initialEvents={initialEvents}
    />
  );
}
