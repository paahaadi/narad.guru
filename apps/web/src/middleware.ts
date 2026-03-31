import { NextResponse, type NextRequest } from "next/server";
import { extractTokenFromRequest, verifySessionToken } from "@/lib/auth";

const PROTECTED_PREFIXES = [
  "/geostrat",
  "/pulseboard",
  "/corpwatch",
  "/lexpulse",
  "/watchlists",
  "/investigations",
  "/briefings",
  "/api/session",
  "/api/pulseboard",
  "/api/geostrat",
  "/api/corpwatch",
  "/api/lexpulse",
  "/api/watchlists",
];

function isProtectedPath(pathname: string) {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export async function middleware(request: NextRequest) {
  if (!isProtectedPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const token = extractTokenFromRequest(request);
  if (!token) {
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const deniedUrl = new URL("/access-denied", request.url);
    deniedUrl.searchParams.set("from", request.nextUrl.pathname);
    return NextResponse.redirect(deniedUrl);
  }

  try {
    await verifySessionToken(token);
    return NextResponse.next();
  } catch {
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.redirect(new URL("/access-denied", request.url));
  }
}

export const config = {
  matcher: [
    "/geostrat/:path*",
    "/pulseboard/:path*",
    "/corpwatch/:path*",
    "/lexpulse/:path*",
    "/watchlists/:path*",
    "/investigations/:path*",
    "/briefings/:path*",
    "/api/session/:path*",
    "/api/pulseboard/:path*",
    "/api/geostrat/:path*",
    "/api/corpwatch/:path*",
    "/api/lexpulse/:path*",
    "/api/watchlists/:path*",
  ],
};
