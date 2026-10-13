import "server-only";
import { randomBytes, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db, sessions, sql, type UserRole } from "@lingua/db";

const COOKIE_NAME = "lingua_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface SessionUser {
  id: string;
  email: string;
  schoolId: string;
  role: UserRole;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Mints a new session for the given user, stores its hash (never the raw
 * token) in `sessions`, and sets the httpOnly session cookie. Only callable
 * from a Server Action or Route Handler (cookie writes aren't allowed from
 * plain Server Components).
 */
export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await db.insert(sessions).values({
    tokenHash: hashToken(token),
    userId,
    expiresAt,
  });

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/**
 * Resolves the current session cookie to a user profile, or null if there is
 * none / it's expired / it doesn't match a session row. This is the direct
 * replacement for `supabase.auth.getUser()` — it does not redirect; callers
 * (utils/auth/dal.ts, proxy.ts) decide what to do with a null session.
 */
export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const result = await db.execute(
    sql`select id, email, school_id, role from session_lookup_by_token_hash(${hashToken(token)})`,
  );
  const row = result.rows[0] as
    | { id: string; email: string; school_id: string; role: string }
    | undefined;
  if (!row) return null;

  return { id: row.id, email: row.email, schoolId: row.school_id, role: row.role as UserRole };
}

/** Deletes the current session row (if any) and clears the cookie. */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (token) {
    await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  }
  cookieStore.delete(COOKIE_NAME);
}

/** Deletes every session for a user — used after a password reset/change. */
export async function destroyAllSessionsForUser(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}
