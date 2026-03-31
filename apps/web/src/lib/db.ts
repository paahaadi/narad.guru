import { Pool, type PoolClient, type QueryResultRow } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __naradWebPool: Pool | undefined;
}

function getDatabaseUrl() {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }
  return connectionString;
}

export function getDbPool() {
  if (!globalThis.__naradWebPool) {
    globalThis.__naradWebPool = new Pool({
      connectionString: getDatabaseUrl(),
      max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
    });
  }

  return globalThis.__naradWebPool;
}

export async function withTenant<T>(
  tenantId: string,
  callback: (client: PoolClient) => Promise<T>,
) {
  const client = await getDbPool().connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function queryRows<T extends QueryResultRow = QueryResultRow>(
  tenantId: string,
  text: string,
  values: unknown[] = [],
) {
  return withTenant(tenantId, async (client) => {
    const result = await client.query<T>(text, values);
    return result.rows;
  });
}

export async function queryRow<T extends QueryResultRow = QueryResultRow>(
  tenantId: string,
  text: string,
  values: unknown[] = [],
) {
  return withTenant(tenantId, async (client) => {
    const result = await client.query<T>(text, values);
    return result.rows[0] ?? null;
  });
}
