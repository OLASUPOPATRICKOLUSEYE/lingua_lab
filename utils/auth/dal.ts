import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { AuthClaims } from "@lingua/db";
import { getSession } from "@/utils/auth/session";
import type { UserRole } from "@lingua/db";

/**
 * The authenticated principal as the app sees it: identity from Supabase Auth,
 * profile (role, school) from our `users` row. `cache()` memoizes within a
 * single render pass so repeated calls don't re-hit Supabase / the DB.
 */
export interface SessionUser {
  id: string;
  email: string;
  schoolId: string;
  role: UserRole;
}

/**
 * Maps each role to its console home. Single source of truth for redirects.
 * The (dashboard) route group is path-transparent, so these are top-level paths
 * (`/admin`, not `/dashboard/admin`); the proxy gates this set explicitly.
 */
export const ROLE_HOME: Record<UserRole, string> = {
  system_admin: "/admin",
  dept_head: "/admin",
  teacher: "/teacher",
  student: "/student",
};

/** The authenticated route prefixes the proxy protects (the role consoles). */
export const PROTECTED_PREFIXES = ["/admin", "/teacher", "/student"] as const;

export const verifySession = cache(async (): Promise<SessionUser> => {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  return session;
});


/** Require one of the given roles, else send the user to their own home. */
export async function requireRole(allowed: UserRole[]): Promise<SessionUser> {
  const session = await verifySession();
  if (!allowed.includes(session.role)) {
    redirect(ROLE_HOME[session.role]);
  }
  return session;
}

/** Translate the verified app session into the claims shape RLS expects. */
export function toAuthClaims(session: SessionUser): AuthClaims {
  return {
    sub: session.id,
    school_id: session.schoolId,
    role: session.role,
  };
}
