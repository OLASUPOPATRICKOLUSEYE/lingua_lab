/**
 * One-off script to set a password for `users` rows that predate the
 * hand-rolled auth cutover (created under Supabase Auth, which never stored
 * a password in our own Postgres — there is nothing to migrate, so these
 * accounts are otherwise permanently locked out). Sets the same temporary
 * password for each listed email; each person should change it on first
 * login via the normal reset-password flow.
 *
 * Run: pnpm --filter @lingua/db tsx src/scripts/reset-legacy-passwords.ts
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { config } from "dotenv";
import { Client } from "pg";
import { hash } from "@node-rs/argon2";

config({ path: join(dirname(fileURLToPath(import.meta.url)), "../../../../.env") });

const adminUrl = process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL;
if (!adminUrl) throw new Error("DATABASE_ADMIN_URL / DATABASE_URL must be set.");

const TEMP_PASSWORD = "ChangeMe123!"; // shared temporary password — change on first login

const EMAILS = [
  "depthead@example.com",
  "testing@gmail.com",
  "student@example.com",
  "teacher@example.com",
  "fred@rout.com",
  "anuoluwaotoibhi@gmail.com",
];

async function main() {
  const c = new Client({ connectionString: adminUrl });
  await c.connect();
  try {
    const passwordHash = await hash(TEMP_PASSWORD);

    for (const email of EMAILS) {
      const { rows } = await c.query(
        `select id from users where email = $1`,
        [email],
      );
      const user = rows[0] as { id: string } | undefined;
      if (!user) {
        console.log(`✗ skip ${email}: no matching users row`);
        continue;
      }

      await c.query(
        `insert into auth_credentials (user_id, password_hash)
         values ($1, $2)
         on conflict (user_id) do update set password_hash = excluded.password_hash`,
        [user.id, passwordHash],
      );
      console.log(`✓ ${email} — password set`);
    }

    console.log(`\nTemporary password for all accounts above: ${TEMP_PASSWORD}`);
  } finally {
    await c.end();
  }
}

main().catch((e) => {
  console.error("Failed:", e);
  process.exit(1);
});
