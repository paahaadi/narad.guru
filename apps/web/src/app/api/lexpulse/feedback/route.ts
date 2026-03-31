import { NextResponse } from "next/server";
import { queryRow } from "@/lib/db";
import { asOptionalString, asString } from "@/lib/workspaces/shared";
import type { LexPulseFeedback } from "@/lib/workspaces/lexpulse-types";
import { requireApiSession } from "../_helpers";

type FeedbackRow = {
  id: string;
  query_cache_id: string;
  user_id: string;
  rating: string;
  created_at: Date | string;
};

export async function POST(request: Request) {
  const session = await requireApiSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { queryCacheId?: unknown; rating?: unknown };
  try {
    body = (await request.json()) as { queryCacheId?: unknown; rating?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const queryCacheId = asString(body.queryCacheId, "").trim();
  const rating = asString(body.rating, "").trim().toLowerCase();

  if (!queryCacheId) {
    return NextResponse.json({ error: "queryCacheId is required" }, { status: 400 });
  }
  if (rating !== "up" && rating !== "down") {
    return NextResponse.json({ error: "rating must be 'up' or 'down'" }, { status: 400 });
  }

  try {
    const row = await queryRow<FeedbackRow>(
      session.tenantId,
      `
        INSERT INTO lex_pulse.answer_feedback (
          query_cache_id,
          tenant_id,
          user_id,
          rating
        )
        VALUES ($1::uuid, $2, $3, $4)
        ON CONFLICT (query_cache_id, user_id)
        DO UPDATE SET
          rating = EXCLUDED.rating,
          created_at = now()
        RETURNING
          id,
          query_cache_id::text AS query_cache_id,
          user_id,
          rating,
          created_at
      `,
      [queryCacheId, session.tenantId, session.sub, rating],
    );

    if (!row) {
      return NextResponse.json({ error: "Unable to store feedback" }, { status: 500 });
    }

    const feedback: LexPulseFeedback = {
      feedbackId: row.id,
      queryCacheId: row.query_cache_id,
      userId: row.user_id,
      rating: row.rating === "down" ? "down" : "up",
      createdAt:
        row.created_at instanceof Date ? row.created_at.toISOString() : asOptionalString(row.created_at) ?? String(row.created_at),
    };

    return NextResponse.json(feedback);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
