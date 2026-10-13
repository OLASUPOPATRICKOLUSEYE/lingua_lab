import "server-only";

import {
  activities,
  activityAssignments,
  classMemberships,
  classes,
  submissionProcessingStates,
  submissions,
  withClaims,
} from "@lingua/db";
import { and, eq, sql } from "drizzle-orm";
import type { SessionUser } from "@/utils/auth/dal";
import { toAuthClaims } from "@/utils/auth/dal";

export interface TeacherClassSummary {
  id: string;
  name: string;
  slug: string;
  studentCount: number;
  activeAssignmentCount: number;
}

export interface TeacherClassDetail extends TeacherClassSummary {
  canManage: boolean;
}

export interface TeacherClassAssignmentSummary {
  id: string;
  activityId: string;
  title: string;
  targetLanguage: string;
  status: "assigned" | "archived";
  assignedAt: Date;
  dueAt: Date | null;
  submissionCount: number;
  openReviewCount: number;
  gradedSubmissionCount: number;
  /** Students enrolled in the class (completion denominator). */
  enrolledStudentCount: number;
  /** Distinct enrolled students who have submitted at least one take. */
  submittedStudentCount: number;
  hasReferenceAudio: boolean;
}

function classScope(session: SessionUser) {
  if (session.role === "teacher") {
    return eq(classes.teacherId, session.id);
  }

  return undefined;
}

export async function getTeacherClasses(
  session: SessionUser,
): Promise<TeacherClassSummary[]> {
  return withClaims(toAuthClaims(session), async (tx) => {
    const scope = classScope(session);

    const query = tx
      .select({
        id: classes.id,
        name: classes.name,
        slug: classes.slug,
        studentCount: sql<number>`count(distinct ${classMemberships.studentId})`.mapWith(
          Number,
        ),
        activeAssignmentCount: sql<number>`count(distinct case when ${activityAssignments.status} = 'assigned' then ${activityAssignments.id} end)`.mapWith(
          Number,
        ),
      })
      .from(classes)
      .leftJoin(classMemberships, eq(classMemberships.classId, classes.id))
      .leftJoin(activityAssignments, eq(activityAssignments.classId, classes.id))
      .groupBy(classes.id)
      .orderBy(classes.name);

    const rows = scope ? await query.where(scope) : await query;

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      studentCount: row.studentCount,
      activeAssignmentCount: row.activeAssignmentCount,
    }));
  });
}

export async function getTeacherClassBySlug(
  session: SessionUser,
  classSlug: string,
): Promise<TeacherClassDetail | null> {
  const rows = await withClaims(toAuthClaims(session), async (tx) => {
    const query = tx
      .select({
        id: classes.id,
        name: classes.name,
        slug: classes.slug,
        studentCount: sql<number>`count(distinct ${classMemberships.studentId})`.mapWith(
          Number,
        ),
        activeAssignmentCount: sql<number>`count(distinct case when ${activityAssignments.status} = 'assigned' then ${activityAssignments.id} end)`.mapWith(
          Number,
        ),
        canManage:
          session.role === "teacher"
            ? sql<boolean>`${classes.teacherId} = ${session.id}`
            : sql<boolean>`true`,
      })
      .from(classes)
      .leftJoin(classMemberships, eq(classMemberships.classId, classes.id))
      .leftJoin(activityAssignments, eq(activityAssignments.classId, classes.id))
      .where(
        and(
          eq(classes.slug, classSlug),
          ...(classScope(session) ? [classScope(session)!] : []),
        ),
      )
      .groupBy(classes.id)
      .limit(1);

    return query;
  });

  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    studentCount: row.studentCount,
    activeAssignmentCount: row.activeAssignmentCount,
    canManage: row.canManage,
  };
}

export async function getTeacherClassAssignments(
  session: SessionUser,
  classId: string,
): Promise<TeacherClassAssignmentSummary[]> {
  return withClaims(toAuthClaims(session), async (tx) => {
    const rows = await tx
      .select({
        id: activityAssignments.id,
        activityId: activities.id,
        title: activities.title,
        targetLanguage: activities.targetLanguage,
        status: activityAssignments.status,
        assignedAt: activityAssignments.assignedAt,
        dueAt: activityAssignments.dueAt,
        submissionCount: sql<number>`count(distinct ${submissions.id})`.mapWith(
          Number,
        ),
        openReviewCount: sql<number>`count(distinct case when coalesce(${submissionProcessingStates.status}, 'pending') in ('pending', 'processing', 'pending_review', 'failed') then ${submissions.id} end)`.mapWith(
          Number,
        ),
        gradedSubmissionCount: sql<number>`count(distinct case when ${submissionProcessingStates.status} = 'graded' then ${submissions.id} end)`.mapWith(
          Number,
        ),
        // Completion is measured over PEOPLE, not takes: how many enrolled
        // students have submitted at least once, out of everyone enrolled.
        enrolledStudentCount: sql<number>`count(distinct ${classMemberships.studentId})`.mapWith(
          Number,
        ),
        submittedStudentCount: sql<number>`count(distinct case when ${submissions.id} is not null then ${classMemberships.studentId} end)`.mapWith(
          Number,
        ),
        hasReferenceAudio: sql<boolean>`${activities.referenceAudioPath} is not null`,
      })
      .from(activityAssignments)
      .innerJoin(activities, eq(activities.id, activityAssignments.activityId))
      .innerJoin(classes, eq(classes.id, activityAssignments.classId))
      .leftJoin(
        classMemberships,
        and(
          eq(classMemberships.classId, classes.id),
          eq(classMemberships.schoolId, classes.schoolId),
        ),
      )
      .leftJoin(
        submissions,
        and(
          eq(submissions.activityId, activities.id),
          eq(submissions.studentId, classMemberships.studentId),
          eq(submissions.schoolId, classes.schoolId),
        ),
      )
      .leftJoin(
        submissionProcessingStates,
        eq(submissionProcessingStates.submissionId, submissions.id),
      )
      .where(
        and(
          eq(classes.id, classId),
          ...(classScope(session) ? [classScope(session)!] : []),
        ),
      )
      .groupBy(activityAssignments.id, activities.id)
      .orderBy(sql`${activityAssignments.status} asc`, sql`${activityAssignments.assignedAt} desc`);

    return rows.map((row) => ({
      id: row.id,
      activityId: row.activityId,
      title: row.title,
      targetLanguage: row.targetLanguage,
      status:
        row.status === "archived" ? "archived" : "assigned",
      assignedAt: row.assignedAt,
      dueAt: row.dueAt,
      submissionCount: row.submissionCount,
      openReviewCount: row.openReviewCount,
      gradedSubmissionCount: row.gradedSubmissionCount,
      enrolledStudentCount: row.enrolledStudentCount,
      submittedStudentCount: row.submittedStudentCount,
      hasReferenceAudio: row.hasReferenceAudio,
    }));
  });
}
