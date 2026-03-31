import { createRemoteJWKSet, importSPKI, jwtVerify, type JWTPayload } from "jose";
import type { NextRequest } from "next/server";

export type JwtClaims = {
  sub: string;
  tenant_id: string;
  role: string;
  clearance_level: string;
  iss: string;
  exp: number;
  [key: string]: unknown;
};

export type SessionPrincipal = {
  sub: string;
  tenantId: string;
  role: string;
  clearanceLevel: string;
  issuer: string;
  expiresAt: number;
  rawClaims: JwtClaims;
};

let cachedRemoteJwkSet: ReturnType<typeof createRemoteJWKSet> | null = null;
let cachedPemKeyPromise: Promise<CryptoKey> | null = null;

function getSessionCookieName() {
  return process.env.APP_AUTH_COOKIE_NAME?.trim() || "narad_session";
}

function getIssuer() {
  const issuer = process.env.JWT_ISSUER?.trim();
  if (!issuer) {
    throw new Error("JWT_ISSUER is required");
  }
  return issuer;
}

function parseCookie(cookieHeader: string | null, name: string) {
  if (!cookieHeader) {
    return null;
  }

  const matches = cookieHeader.split(";").map((part) => part.trim());
  for (const entry of matches) {
    if (!entry.startsWith(`${name}=`)) {
      continue;
    }
    return decodeURIComponent(entry.slice(name.length + 1));
  }

  return null;
}

function readBearerToken(authorizationHeader: string | null) {
  if (!authorizationHeader?.startsWith("Bearer ")) {
    return null;
  }

  return authorizationHeader.slice("Bearer ".length).trim();
}

async function resolveVerificationKey() {
  const publicKeyUrl = process.env.JWT_PUBLIC_KEY_URL?.trim();
  const publicKeyPem = process.env.JWT_PUBLIC_KEY_PEM?.trim();

  if (publicKeyUrl) {
    if (!cachedRemoteJwkSet) {
      cachedRemoteJwkSet = createRemoteJWKSet(new URL(publicKeyUrl));
    }
    return cachedRemoteJwkSet;
  }

  if (publicKeyPem) {
    if (!cachedPemKeyPromise) {
      cachedPemKeyPromise = importSPKI(publicKeyPem, "RS256");
    }
    return cachedPemKeyPromise;
  }

  throw new Error("JWT public key configuration is required");
}

function claimsFromPayload(payload: JWTPayload): SessionPrincipal {
  const { sub, tenant_id, role, clearance_level, iss, exp } = payload as JwtClaims;

  if (typeof sub !== "string") {
    throw new Error("JWT missing sub");
  }
  if (typeof tenant_id !== "string") {
    throw new Error("JWT missing tenant_id");
  }
  if (typeof role !== "string") {
    throw new Error("JWT missing role");
  }
  if (typeof clearance_level !== "string") {
    throw new Error("JWT missing clearance_level");
  }
  if (typeof iss !== "string") {
    throw new Error("JWT missing iss");
  }
  if (typeof exp !== "number") {
    throw new Error("JWT missing exp");
  }

  return {
    sub,
    tenantId: tenant_id,
    role,
    clearanceLevel: clearance_level,
    issuer: iss,
    expiresAt: exp,
    rawClaims: payload as JwtClaims,
  };
}

export async function verifySessionToken(token: string) {
  const key = await resolveVerificationKey();
  const { payload } = await jwtVerify(token, key as never, {
    issuer: getIssuer(),
  });

  return claimsFromPayload(payload);
}

export function extractTokenFromRequest(request: Request | NextRequest) {
  const cookieName = getSessionCookieName();
  const authToken = readBearerToken(request.headers.get("authorization"));
  if (authToken) {
    return authToken;
  }

  return parseCookie(request.headers.get("cookie"), cookieName);
}

export async function readSessionFromRequest(request: Request | NextRequest) {
  const token = extractTokenFromRequest(request);
  if (!token) {
    return null;
  }

  try {
    return await verifySessionToken(token);
  } catch {
    return null;
  }
}

export async function requireSessionFromRequest(request: Request | NextRequest) {
  const principal = await readSessionFromRequest(request);
  if (!principal) {
    throw new Error("Unauthorized");
  }
  return principal;
}

export function getSessionCookieKey() {
  return getSessionCookieName();
}
