import { NextResponse } from "next/server";
import { requireSessionFromRequest } from "@/lib/auth";

export async function GET(request: Request) {
  const session = await requireSessionFromRequest(request);

  return NextResponse.json({
    sub: session.sub,
    tenantId: session.tenantId,
    role: session.role,
    clearanceLevel: session.clearanceLevel,
    issuer: session.issuer,
    expiresAt: session.expiresAt,
  });
}
