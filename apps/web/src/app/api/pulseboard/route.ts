import { NextResponse } from "next/server";
import { requireSessionFromRequest } from "@/lib/auth";
import { listPulseboardCards } from "@/lib/pulseboard";

export async function GET(request: Request) {
  const session = await requireSessionFromRequest(request);
  const requestedLimit = Number(new URL(request.url).searchParams.get("limit") ?? 24);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 100)
    : 24;
  const cards = await listPulseboardCards(session.tenantId, limit);

  return NextResponse.json(cards);
}
