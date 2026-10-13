import "server-only";

import {
  classMemberships,
  classes,
  liveSessionAttendance,
  liveSessions,
  users,
  withClaims,
} from "@lingua/db";
import { and, asc, desc, eq, gt, sql } from "drizzle-orm";
import type { SessionUser } from "@/utils/auth/dal";
import { toAuthClaims } from "@/utils/auth/dal";
import type { LiveSessionSummary } from "@/utils/live-sessions/state";

const summaryColumns = {
  id: liveSessions.id,
  classId: liveSessions.classId,
  className: classes.name,
  classSlug: classes.slug,
  hostName: users.fullName,
  provider: liveSessions.provider,
  joinUrl: liveSessions.joinUrl,
  title: liveSessions.title,
  startsAt: liveSessions.startsAt,
  endsAt: liveSessions.endsAt,
  canceledAt: liveSessions.canceledAt,
};

export interface LiveSessionAttendee {
  studentId: string;
  fullName: string;
  checkedIn: boolean;
  joinedAt: Date;
}

/**
 * The attendance register for one live class: everyone on the class roster,
 * annotated with whether they opened the meeting.
 *
 * Built from the roster outward (left join FROM class_memberships) rather than
 * from the attendance rows, because the useful question is "who is missing?" —
 * a register that only lists arrivals cannot answer it.
 */
export async function getLiveSessionAttendance(
  session: SessionUser,
  liveSessionId: string,
): Promise<{ attended: LiveSessionAttendee[]; absent: { studentId: string; fullName: string }[] } | null> {
  return withClaims(toAuthClaims(session), async (tx) => {
    const [target] = await tx
      .select({ id: liveSessions.id, classId: liveSessions.classId, teacherId: classes.teacherId })
      .from(liveSessions)
      .innerJoin(classes, eq(classes.id, liveSessions.classId))
      .where(eq(liveSessions.id, liveSessionId))
      .limit(1);

    if (!target) return null;
    if (session.role === "teacher" && target.teacherId !== session.id) return null;

    const rows = await tx
      .select({
        studentId: users.id,
        fullName: users.fullName,
        checkedIn: liveSessionAttendance.checkedIn,
        joinedAt: liveSessionAttendance.joinedAt,
      })
      .from(classMemberships)
      .innerJoin(users, eq(users.id, classMemberships.studentId))
      .leftJoin(
        liveSessionAttendance,
        and(
          eq(liveSessionAttendance.liveSessionId, target.id),
          eq(liveSessionAttendance.studentId, classMemberships.studentId),
        ),
      )
      .where(eq(classMemberships.classId, target.classId))
      .orderBy(asc(users.fullName));

    return {
      attended: rows
        .filter((row): row is typeof row & { joinedAt: Date; checkedIn: boolean } =>
          row.joinedAt !== null,
        )
        .map((row) => ({
          studentId: row.studentId,
          fullName: row.fullName,
          checkedIn: row.checkedIn,
          joinedAt: row.joinedAt,
        })),
      absent: rows
        .filter((row) => row.joinedAt === null)
        .map((row) => ({ studentId: row.studentId, fullName: row.fullName })),
    };
  });
}

export interface TeacherLiveSessionSummary extends LiveSessionSummary {
  /** Students who opened the meeting, however they did it. */
  joinedCount: number;
  /** Of those, the ones who confirmed on the check-in form. */
  checkedInCount: number;
  rosterCount: number;
}

/** Every session scheduled for a class, newest first — the teacher's view. */
export async function getClassLiveSessions(
  session: SessionUser,
  classId: string,
): Promise<TeacherLiveSessionSummary[]> {
  const rows = await withClaims(toAuthClaims(session), (tx) =>
    tx
      .select({
        ...summaryColumns,
        joinedCount: sql<number>`(
          select count(*) from live_session_attendance att
          where att.live_session_id = ${liveSessions.id}
        )`.mapWith(Number),
        checkedInCount: sql<number>`(
          select count(*) from live_session_attendance att
          where att.live_session_id = ${liveSessions.id} and att.checked_in
        )`.mapWith(Number),
        rosterCount: sql<number>`(
          select count(*) from class_memberships cm
          where cm.class_id = ${liveSessions.classId}
        )`.mapWith(Number),
      })
      .from(liveSessions)
      .innerJoin(classes, eq(classes.id, liveSessions.classId))
      .innerJoin(users, eq(users.id, classes.teacherId))
      .where(eq(liveSessions.classId, classId))
      .orderBy(desc(liveSessions.startsAt))
      .limit(50),
  );

  return rows as TeacherLiveSessionSummary[];
}

/**
 * Live-or-upcoming sessions for the classes a student is actually enrolled in.
 * RLS gives tenant isolation; the membership join is what stops a student
 * seeing another class's session inside their own school.
 */
export async function getStudentLiveSessions(
  session: SessionUser,
): Promise<LiveSessionSummary[]> {
  const rows = await withClaims(toAuthClaims(session), (tx) =>
    tx
      .select(summaryColumns)
      .from(liveSessions)
      .innerJoin(classes, eq(classes.id, liveSessions.classId))
      .innerJoin(users, eq(users.id, classes.teacherId))
      .innerJoin(
        classMemberships,
        and(
          eq(classMemberships.classId, liveSessions.classId),
          eq(classMemberships.studentId, session.id),
        ),
      )
      // Anything that has not finished yet, so a cancellation stays visible to
      // students who were expecting the class.
      .where(gt(liveSessions.endsAt, new Date()))
      .orderBy(asc(liveSessions.startsAt))
      .limit(5),
  );

  return rows as LiveSessionSummary[];
}
