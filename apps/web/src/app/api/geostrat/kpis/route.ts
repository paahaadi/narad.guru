import { NextResponse } from "next/server";
import { requireSessionFromRequest } from "@/lib/auth";
import { getGeoStratKpis } from "@/lib/geostrat";

export async function GET(request: Request) {
  const session = await requireSessionFromRequest(request);
  const kpis = await getGeoStratKpis(session.tenantId);

  return NextResponse.json(kpis);
}
