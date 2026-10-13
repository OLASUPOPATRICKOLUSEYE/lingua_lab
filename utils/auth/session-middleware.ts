// No "server-only" — this module is safe to import from proxy.ts (middleware).
// It reads the session cookie from the NextRequest object rather than next/headers,
// which is the only correct way to access cookies in middleware.
import { createHash } from "node:crypto";
import { db, sql } from "@lingua/db";
import type { NextRequest } from "next/server";
import type { UserRole } from "@lingua/db";

const COOKIE_NAME = "lingua_session";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Minimal session shape needed for routing decisions in proxy.ts. */
export interface MiddlewareSession {
  id: string;
  role: UserRole;
}

/**
 * Validates the lingua_session cookie present in a NextRequest and returns the
 * user's id + role, or null if the cookie is absent, expired, or unrecognised.
 *
 * This is the middleware-safe counterpart of getSession() in session.ts.
 * Unlike getSession() it does NOT use cookies()/next/headers — those are
 * Server-Component-only APIs and throw in middleware.
 *
 * Performance note: this performs one DB query per matched request, comparable
 * to the prior supabase.auth.getUser() HTTP call. If you later want a zero-DB
 * optimistic check here, replace the token storage with a signed JWT and verify
 * the signature instead of hitting the DB.
 */
export async function getSessionFromRequest(
  request: NextRequest,
): Promise<MiddlewareSession | null> {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const result = await db.execute(
    sql`select id, role from session_lookup_by_token_hash(${hashToken(token)})`,
  );
  const row = result.rows[0] as { id: string; role: string } | undefined;
  if (!row) return null;
  return { id: row.id, role: row.role as UserRole };
}
