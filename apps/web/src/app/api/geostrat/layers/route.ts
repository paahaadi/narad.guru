import { NextResponse } from "next/server";
import { requireSessionFromRequest } from "@/lib/auth";
import { listGeoLayers } from "@/lib/geostrat";

export async function GET(request: Request) {
  const session = await requireSessionFromRequest(request);
  const layers = await listGeoLayers(session.tenantId);

  return NextResponse.json(layers);
}
