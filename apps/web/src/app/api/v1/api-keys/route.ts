import { NextResponse } from "next/server";
import { requireSessionFromRequest } from "@/lib/auth";
import { createApiKeyRecord, listApiKeys } from "@/lib/api-auth";

export async function GET(request: Request) {
  const session = await requireSessionFromRequest(request);

  const keys = await listApiKeys(session.tenantId, session.sub);
  return NextResponse.json(keys);
}

export async function POST(request: Request) {
  const session = await requireSessionFromRequest(request);

  const body = (await request.json()) as { name?: string; scopes?: string[] };
  const name = body.name?.trim();

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const validScopes = ["read", "write", "admin"];
  const scopes = (body.scopes || ["read"]).filter((s) => validScopes.includes(s));
  if (scopes.length === 0) scopes.push("read");

  const result = await createApiKeyRecord(
    session.tenantId,
    session.sub,
    name,
    scopes,
  );

  return NextResponse.json(
    {
      ...result,
      warning: "Store this API key securely — it will not be shown again.",
    },
    { status: 201 },
  );
}
