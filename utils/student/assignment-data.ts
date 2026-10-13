import "server-only";

import {
  activities,
  activityAssignments,
  classMemberships,
  withClaims,
} from "@lingua/db";
import { and, desc, eq } from "drizzle-orm";
import type { SessionUser } from "@/utils/auth/dal";
import { toAuthClaims } from "@/utils/auth/dal";
import type { StudentAssignment } from "./assignments";
import { mapActivityRowToStudentAssignment } from "./assignment-shape";

/**
 * Students see only activities assigned to classes they belong to. This is the
 * targeting layer above school-wide publishing.
 */
export async function listStudentAssignments(
  session: SessionUser,
): Promise<StudentAssignment[]> {
  return withClaims(toAuthClaims(session), async (tx) => {
    const assignedRows = await tx
      .select({
        id: activities.id,
        title: activities.title,
        prompt: activities.prompt,
        targetLanguage: activities.targetLanguage,
        passageText: activities.passageText,
        teacherName: activities.teacherName,
        teacherReferenceText: activities.teacherReferenceText,
        referenceAudioPath: activities.referenceAudioPath,
        referenceVideoPath: activities.referenceVideoPath,
        coachNote: activities.coachNote,
        submissionModes: activities.submissionModes,
        timeLimitSeconds: activities.timeLimitSeconds,
      })
      .from(activityAssignments)
      .innerJoin(activities, eq(activityAssignments.activityId, activities.id))
      .innerJoin(
        classMemberships,
        and(
          eq(classMemberships.classId, activityAssignments.classId),
          eq(classMemberships.studentId, session.id),
        ),
      )
      .where(eq(activityAssignments.status, "assigned"))
      .orderBy(desc(activityAssignments.assignedAt));

    if (assignedRows.length > 0) {
      const deduped = new Map<string, StudentAssignment>();
      for (const row of assignedRows) {
        if (!deduped.has(row.id)) {
          deduped.set(row.id, mapActivityRowToStudentAssignment(row));
        }
      }
      return [...deduped.values()];
    }

    return [];
  });
}

export async function getStudentAssignmentForStudent(
  session: SessionUser,
  id: string,
): Promise<StudentAssignment | null> {
  const assignments = await listStudentAssignments(session);
  return assignments.find((assignment) => assignment.id === id) ?? null;
}

/**
 * Resolve the specific `activity_assignments.id` a student's submission is
 * being made against, so the submission can FREEZE that context instead of
 * inferring class from mutable memberships later (see
 * packages/db/src/rls-tests/submission-class-context.rls.test.ts).
 *
 * A student can belong to several classes the same activity is assigned to, so
 * there can be more than one candidate. We resolve deterministically to the
 * most recently assigned one and stamp it on the row — the point is not that
 * "most recent" is semantically perfect, but that the choice is made ONCE at
 * capture and never silently recomputed. Returns null when no assigned row
 * covers this student+activity (the caller has already checked visibility, so
 * this only happens in edge cases like a race with revocation).
 */
export async function resolveAssignmentIdForSubmission(
  session: SessionUser,
  activityId: string,
): Promise<string | null> {
  return withClaims(toAuthClaims(session), async (tx) => {
    const [row] = await tx
      .select({ id: activityAssignments.id })
      .from(activityAssignments)
      .innerJoin(
        classMemberships,
        and(
          eq(classMemberships.classId, activityAssignments.classId),
          eq(classMemberships.studentId, session.id),
        ),
      )
      .where(
        and(
          eq(activityAssignments.activityId, activityId),
          eq(activityAssignments.status, "assigned"),
        ),
      )
      .orderBy(desc(activityAssignments.assignedAt))
      .limit(1);

    return row?.id ?? null;
  });
}
