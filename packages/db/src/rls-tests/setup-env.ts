// Loaded before any test module (vitest setupFiles) so DATABASE_URL /
// DATABASE_ADMIN_URL are present when src/client.ts evaluates its pool.
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { config } from "dotenv";

config({ path: join(dirname(fileURLToPath(import.meta.url)), "../../../../.env") });
