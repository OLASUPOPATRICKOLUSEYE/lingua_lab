/**
 * Test support for the RLS suite. Provides a PRIVILEGED admin connection used
 * ONLY for seeding/teardown of tenant fixtures (it bypasses RLS so it can
 * create rows in multiple schools). The assertions themselves must go through
 * the application path (`withClaims` in src/client.ts), never this handle.
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../schema";

config({ path: join(dirname(fileURLToPath(import.meta.url)), "../../../../.env") });

const adminUrl = process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL;
if (!adminUrl) {
  throw new Error(
    "DATABASE_ADMIN_URL / DATABASE_URL must be set to run the RLS tests.",
  );
}

export const adminPool = new Pool({ connectionString: adminUrl });
export const adminDb = drizzle(adminPool, { schema });

export async function closeAdminPool(): Promise<void> {
  await adminPool.end();
}
