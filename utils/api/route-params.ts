import { z } from "zod";

/**
 * Validates a UUID path parameter.
 *
 * Path params are a trust boundary like any other (Iron Law 9), but they were
 * reaching Drizzle unvalidated. Postgres then rejects a malformed uuid with a
 * type error, which surfaces as a 500 — an unhandled server error for what is
 * plainly a bad request. Callers get null and should return 400.
 */
const uuidSchema = z.string().uuid();

export function parseUuidParam(value: string): string | null {
  const result = uuidSchema.safeParse(value);
  return result.success ? result.data : null;
}
