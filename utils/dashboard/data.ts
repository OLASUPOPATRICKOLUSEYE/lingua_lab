import "server-only";

import {
  activities,
  activityAssignments,
  classMemberships,
  classes,
  gradingResults,
  submissionProcessingStates,
  submissions,
  users,
  withClaims,
} from "@lingua/db";
import { and, count, desc, eq, sql } from "drizzle-orm";
import type { SessionUser } from "@/utils/auth/dal";
import { toAuthClaims } from "@/utils/auth/dal";
import { teacherSubmissionVisibility } from "@/utils/teacher-review/visibility";

export interface AdminDashboardData {
  fullName: string | null;
  userTotal: number;
  teacherTotal: number;
  studentTotal: number;
  adminTotal: number;
  submissionTotal: number;
  activeSubmissionTotal: number;
  gradedSubmissionTotal: number;
  processedMediaTotal: number;
  gradingRunTotal: number;
}

export interface TeacherRecentSubmission {
  id: string;
  studentName: string;
  className: string | null;
  classSlug: string | null;
  activityTitle: string | null;
  status: string;
  submittedAt: Date;
  latestFluencyScore: number | null;
  latestPronunciationScore: number | null;
}

export interface TeacherRecentActivity {
  id: string;
  title: string;
  targetLanguage: string;
  teacherName: string;
  createdAt: Date;
  hasReferenceAudio: boolean;
  canManage: boolean;
}

export interface TeacherDashboardData {
  fullName: string | null;
  recentSubmissions: TeacherRecentSubmission[];
  recentActivities: TeacherRecentActivity[];
  activeQueueFilters: {
    className: string | null;
    classSlug: string | null;
    activityTitle: string | null;
    activityId: string | null;
    view: "waiting" | "graded";
  };
  teacherClasses: {
    id: string;
    name: string;
    slug: string;
    studentCount: number;
    activeAssignmentCount: number;
  }[];
  teacherTotal: number;
  studentTotal: number;
  submissionTotal: number;
}

export interface StudentRecentSubmission {
  id: string;
  status: string;
  submittedAt: Date;
}

export interface StudentDailyActivity {
  /** Local calendar day as YYYY-MM-DD. */
  day: string;
  total: number;
}

export interface StudentDashboardData {
  fullName: string | null;
  recentSubmissions: StudentRecentSubmission[];
  submissionTotal: number;
  activeSubmissionTotal: number;
  gradedResultTotal: number;
  averageFluencyScore: number | null;
  averagePronunciationScore: number | null;
  latestCefrEstimate: string | null;
  /** Recordings per day over the last 7 days (sparse — days with 0 are absent). */
  dailyActivity: StudentDailyActivity[];
  /** Day-of-month numbers in the current month with at least one recording. */
  practiceDaysThisMonth: number[];
}

export async function getAdminDashboardData(
  session: SessionUser,
): Promise<AdminDashboardData> {
  return withClaims(toAuthClaims(session), async (tx) => {
    const roleCounts = await tx
      .select({
        role: users.role,
        total: count(),
      })
      .from(users)
      .groupBy(users.role);

    const [submissionStats] = await tx
      .select({
        // .mapWith(Number): sum()/count() come back from node-postgres as
        // STRINGS (numeric / bigint), but these are declared and consumed as
        // numbers. Drizzle's count() helper already does this; the hand-written
        // sql`` fragments must do it explicitly or the `number` type is a lie.
        submissionTotal: count(),
        activeSubmissionTotal:
          sql<number>`sum(case when ${submissionProcessingStates.status} in ('pending', 'processing', 'pending_review') then 1 else 0 end)`.mapWith(
            Number,
          ),
        gradedSubmissionTotal:
          sql<number>`sum(case when ${submissionProcessingStates.status} = 'graded' then 1 else 0 end)`.mapWith(
            Number,
          ),
        processedMediaTotal:
          sql<number>`sum(case when ${submissionProcessingStates.processedPath} is not null then 1 else 0 end)`.mapWith(
            Number,
          ),
      })
      .from(submissions)
      .leftJoin(
        submissionProcessingStates,
        eq(submissionProcessingStates.submissionId, submissions.id),
      );

    const [gradingStats] = await tx
      .select({
        gradingRunTotal: count(),
      })
      .from(gradingResults);

    const [profileRow] = await tx
      .select({ fullName: users.fullName })
      .from(users)
      .where(eq(users.id, session.id))
      .limit(1);

    const countsByRole = new Map(roleCounts.map((row) => [row.role, row.total]));

    return {
      fullName: profileRow?.fullName ?? null,
      userTotal: roleCounts.reduce((sum, row) => sum + row.total, 0),
      teacherTotal: countsByRole.get("teacher") ?? 0,
      studentTotal: countsByRole.get("student") ?? 0,
      adminTotal:
        (countsByRole.get("system_admin") ?? 0) +
        (countsByRole.get("dept_head") ?? 0),
      submissionTotal: submissionStats?.submissionTotal ?? 0,
      activeSubmissionTotal: submissionStats?.activeSubmissionTotal ?? 0,
      gradedSubmissionTotal: submissionStats?.gradedSubmissionTotal ?? 0,
      processedMediaTotal: submissionStats?.processedMediaTotal ?? 0,
      gradingRunTotal: gradingStats?.gradingRunTotal ?? 0,
    };
  });
}

export async function getTeacherDashboardData(
  session: SessionUser,
  filters?: {
    classSlug?: string | null;
    activityId?: string | null;
    view?: "waiting" | "graded" | null;
  },
): Promise<TeacherDashboardData> {
  return withClaims(toAuthClaims(session), async (tx) => {
    const teacherQueueStatus = sql<string>`coalesce(${submissionProcessingStates.status}, 'pending')`;
    const classFilter =
      session.role === "teacher" ? eq(classes.teacherId, session.id) : undefined;
    // Two different questions, deliberately two different filters.
    // Authorship, for queries over `activities` alone (the studio list, the
    // activity-filter label): editing a passage is the author's business.
    const activityOwnerFilter =
      session.role === "teacher" ? eq(activities.teacherId, session.id) : undefined;
    // Reviewability, for queries whose FROM includes `submissions`: authored
    // the activity OR teaches the class it was assigned to. Only valid where
    // `submissions` is in scope — it references submissions.assignment_id.
    const submissionVisibilityFilter =
      session.role === "teacher"
        ? teacherSubmissionVisibility(session.id)
        : undefined;
    const activityFilterId = filters?.activityId?.trim() || null;
    const queueView = filters?.view === "graded" ? "graded" : "waiting";
    const queueConditions = [
      queueView === "graded"
        ? sql`${teacherQueueStatus} = 'graded'`
        : sql`${teacherQueueStatus} in ('pending', 'processing', 'pending_review', 'failed')`,
      ...(submissionVisibilityFilter ? [submissionVisibilityFilter] : []),
      ...(filters?.classSlug ? [eq(classes.slug, filters.classSlug)] : []),
      ...(activityFilterId ? [eq(submissions.activityId, activityFilterId)] : []),
    ];
    const recentSubmissions = await tx
      .select({
        id: submissions.id,
        studentName: users.fullName,
        className: classes.name,
        classSlug: classes.slug,
        activityTitle: activities.title,
        status: teacherQueueStatus,
        submittedAt: submissions.submittedAt,
        latestFluencyScore: sql<number | null>`(
          select ${gradingResults.fluencyScore}
          from ${gradingResults}
          where ${gradingResults.submissionId} = ${submissions.id}
          order by ${gradingResults.gradedAt} desc
          limit 1
        )`,
        latestPronunciationScore: sql<number | null>`(
          select ${gradingResults.pronunciationScore}
          from ${gradingResults}
          where ${gradingResults.submissionId} = ${submissions.id}
          order by ${gradingResults.gradedAt} desc
          limit 1
        )`,
      })
      .from(submissions)
      .leftJoin(
        submissionProcessingStates,
        eq(submissionProcessingStates.submissionId, submissions.id),
      )
      .innerJoin(users, eq(submissions.studentId, users.id))
      .leftJoin(activities, eq(activities.id, submissions.activityId))
      // Class from the assignment frozen on the submission — one class per row,
      // so the previous min()/groupBy over membership inference is gone.
      .leftJoin(
        activityAssignments,
        eq(activityAssignments.id, submissions.assignmentId),
      )
      .leftJoin(classes, eq(classes.id, activityAssignments.classId))
      .where(and(...queueConditions))
      .orderBy(desc(submissions.submittedAt))
      .limit(filters?.classSlug || activityFilterId ? 18 : 6);

    const [activeClassFilterRow] = filters?.classSlug
      ? await tx
          .select({
            className: classes.name,
            classSlug: classes.slug,
          })
          .from(classes)
          .where(
            and(
              eq(classes.slug, filters.classSlug),
              ...(classFilter ? [classFilter] : []),
            ),
          )
          .limit(1)
      : [];

    const [activeActivityFilterRow] = activityFilterId
      ? await tx
          .select({
            activityId: activities.id,
            activityTitle: activities.title,
          })
          .from(activities)
          .where(
            and(
              eq(activities.id, activityFilterId),
              ...(activityOwnerFilter ? [activityOwnerFilter] : []),
            ),
          )
          .limit(1)
      : [];

    const recentActivitiesQuery = tx
      .select({
        id: activities.id,
        title: activities.title,
        targetLanguage: activities.targetLanguage,
        teacherName: activities.teacherName,
        createdAt: activities.createdAt,
        hasReferenceAudio: sql<boolean>`${activities.referenceAudioPath} is not null`,
        canManage:
          session.role === "teacher"
            ? sql<boolean>`${activities.teacherId} = ${session.id}`
            : sql<boolean>`true`,
      })
      .from(activities)
      .orderBy(desc(activities.createdAt))
      .limit(5);
    const recentActivities = activityOwnerFilter
      ? await recentActivitiesQuery.where(activityOwnerFilter)
      : await recentActivitiesQuery;

    const classQuery = tx
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
      .orderBy(classes.name)
      .limit(6);
    const teacherClasses = classFilter
      ? await classQuery.where(classFilter)
      : await classQuery;

    const roleCounts = await tx
      .select({
        role: users.role,
        total: count(),
      })
      .from(users)
      .groupBy(users.role);

    const [submissionStats] = await tx
      .select({
        submissionTotal: count(),
      })
      .from(submissions);
    const [teacherScopedSubmissionStats] = submissionVisibilityFilter
      ? await tx
          .select({
            submissionTotal: count(),
          })
          .from(submissions)
          .innerJoin(activities, eq(activities.id, submissions.activityId))
          .where(submissionVisibilityFilter)
      : [submissionStats];

    const [profileRow] = await tx
      .select({ fullName: users.fullName })
      .from(users)
      .where(eq(users.id, session.id))
      .limit(1);

    const countsByRole = new Map(roleCounts.map((row) => [row.role, row.total]));

    return {
      fullName: profileRow?.fullName ?? null,
      recentSubmissions,
      recentActivities,
      activeQueueFilters: {
        className: activeClassFilterRow?.className ?? null,
        classSlug: activeClassFilterRow?.classSlug ?? filters?.classSlug ?? null,
        activityTitle: activeActivityFilterRow?.activityTitle ?? null,
        activityId: activeActivityFilterRow?.activityId ?? activityFilterId,
        view: queueView,
      },
      teacherClasses,
      teacherTotal: countsByRole.get("teacher") ?? 0,
      studentTotal: countsByRole.get("student") ?? 0,
      submissionTotal: teacherScopedSubmissionStats?.submissionTotal ?? 0,
    };
  });
}

export async function getStudentDashboardData(
  session: SessionUser,
): Promise<StudentDashboardData> {
  return withClaims(toAuthClaims(session), async (tx) => {
    const recentSubmissions = await tx
      .select({
        id: submissions.id,
        status: sql<string>`coalesce(${submissionProcessingStates.status}, 'pending')`,
        submittedAt: submissions.submittedAt,
      })
      .from(submissions)
      .leftJoin(
        submissionProcessingStates,
        eq(submissionProcessingStates.submissionId, submissions.id),
      )
      .where(eq(submissions.studentId, session.id))
      .orderBy(desc(submissions.submittedAt))
      .limit(4);

    const [submissionStats] = await tx
      .select({
        submissionTotal: count(),
        activeSubmissionTotal:
          sql<number>`sum(case when ${submissionProcessingStates.status} in ('pending', 'processing', 'pending_review') then 1 else 0 end)`.mapWith(
            Number,
          ),
      })
      .from(submissions)
      .leftJoin(
        submissionProcessingStates,
        eq(submissionProcessingStates.submissionId, submissions.id),
      )
      .where(eq(submissions.studentId, session.id));

    const gradeRows = await tx
      .select({
        fluencyScore: gradingResults.fluencyScore,
        pronunciationScore: gradingResults.pronunciationScore,
        cefrEstimate: gradingResults.cefrEstimate,
      })
      .from(gradingResults)
      .innerJoin(submissions, eq(gradingResults.submissionId, submissions.id))
      .where(eq(submissions.studentId, session.id))
      .orderBy(desc(gradingResults.gradedAt))
      .limit(12);

    const [profileRow] = await tx
      .select({ fullName: users.fullName })
      .from(users)
      .where(eq(users.id, session.id))
      .limit(1);

    const activityDay = sql<string>`to_char(${submissions.submittedAt}, 'YYYY-MM-DD')`;
    const dailyActivity = await tx
      .select({
        day: activityDay,
        total: count(),
      })
      .from(submissions)
      .where(
        and(
          eq(submissions.studentId, session.id),
          sql`${submissions.submittedAt} >= date_trunc('day', now()) - interval '6 days'`,
        ),
      )
      .groupBy(activityDay);

    const monthDay = sql<number>`extract(day from ${submissions.submittedAt})::int`;
    const monthRows = await tx
      .select({ day: monthDay })
      .from(submissions)
      .where(
        and(
          eq(submissions.studentId, session.id),
          sql`date_trunc('month', ${submissions.submittedAt}) = date_trunc('month', now())`,
        ),
      )
      .groupBy(monthDay);

    const fluencyScores = gradeRows
      .map((row) => row.fluencyScore)
      .filter((value): value is number => value !== null);
    const pronunciationScores = gradeRows
      .map((row) => row.pronunciationScore)
      .filter((value): value is number => value !== null);

    return {
      fullName: profileRow?.fullName ?? null,
      recentSubmissions,
      submissionTotal: submissionStats?.submissionTotal ?? 0,
      activeSubmissionTotal: submissionStats?.activeSubmissionTotal ?? 0,
      gradedResultTotal: gradeRows.length,
      averageFluencyScore:
        fluencyScores.length > 0
          ? Math.round(
              fluencyScores.reduce((sum, score) => sum + score, 0) /
                fluencyScores.length,
            )
          : null,
      averagePronunciationScore:
        pronunciationScores.length > 0
          ? Math.round(
              pronunciationScores.reduce((sum, score) => sum + score, 0) /
                pronunciationScores.length,
            )
          : null,
      latestCefrEstimate: gradeRows[0]?.cefrEstimate ?? null,
      dailyActivity,
      practiceDaysThisMonth: monthRows.map((row) => row.day),
    };
  });
}
