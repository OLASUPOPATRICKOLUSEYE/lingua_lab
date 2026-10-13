import { db, sessions } from "@lingua/db";
import { lt } from "drizzle-orm";

/**
 * Deletes sessions whose expiry has passed.
 *
 * Deliberately NOT in session.ts: that module imports `next/headers` for cookie
 * access, which does not resolve outside the Next runtime — importing it from a
 * BullMQ worker crashes the process on startup. Maintenance needs only the
 * database, so it lives apart from anything request-scoped.
 *
 * Nothing purged these before, so the table grew monotonically. That matters
 * more than usual here: `sessions` is one of the three tables with RLS
 * deliberately disabled, so it is the last place to let unused rows pile up.
 * Expired rows are already unusable (verifySession filters on expires_at); this
 * stops them accumulating. Returns the row count so the caller can log it.
 */
export async function deleteExpiredSessions(): Promise<number> {
  const deleted = await db
    .delete(sessions)
    .where(lt(sessions.expiresAt, new Date()))
    .returning({ id: sessions.id });
  return deleted.length;
}
