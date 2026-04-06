import { NextResponse } from "next/server";
import { requireSessionFromRequest } from "@/lib/auth";
import { listSources } from "@/lib/workspaces/sources";

export async function GET(request: Request) {
  let session;
  try {
    session = await requireSessionFromRequest(request);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sources = await listSources(session.tenantId);

  const healthy = sources.filter((s) => s.status === "active" && s.isActive).length;
  const degraded = sources.filter((s) => s.status === "degraded").length;
  const disabled = sources.filter((s) => !s.isActive || s.status === "disabled").length;

  return NextResponse.json({
    data: sources,
    meta: {
      total: sources.length,
      healthy,
      degraded,
      disabled,
    },
  });
}
