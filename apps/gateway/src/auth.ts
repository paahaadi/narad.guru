import { createRemoteJWKSet, importSPKI, jwtVerify, type JWTPayload } from "jose";
import type { JwtClaims } from "./contracts.js";

export type GatewayAuthConfig = {
  issuer: string;
  publicKeyUrl?: string;
  publicKeyPem?: string;
};

export type VerifiedGatewayPrincipal = {
  claims: JwtClaims;
};

export type GatewayAccessTokenSource = {
  authorization?: string;
  tokenQueryParam?: string;
  secWebSocketProtocol?: string;
};

function claimsFromPayload(payload: JWTPayload): JwtClaims {
  const { sub, tenant_id, role, clearance_level, iss, exp, ...rest } = payload as JWTPayload & {
    tenant_id?: unknown;
    role?: unknown;
    clearance_level?: unknown;
  };

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
    tenant_id,
    role,
    clearance_level,
    iss,
    exp,
    ...rest,
  };
}

export async function verifyGatewayJwt(
  token: string,
  config: GatewayAuthConfig,
): Promise<VerifiedGatewayPrincipal> {
  if (!config.issuer) {
    throw new Error("JWT issuer is required");
  }

  const key = config.publicKeyUrl
    ? createRemoteJWKSet(new URL(config.publicKeyUrl))
    : config.publicKeyPem
      ? await importSPKI(config.publicKeyPem, "RS256")
      : undefined;

  if (!key) {
    throw new Error("JWT public key configuration is required");
  }

  const { payload } = await jwtVerify(token, key as never, {
    issuer: config.issuer,
  });

  return { claims: claimsFromPayload(payload) };
}

function isJwtLike(token: string): boolean {
  return token.split(".").length === 3 && token.length > 20;
}

export function resolveGatewayAccessToken(source: GatewayAccessTokenSource): string {
  if (source.authorization?.startsWith("Bearer ")) {
    return source.authorization.slice("Bearer ".length);
  }

  if (source.tokenQueryParam) {
    return source.tokenQueryParam;
  }

  if (source.secWebSocketProtocol) {
    const protocols = source.secWebSocketProtocol
      .split(",")
      .map((protocol) => protocol.trim())
      .filter(Boolean);

    for (const protocol of protocols) {
      if (protocol.startsWith("Bearer ")) {
        return protocol.slice("Bearer ".length);
      }
      if (protocol.startsWith("token.")) {
        return protocol.slice("token.".length);
      }
      if (isJwtLike(protocol)) {
        return protocol;
      }
    }
  }

  throw new Error("Missing access token");
}
