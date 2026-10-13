/**
 * One-off script to create a single real user + password, now that auth is
 * self-hosted instead of Supabase. Temporary tool for testing the new login
 * flow — seed-test-users.ts still needs a proper update for this (tracked
 * separately), this is just enough to verify login works end to end.
 *
 * Run: pnpm --filter @lingua/db tsx src/scripts/create-test-user.ts
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { config } from "dotenv";
import { Client } from "pg";
import { hash } from "@node-rs/argon2";

config({ path: join(dirname(fileURLToPath(import.meta.url)), "../../../../.env") });

const adminUrl = process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL;
if (!adminUrl) throw new Error("DATABASE_ADMIN_URL / DATABASE_URL must be set.");

const SCHOOL_ID = "11111111-1111-1111-1111-111111111111";
const TEST_EMAIL = "test@gmail.com";
const TEST_PASSWORD = "TestPassword123!"; // change after first login

async function main() {
  const c = new Client({ connectionString: adminUrl });
  await c.connect();
  try {
    await c.query("begin");

    await c.query(
      `insert into schools (id, name, slug, plan)
       values ($1, 'Test School', 'test-school', 'standard')
       on conflict (id) do nothing`,
      [SCHOOL_ID],
    );

    const { rows } = await c.query(
      `insert into users (school_id, role, full_name, email, language_pref)
       values ($1, 'system_admin', 'Test Admin', $2, 'en')
       on conflict (email) do update set email = excluded.email
       returning id`,
      [SCHOOL_ID, TEST_EMAIL],
    );
    const userId = rows[0].id;

    const passwordHash = await hash(TEST_PASSWORD);

    await c.query(
      `insert into auth_credentials (user_id, password_hash)
       values ($1, $2)
       on conflict (user_id) do update set password_hash = excluded.password_hash`,
      [userId, passwordHash],
    );

    await c.query("commit");
    console.log(`✓ Test user ready: ${TEST_EMAIL} / ${TEST_PASSWORD}`);
    console.log(`  user id: ${userId}`);
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    await c.end();
  }
}

main().catch((e) => {
  console.error("Failed:", e);
  process.exit(1);
});