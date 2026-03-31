import { NextResponse } from "next/server";
import { requireSessionFromRequest } from "@/lib/auth";
import { renderEventTile } from "@/lib/geostrat";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ layer: string; z: string; x: string; y: string }> },
) {
  const session = await requireSessionFromRequest(request);
  const { layer, z, x, y } = await params;
  const tileCoordinates = [z, x, y].map((value) => Number(value));

  if (layer !== "events") {
    return NextResponse.json({ error: "Unknown tile layer" }, { status: 404 });
  }
  if (tileCoordinates.some((value) => !Number.isFinite(value) || !Number.isInteger(value))) {
    return NextResponse.json({ error: "Invalid tile coordinates" }, { status: 400 });
  }

  const [tileZ, tileX, tileY] = tileCoordinates;
  const tile = await renderEventTile(session.tenantId, tileZ, tileX, tileY);

  return new NextResponse(tile, {
    status: 200,
    headers: {
      "content-type": "application/vnd.mapbox-vector-tile",
      "cache-control": "private, max-age=15",
    },
  });
}
