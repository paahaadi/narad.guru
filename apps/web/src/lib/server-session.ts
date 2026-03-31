import { cookies, headers } from "next/headers";
import { getSessionCookieKey, verifySessionToken } from "@/lib/auth";

function readBearerToken(authorizationHeader: string | null) {
  if (!authorizationHeader?.startsWith("Bearer ")) {
    return null;
  }

  return authorizationHeader.slice("Bearer ".length).trim();
}

export async function getServerPrincipal() {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const token =
    cookieStore.get(getSessionCookieKey())?.value ??
    readBearerToken(headerStore.get("authorization"));

  if (!token) {
    throw new Error("Unauthorized");
  }

  return verifySessionToken(token);
}
