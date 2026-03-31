import { NextResponse } from "next/server";
import { getWatchlistMetrics } from "@/lib/workspaces/watchlists";
import { requireApiSession } from "../_helpers";

export async function GET(request: Request) {
  const session = await requireApiSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const metrics = await getWatchlistMetrics(session.tenantId);
  return NextResponse.json(metrics);
}
