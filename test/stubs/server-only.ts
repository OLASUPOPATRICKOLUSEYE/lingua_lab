/**
 * Test stub for the `server-only` package.
 *
 * The real module throws unless it is resolved under the "react-server"
 * export condition, which vitest's node environment does not set. Aliasing it
 * here (see vitest.config.ts) lets unit tests import server modules directly
 * while the real guard still applies to the Next.js build.
 */
export {};
