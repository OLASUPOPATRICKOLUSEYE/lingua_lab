import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Load env from the repo root .env (single source of truth for DATABASE_URL).
config({ path: "../../.env" });

// Migrations run DDL, which the non-privileged app role cannot do. Prefer the
// admin URL for drizzle-kit; fall back to DATABASE_URL for environments (e.g.
// Supabase) where the migration connection is configured separately.
const databaseUrl = process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "DATABASE_ADMIN_URL / DATABASE_URL is not set. Copy .env.example to .env at the repo root and fill it in.",
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dbCredentials: { url: databaseUrl },
  // RLS policies are hand-written in ./drizzle/rls/*.sql and applied
  // separately (see data-model.md) — drizzle-kit does not own them.
  verbose: true,
  strict: true,
});
