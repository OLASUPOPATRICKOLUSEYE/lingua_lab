import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Load .env (DATABASE_URL / DATABASE_ADMIN_URL) before any module — the
    // client pool reads them at import time.
    setupFiles: ["src/rls-tests/setup-env.ts"],
    // RLS tests open real Postgres connections and seed shared rows — run them
    // serially in a single process to keep tenant fixtures deterministic.
    fileParallelism: false,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    hookTimeout: 30_000,
    testTimeout: 30_000,
    include: ["src/**/*.test.ts"],
  },
});
