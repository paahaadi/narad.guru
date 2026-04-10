import { NextResponse } from "next/server";
import { getIntelligenceServiceUrl, requireApiSession, tenantHeaders } from "../_helpers";

export async function POST(request: Request) {
  const session = await requireApiSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();

    const response = await fetch(new URL("/api/agents/chat", getIntelligenceServiceUrl()), {
      method: "POST",
      headers: {
        ...tenantHeaders(session.tenantId),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (response.ok) {
      const payload = await response.json();
      return NextResponse.json(payload);
    }
    
    return NextResponse.json(
      { error: "Upstream intelligence service returned an error." },
      { status: response.status }
    );
  } catch (error) {
    return NextResponse.json(
      { error: "Unable to reach intelligence service.", details: String(error) },
      { status: 503 }
    );
  }
}
