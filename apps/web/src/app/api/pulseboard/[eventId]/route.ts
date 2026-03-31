import { NextResponse } from "next/server";
import { requireSessionFromRequest } from "@/lib/auth";
import { getPulseboardEventDetail } from "@/lib/pulseboard";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const session = await requireSessionFromRequest(request);
  const { eventId } = await params;
  const detail = await getPulseboardEventDetail(session.tenantId, eventId);

  if (!detail) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(detail);
}
