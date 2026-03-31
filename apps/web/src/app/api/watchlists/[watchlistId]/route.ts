import { NextResponse } from "next/server";
import { getWatchlist } from "@/lib/workspaces/watchlists";
import { requireApiSession } from "../_helpers";

export async function GET(request: Request, { params }: { params: Promise<{ watchlistId: string }> }) {
  const session = await requireApiSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { watchlistId } = await params;
  const watchlist = await getWatchlist(session.tenantId, watchlistId);
  if (!watchlist) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(watchlist);
}
