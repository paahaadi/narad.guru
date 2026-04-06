import { NextResponse } from "next/server";
import { getCustodyLog } from "@/lib/workspaces/investigations";
import { requireApiSession } from "../../_helpers";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ investigationId: string }> },
) {
  const session = await requireApiSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { investigationId } = await params;
  const entries = await getCustodyLog(session.tenantId, investigationId);
  return NextResponse.json({ entries });
}
