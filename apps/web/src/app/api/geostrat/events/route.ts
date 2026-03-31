import { NextResponse } from "next/server";
import { requireSessionFromRequest } from "@/lib/auth";
import { listGeoEvents } from "@/lib/geostrat";

export async function GET(request: Request) {
  const session = await requireSessionFromRequest(request);
  const searchParams = new URL(request.url).searchParams;
  const events = await listGeoEvents(session.tenantId, {
    bbox: searchParams.get("bbox"),
    limit: Number(searchParams.get("limit") ?? 200),
  });

  return NextResponse.json(events);
}
