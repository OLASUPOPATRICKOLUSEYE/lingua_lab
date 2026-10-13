import { NextResponse, type NextRequest } from "next/server";
import { getSessionFromRequest } from "@/utils/auth/session-middleware";

// Kept in sync with ROLE_HOME in utils/auth/dal.ts.
// Inlined here so proxy never imports "server-only" modules.
const ROLE_HOME: Record<string, string> = {
  system_admin: "/admin",
  dept_head: "/admin",
  teacher: "/teacher",
  student: "/student",
};

// Must match the set gated by requireRole / verifySession in the DAL.
const protectedPrefixes = ["/admin", "/teacher", "/student", "/settings"];

/**
 * Optimistic session gate. Checks for a valid lingua_session cookie and
 * redirects unauthenticated users away from protected routes (and authenticated
 * users away from /login). This is an OPTIMISTIC check — real authorization
 * (role enforcement, RLS) happens in the DAL and at the database, not here.
 */
export async function proxy(request: NextRequest) {
  const session = await getSessionFromRequest(request);

  const path = request.nextUrl.pathname;
  const isAuthRoute = path === "/login";
  const isProtected = protectedPrefixes.some((p) => path.startsWith(p));

  if (!session && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (session && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = ROLE_HOME[session.role] ?? "/onboarding";
    return NextResponse.redirect(url);
  }

  return NextResponse.next({ request });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
