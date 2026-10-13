import "server-only";

import { activities, activityAssignments, classes, withClaims } from "@lingua/db";
import { and, asc, eq } from "drizzle-orm";
import type { SessionUser } from "@/utils/auth/dal";
import { toAuthClaims } from "@/utils/auth/dal";
import { mapActivityRowToStudentAssignment } from "@/utils/student/assignment-shape";
import type { StudentAssignment } from "@/utils/student/assignments";

export interface TeacherStudioActivity {
  id: string;
  title: string;
  targetLanguage: "English" | "French";
  passageText: string;
  coachNote: string;
  teacherReferenceText: string;
  referenceAudioUrl: string | null;
  referenceVideoUrl: string | null;
}

export interface TeacherActivityAssignmentTarget {
  id: string;
  classId: string;
  className: string;
  classSlug: string;
  status: "assigned" | "archived";
  dueAt: Date | null;
}

function teacherActivityScope(session: SessionUser, activityId: string) {
  if (session.role === "teacher") {
    return and(eq(activities.id, activityId), eq(activities.teacherId, session.id));
  }

  return eq(activities.id, activityId);
}

export async function getTeacherStudioActivity(
  session: SessionUser,
  activityId: string,
): Promise<TeacherStudioActivity | null> {
  const rows = await withClaims(toAuthClaims(session), (tx) =>
    tx
      .select({
        id: activities.id,
        title: activities.title,
        targetLanguage: activities.targetLanguage,
        passageText: activities.passageText,
        coachNote: activities.coachNote,
        teacherReferenceText: activities.teacherReferenceText,
        referenceAudioPath: activities.referenceAudioPath,
        referenceVideoPath: activities.referenceVideoPath,
      })
      .from(activities)
      .where(teacherActivityScope(session, activityId))
      .limit(1),
  );

  const activity = rows[0];
  if (!activity) {
    return null;
  }

  return {
    id: activity.id,
    title: activity.title,
    targetLanguage:
      activity.targetLanguage === "English" ? "English" : "French",
    passageText: activity.passageText,
    coachNote: activity.coachNote ?? "",
    teacherReferenceText: activity.teacherReferenceText,
    referenceAudioUrl: activity.referenceAudioPath
      ? `/api/activities/${activity.id}/reference-media`
      : null,
    referenceVideoUrl: activity.referenceVideoPath
      ? `/api/activities/${activity.id}/reference-media?kind=video`
      : null,
  };
}

export async function getTeacherPreviewAssignment(
  session: SessionUser,
  activityId: string,
): Promise<StudentAssignment | null> {
  const rows = await withClaims(toAuthClaims(session), (tx) =>
    tx
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
      .from(activities)
      .where(teacherActivityScope(session, activityId))
      .limit(1),
  );

  const activity = rows[0];
  return activity ? mapActivityRowToStudentAssignment(activity) : null;
}

export async function getTeacherActivityAssignments(
  session: SessionUser,
  activityId: string,
): Promise<TeacherActivityAssignmentTarget[]> {
  return withClaims(toAuthClaims(session), async (tx) => {
    const rows = await tx
      .select({
        id: activityAssignments.id,
        classId: classes.id,
        className: classes.name,
        classSlug: classes.slug,
        status: activityAssignments.status,
        dueAt: activityAssignments.dueAt,
      })
      .from(activityAssignments)
      .innerJoin(classes, eq(classes.id, activityAssignments.classId))
      .innerJoin(activities, eq(activities.id, activityAssignments.activityId))
      .where(
        and(
          eq(activityAssignments.activityId, activityId),
          ...(session.role === "teacher"
            ? [eq(activities.teacherId, session.id)]
            : []),
        ),
      )
      .orderBy(asc(classes.name));

    return rows.map((row) => ({
      id: row.id,
      classId: row.classId,
      className: row.className,
      classSlug: row.classSlug,
      status: row.status === "archived" ? "archived" : "assigned",
      dueAt: row.dueAt,
    }));
  });
}
