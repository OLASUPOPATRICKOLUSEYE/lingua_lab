import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { Pool, type PoolClient } from "pg";
import * as schema from "./schema";

/** A tenant-scoped Drizzle handle bound to a single pooled connection. */
export type TenantTx = NodePgDatabase<typeof schema>;

/**
 * The application database connection.
 *
 * CRITICAL (AGENTS.md rule #2): DATABASE_URL must point at a NON-superuser,
 * NON-BYPASSRLS role. A service-role / superuser connection here silently
 * bypasses every RLS policy — the policies would pass a manual psql check but
 * be defeated by the app's own connection. The RLS test suite connects through
 * THIS module's pool to prove enforcement on the real path.
 */
function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and fill it in.",
    );
  }
  return url;
}

export const pool = new Pool({ connectionString: getDatabaseUrl() });

export const db = drizzle(pool, { schema });

export type Database = typeof db;

/**
 * The auth claims that RLS policies read. Mirrors the subset of a Supabase JWT
 * that our policies depend on: `auth.jwt() ->> 'school_id'` and `... ->> 'sub'`.
 */
export interface AuthClaims {
  sub: string; // user id (auth.users.id)
  school_id: string;
  role?: string;
}

/**
 * Run a callback with Postgres session settings that emulate an authenticated
 * Supabase request: `request.jwt.claims` is set to the given claims for the
 * duration of a single transaction, and the session role is switched to the
 * non-privileged `authenticated` role so RLS is enforced.
 *
 * This is the ONLY sanctioned way to issue tenant-scoped queries. It is what
 * the tRPC context will use in production (deriving claims from the verified
 * Supabase session) and what the RLS test suite uses to act as each test user.
 *
 * `set_config(..., true)` makes the setting transaction-local, so it is
 * automatically reset when the transaction ends — no leakage between requests.
 */
export async function withClaims<T>(
  claims: AuthClaims,
  fn: (tx: TenantTx) => Promise<T>,
): Promise<T> {
  const client: PoolClient = await pool.connect();
  try {
    await client.query("begin");
    // Switch off any elevated privileges of the connection role for the scope
    // of this transaction, then apply the JWT claims that policies read.
    await client.query("set local role authenticated");
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify(claims),
    ]);
    const tx: TenantTx = drizzle(client, { schema });
    const result = await fn(tx);
    await client.query("commit");
    return result;
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

/** Close the pool — for graceful shutdown and test teardown. */
export async function closePool(): Promise<void> {
  await pool.end();
}

export { sql, schema };
