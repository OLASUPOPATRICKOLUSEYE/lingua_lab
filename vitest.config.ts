import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vitest/config";

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    include: [
      "server/**/*.test.ts",
      "app/**/*.test.ts",
      "utils/**/*.test.ts",
    ],
    environment: "node",
  },
  resolve: {
    alias: {
      // Mirror the tsconfig "@/*" path so a module under test can import a real
      // helper, not just a vi.mock'd one. Without this, any unmocked "@/..."
      // import fails to resolve at runtime.
      "@": rootDir,
      // "server-only" throws unless resolved under the react-server condition,
      // which vitest's node environment does not set. Stub it so server modules
      // keep their build-time client-import guard AND stay unit-testable.
      "server-only": resolve(rootDir, "test/stubs/server-only.ts"),
    },
  },
});
