import { NextResponse } from "next/server";
import {
  classMemberships,
  liveSessionAttendance,
  liveSessions,
  withClaims,
} from "@lingua/db";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireRole, toAuthClaims } from "@/utils/auth/dal";
import { isJoinable, liveSessionState } from "@/utils/live-sessions/state";

export const dynamic = "force-dynamic";

interface AttendanceRouteProps {
  params: Promise<{ id: string }>;
}

const payloadSchema = z.object({
  // false = "join without checking in". Both are real attendance signals; the
  // flag is what lets a teacher tell a confirmed check-in from a bare join.
  checkedIn: z.boolean(),
});

/**
 * Records that a student opened the meeting for a live class.
 *
 * Deliberately forgiving: this is fired alongside the navigation that opens
 * Zoom/Meet (sendBeacon), so it must never be something a student waits on.
 * Any failure here loses an attendance row — it must never cost a student
 * their class.
 */
export async function POST(
  request: Request,
  { params }: AttendanceRouteProps,
): Promise<NextResponse> {
  const session = await requireRole(["student"]);
  const { id } = await params;
  const parsed = payloadSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload." },
      { status: 400 },
    );
  }

  const outcome = await withClaims(toAuthClaims(session), async (tx) => {
    // Enrollment check, not just RLS: RLS proves the session belongs to the
    // student's SCHOOL, which is not the same as belonging to a class they are
    // actually in. Without this join a student could mark themselves present
    // for any class in the school.
    const [target] = await tx
      .select({
        id: liveSessions.id,
        startsAt: liveSessions.startsAt,
        endsAt: liveSessions.endsAt,
        canceledAt: liveSessions.canceledAt,
      })
      .from(liveSessions)
      .innerJoin(
        classMemberships,
        and(
          eq(classMemberships.classId, liveSessions.classId),
          eq(classMemberships.studentId, session.id),
        ),
      )
      .where(eq(liveSessions.id, id))
      .limit(1);

    if (!target) {
      return { type: "missing" as const };
    }

    // Only inside the join window. Otherwise a student could mark attendance
    // for a class that has not started or finished hours ago.
    if (!isJoinable(liveSessionState(target))) {
      return { type: "not_joinable" as const };
    }

    await tx
      .insert(liveSessionAttendance)
      .values({
        schoolId: session.schoolId,
        liveSessionId: target.id,
        studentId: session.id,
        checkedIn: parsed.data.checkedIn,
      })
      .onConflictDoUpdate({
        target: [
          liveSessionAttendance.liveSessionId,
          liveSessionAttendance.studentId,
        ],
        // Keep the FIRST joined_at, and let checked_in ratchet false → true
        // only: a student who skips the form and later confirms counts as
        // checked in, never the reverse.
        set: {
          checkedIn: sql`${liveSessionAttendance.checkedIn} or excluded.checked_in`,
        },
      });

    return { type: "ok" as const };
  });

  if (outcome.type === "missing") {
    return NextResponse.json(
      { error: "Live class not found for this student." },
      { status: 404 },
    );
  }

  if (outcome.type === "not_joinable") {
    return NextResponse.json(
      { error: "This live class is not open for joining right now." },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
