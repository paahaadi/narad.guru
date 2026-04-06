/**
 * API Key Authentication & Rate Limiting (Track 5C)
 * ===================================================
 * Provides API key verification, sliding-window rate limiting,
 * and usage logging for the NARAD Developer Platform.
 */

import { createHash, randomBytes } from "crypto";
import { getDbPool, queryRow, queryRows } from "@/lib/db";

// ── Types ────────────────────────────────────────────────────────────────────

export type ApiKeyPrincipal = {
  apiKeyId: string;
  tenantId: string;
  userId: string;
  scopes: string[];
  rateLimitRpm: number;
};

type ApiKeyRow = {
  id: string;
  tenant_id: string;
  user_id: string;
  scopes: string[];
  rate_limit_rpm: number;
  is_active: boolean;
  expires_at: Date | null;
};

// ── In-memory sliding-window rate limiter ────────────────────────────────────

const rateLimitWindows = new Map<string, number[]>();

function isRateLimited(apiKeyId: string, maxRpm: number): boolean {
  const now = Date.now();
  const windowMs = 60_000;
  const cutoff = now - windowMs;

  let timestamps = rateLimitWindows.get(apiKeyId) || [];
  timestamps = timestamps.filter((t) => t > cutoff);
  timestamps.push(now);
  rateLimitWindows.set(apiKeyId, timestamps);

  return timestamps.length > maxRpm;
}

// ── Key generation helpers ───────────────────────────────────────────────────

export function generateApiKey(): { raw: string; hash: string; prefix: string } {
  const raw = `nk_${randomBytes(32).toString("hex")}`;
  const hash = hashApiKey(raw);
  const prefix = raw.slice(0, 11); // "nk_" + first 8 hex chars
  return { raw, hash, prefix };
}

export function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

// ── Key verification ─────────────────────────────────────────────────────────

export async function verifyApiKey(
  rawKey: string,
): Promise<ApiKeyPrincipal | null> {
  if (!rawKey || !rawKey.startsWith("nk_")) {
    return null;
  }

  const keyHash = hashApiKey(rawKey);
  const pool = getDbPool();
  const client = await pool.connect();

  try {
    const result = await client.query<ApiKeyRow>(
      `
        SELECT id::text, tenant_id::text, user_id::text, scopes,
               rate_limit_rpm, is_active, expires_at
        FROM core.api_keys
        WHERE key_hash = $1
        LIMIT 1
      `,
      [keyHash],
    );

    const row = result.rows[0];
    if (!row) return null;
    if (!row.is_active) return null;
    if (row.expires_at && new Date(row.expires_at) < new Date()) return null;

    // Update last_used_at (fire-and-forget)
    client
      .query("UPDATE core.api_keys SET last_used_at = now() WHERE id = $1::uuid", [
        row.id,
      ])
      .catch(() => {});

    return {
      apiKeyId: row.id,
      tenantId: row.tenant_id,
      userId: row.user_id,
      scopes: row.scopes,
      rateLimitRpm: row.rate_limit_rpm,
    };
  } finally {
    client.release();
  }
}

// ── Request handler helpers ──────────────────────────────────────────────────

export async function requireApiKey(
  request: Request,
): Promise<
  | { principal: ApiKeyPrincipal; error: null }
  | { principal: null; error: { status: number; body: Record<string, string> } }
> {
  const rawKey = request.headers.get("X-API-Key") ?? "";

  if (!rawKey) {
    return {
      principal: null,
      error: {
        status: 401,
        body: { error: "Missing X-API-Key header" },
      },
    };
  }

  const principal = await verifyApiKey(rawKey);
  if (!principal) {
    return {
      principal: null,
      error: {
        status: 401,
        body: { error: "Invalid or expired API key" },
      },
    };
  }

  if (isRateLimited(principal.apiKeyId, principal.rateLimitRpm)) {
    return {
      principal: null,
      error: {
        status: 429,
        body: { error: "Rate limit exceeded", retryAfterSeconds: "60" },
      },
    };
  }

  return { principal, error: null };
}

// ── Usage logging ────────────────────────────────────────────────────────────

export async function logApiUsage(
  apiKeyId: string,
  tenantId: string,
  endpoint: string,
  method: string,
  statusCode: number,
  responseMs: number,
) {
  const pool = getDbPool();
  pool
    .query(
      `
      INSERT INTO core.api_usage_log (api_key_id, tenant_id, endpoint, method, status_code, response_ms)
      VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6)
    `,
      [apiKeyId, tenantId, endpoint, method, statusCode, responseMs],
    )
    .catch(() => {
      // Non-critical, fire-and-forget
    });
}

// ── CRUD for API keys ────────────────────────────────────────────────────────

export async function createApiKeyRecord(
  tenantId: string,
  userId: string,
  name: string,
  scopes: string[] = ["read"],
) {
  const { raw, hash, prefix } = generateApiKey();

  type CreatedRow = { id: string; created_at: Date };
  const row = await queryRow<CreatedRow>(
    tenantId,
    `
      INSERT INTO core.api_keys (tenant_id, user_id, key_hash, key_prefix, name, scopes)
      VALUES ($1, $2::uuid, $3, $4, $5, $6)
      RETURNING id::text, created_at
    `,
    [tenantId, userId, hash, prefix, name, scopes],
  );

  return {
    id: row!.id,
    raw, // returned only once!
    prefix,
    name,
    scopes,
    createdAt: row!.created_at.toISOString(),
  };
}

export async function listApiKeys(tenantId: string, userId: string) {
  type KeyListRow = {
    id: string;
    key_prefix: string;
    name: string;
    scopes: string[];
    is_active: boolean;
    last_used_at: Date | null;
    created_at: Date;
  };

  const rows = await queryRows<KeyListRow>(
    tenantId,
    `
      SELECT id::text, key_prefix, name, scopes, is_active,
             last_used_at, created_at
      FROM core.api_keys
      WHERE tenant_id = $1 AND user_id = $2::uuid
      ORDER BY created_at DESC
    `,
    [tenantId, userId],
  );

  return rows.map((r) => ({
    id: r.id,
    prefix: r.key_prefix,
    name: r.name,
    scopes: r.scopes,
    isActive: r.is_active,
    lastUsedAt: r.last_used_at?.toISOString() ?? null,
    createdAt: r.created_at.toISOString(),
  }));
}
