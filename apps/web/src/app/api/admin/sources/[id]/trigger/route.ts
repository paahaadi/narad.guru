import { NextResponse } from "next/server";
import { getIntelligenceServiceUrl, requireApiSession, tenantHeaders } from "../../_helpers";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await requireApiSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = params;

  try {
    const response = await fetch(new URL(`/api/admin/sources/${id}/trigger?force=true`, getIntelligenceServiceUrl()), {
      method: "POST",
      headers: tenantHeaders(session.tenantId),
    });

    if (response.ok) {
      const payload = await response.json();
      return NextResponse.json(payload, { status: 202 });
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
