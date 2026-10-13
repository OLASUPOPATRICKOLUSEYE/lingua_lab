import "server-only";

import {
  activities,
  activityAssignments,
  classes,
  gradingResults,
  submissionProcessingStates,
  submissions,
  users,
  withClaims,
} from "@lingua/db";
import type { PhonemeScore } from "@lingua/db";
import { and, desc, eq, sql } from "drizzle-orm";
import type { SessionUser } from "@/utils/auth/dal";
import { toAuthClaims } from "@/utils/auth/dal";
import { teacherSubmissionVisibility } from "@/utils/teacher-review/visibility";

export interface TeacherSubmissionReview {
  id: string;
  studentName: string;
  studentId: string;
  activityId: string;
  activityTitle: string | null;
  referenceVideoPath: string | null;
  className: string | null;
  classSlug: string | null;
  status: string;
  submittedAt: Date;
  rawStoragePath: string;
  /** "audio" | "video"; null on rows predating the column — treated as audio. */
  mediaType: string | null;
  processedPath: string | null;
  latestTranscript: string | null;
  latestFluencyScore: number | null;
  latestPronunciationScore: number | null;
  latestCefrEstimate: string | null;
  latestWer: number | null;
  latestOverrideJustification: string | null;
  latestReviewedBy: string | null;
  latestPhonemeScores: PhonemeScore[] | null;
  gradingHistory: Array<{
    id: string;
    transcript: string | null;
    wordTimestamps: Array<{
      word: string;
      start_ms: number;
      end_ms: number;
    }> | null;
    wer: number | null;
    fluencyScore: number | null;
    pronunciationScore: number | null;
    cefrEstimate: string | null;
    modelVersion: string;
    overrideJustification: string | null;
    reviewedBy: string | null;
    gradedAt: Date;
  }>;
}

export interface TeacherReviewQueueContext {
  className: string | null;
  classSlug: string | null;
  activityTitle: string | null;
  activityId: string | null;
  previousSubmission: {
    id: string;
    studentName: string;
  } | null;
  nextSubmission: {
    id: string;
    studentName: string;
  } | null;
}

function isMissingWordTimestampsColumn(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const stack: Error[] = [error];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    if (
      current.message.includes("word_timestamps") &&
      current.message.includes("does not exist")
    ) {
      return true;
    }

    const nestedCause = (current as Error & { cause?: unknown }).cause;
    if (nestedCause instanceof Error) {
      stack.push(nestedCause);
    }
  }

  return false;
}

export async function getTeacherSubmissionReview(
  session: SessionUser,
  submissionId: string,
): Promise<TeacherSubmissionReview | null> {
  return withClaims(toAuthClaims(session), async (tx) => {
    const [submission] = await tx
      .select({
        id: submissions.id,
        studentName: users.fullName,
        studentId: submissions.studentId,
        activityId: submissions.activityId,
        activityTitle: activities.title,
        referenceVideoPath: activities.referenceVideoPath,
        className: classes.name,
        classSlug: classes.slug,
        status: sql<string>`coalesce(${submissionProcessingStates.status}, 'pending')`,
        submittedAt: submissions.submittedAt,
        rawStoragePath: submissions.rawStoragePath,
        mediaType: submissions.mediaType,
        processedPath: submissionProcessingStates.processedPath,
      })
      .from(submissions)
      .leftJoin(
        submissionProcessingStates,
        eq(submissionProcessingStates.submissionId, submissions.id),
      )
      .innerJoin(users, eq(submissions.studentId, users.id))
      .leftJoin(activities, eq(activities.id, submissions.activityId))
      // Class comes from the assignment FROZEN on the submission, not the
      // student's current memberships — one assignment → one class, so no
      // min()/groupBy is needed. Legacy rows (null assignment_id) show no class.
      .leftJoin(
        activityAssignments,
        eq(activityAssignments.id, submissions.assignmentId),
      )
      .leftJoin(classes, eq(classes.id, activityAssignments.classId))
      .where(
        and(
          eq(submissions.id, submissionId),
          ...(session.role === "teacher"
            ? [teacherSubmissionVisibility(session.id)]
            : []),
        ),
      )
      .limit(1);

    if (!submission) {
      return null;
    }

    let gradingHistory: TeacherSubmissionReview["gradingHistory"];
    try {
      gradingHistory = await tx
        .select({
          id: gradingResults.id,
          transcript: gradingResults.transcript,
          wordTimestamps: gradingResults.wordTimestamps,
          phonemeScores: gradingResults.phonemeScores,
          wer: gradingResults.wer,
          fluencyScore: gradingResults.fluencyScore,
          pronunciationScore: gradingResults.pronunciationScore,
          cefrEstimate: gradingResults.cefrEstimate,
          modelVersion: gradingResults.modelVersion,
          overrideJustification: gradingResults.overrideJustification,
          reviewedBy: gradingResults.reviewedBy,
          gradedAt: gradingResults.gradedAt,
        })
        .from(gradingResults)
        .where(
          and(
            eq(gradingResults.submissionId, submissionId),
            eq(gradingResults.schoolId, session.schoolId),
          ),
        )
        .orderBy(desc(gradingResults.gradedAt));
    } catch (error) {
      if (!isMissingWordTimestampsColumn(error)) {
        throw error;
      }

      gradingHistory = await tx
        .select({
          id: gradingResults.id,
          transcript: gradingResults.transcript,
          wer: gradingResults.wer,
          fluencyScore: gradingResults.fluencyScore,
          pronunciationScore: gradingResults.pronunciationScore,
          cefrEstimate: gradingResults.cefrEstimate,
          modelVersion: gradingResults.modelVersion,
          overrideJustification: gradingResults.overrideJustification,
          reviewedBy: gradingResults.reviewedBy,
          gradedAt: gradingResults.gradedAt,
        })
        .from(gradingResults)
        .where(
          and(
            eq(gradingResults.submissionId, submissionId),
            eq(gradingResults.schoolId, session.schoolId),
          ),
        )
        .orderBy(desc(gradingResults.gradedAt))
        .then((rows) =>
          rows.map((row) => ({
            ...row,
            wordTimestamps: null,
          })),
        );
    }

    const latest = gradingHistory[0] ?? null;
    // phonemeScores is selected only on the primary path (absent in the
    // legacy missing-column fallback); read it defensively.
    const latestPhonemeScores =
      (latest as { phonemeScores?: PhonemeScore[] | null } | null)
        ?.phonemeScores ?? null;

    return {
      ...submission,
      latestTranscript: latest?.transcript ?? null,
      latestFluencyScore: latest?.fluencyScore ?? null,
      latestPronunciationScore: latest?.pronunciationScore ?? null,
      latestCefrEstimate: latest?.cefrEstimate ?? null,
      latestWer: latest?.wer ?? null,
      latestOverrideJustification: latest?.overrideJustification ?? null,
      latestReviewedBy: latest?.reviewedBy ?? null,
      latestPhonemeScores,
      gradingHistory,
    };
  });
}

export async function getTeacherReviewQueueContext(
  session: SessionUser,
  submissionId: string,
  filters?: {
    classSlug?: string | null;
    activityId?: string | null;
    view?: "waiting" | "graded" | null;
  },
): Promise<TeacherReviewQueueContext> {
  return withClaims(toAuthClaims(session), async (tx) => {
    const teacherQueueStatus = sql<string>`coalesce(${submissionProcessingStates.status}, 'pending')`;
    const activityFilterId = filters?.activityId?.trim() || null;
    const queueView = filters?.view === "graded" ? "graded" : "waiting";
    const queueConditions = [
      queueView === "graded"
        ? sql`${teacherQueueStatus} = 'graded'`
        : sql`${teacherQueueStatus} in ('pending', 'processing', 'pending_review', 'failed')`,
      ...(session.role === "teacher"
        ? [teacherSubmissionVisibility(session.id)]
        : []),
      ...(filters?.classSlug ? [eq(classes.slug, filters.classSlug)] : []),
      ...(activityFilterId ? [eq(submissions.activityId, activityFilterId)] : []),
    ];

    const queueRows = await tx
      .select({
        id: submissions.id,
        studentName: users.fullName,
        className: classes.name,
        classSlug: classes.slug,
        activityTitle: activities.title,
        activityId: submissions.activityId,
        submittedAt: submissions.submittedAt,
      })
      .from(submissions)
      .leftJoin(
        submissionProcessingStates,
        eq(submissionProcessingStates.submissionId, submissions.id),
      )
      .innerJoin(users, eq(submissions.studentId, users.id))
      .leftJoin(activities, eq(activities.id, submissions.activityId))
      // Class from the frozen assignment (see the review query above).
      .leftJoin(
        activityAssignments,
        eq(activityAssignments.id, submissions.assignmentId),
      )
      .leftJoin(classes, eq(classes.id, activityAssignments.classId))
      .where(and(...queueConditions))
      .orderBy(desc(submissions.submittedAt));

    const currentIndex = queueRows.findIndex((row) => row.id === submissionId);
    const currentRow = currentIndex >= 0 ? queueRows[currentIndex] : null;

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
              ...(session.role === "teacher"
                ? [eq(classes.teacherId, session.id)]
                : []),
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
              ...(session.role === "teacher"
                ? [eq(activities.teacherId, session.id)]
                : []),
            ),
          )
          .limit(1)
      : [];

    return {
      className: currentRow?.className ?? activeClassFilterRow?.className ?? null,
      classSlug:
        currentRow?.classSlug ?? activeClassFilterRow?.classSlug ?? filters?.classSlug ?? null,
      activityTitle:
        currentRow?.activityTitle ?? activeActivityFilterRow?.activityTitle ?? null,
      activityId: currentRow?.activityId ?? activeActivityFilterRow?.activityId ?? activityFilterId,
      previousSubmission:
        currentIndex > 0
          ? {
              id: queueRows[currentIndex - 1].id,
              studentName: queueRows[currentIndex - 1].studentName,
            }
          : null,
      nextSubmission:
        currentIndex >= 0 && currentIndex < queueRows.length - 1
          ? {
              id: queueRows[currentIndex + 1].id,
              studentName: queueRows[currentIndex + 1].studentName,
            }
          : null,
    };
  });
}
