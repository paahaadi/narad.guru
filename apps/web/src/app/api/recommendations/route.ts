import { NextResponse } from "next/server";
import { requireSessionFromRequest } from "@/lib/auth";
import { listRecommendations, updateRecommendationStatus } from "@/lib/workspaces/recommendations";

export async function GET(request: Request) {
  const session = await requireSessionFromRequest(request);
  const url = new URL(request.url);

  const filters: Record<string, string | undefined> = {
    eventId: url.searchParams.get("eventId") ?? undefined,
    entityId: url.searchParams.get("entityId") ?? undefined,
    investigationId: url.searchParams.get("investigationId") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
  };

  const limit = Math.min(
    Math.max(Number(url.searchParams.get("limit") ?? 20), 1),
    100,
  );

  const recommendations = await listRecommendations(session.tenantId, {
    ...filters,
    limit,
  });

  return NextResponse.json(recommendations);
}

export async function PATCH(request: Request) {
  const session = await requireSessionFromRequest(request);
  const body = (await request.json()) as {
    recommendationId?: string;
    status?: string;
  };

  if (!body.recommendationId || !body.status) {
    return NextResponse.json(
      { error: "recommendationId and status are required" },
      { status: 400 },
    );
  }

  const updated = await updateRecommendationStatus(
    session.tenantId,
    body.recommendationId,
    body.status,
    session.sub,
  );

  if (!updated) {
    return NextResponse.json(
      { error: "Recommendation not found or invalid status" },
      { status: 404 },
    );
  }

  return NextResponse.json(updated);
}
