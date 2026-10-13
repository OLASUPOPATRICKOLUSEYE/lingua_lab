import "server-only";

import {
  activities,
  gradingResults,
  submissionProcessingStates,
  submissions,
  withClaims,
} from "@lingua/db";
import { desc, eq, sql, type AnyColumn } from "drizzle-orm";
import type { SessionUser } from "@/utils/auth/dal";
import { toAuthClaims } from "@/utils/auth/dal";

export interface StudentRecording {
  id: string;
  activityTitle: string | null;
  targetLanguage: string | null;
  submittedAt: Date;
  status: string;
  /** "audio" | "video" — drives which player the page renders. */
  mediaType: string | null;
  rawStoragePath: string;
  transcript: string | null;
  fluencyScore: number | null;
  pronunciationScore: number | null;
  cefrEstimate: string | null;
  wpm: number | null;
  wer: number | null;
  /** Present when a teacher overrode the machine grade — shown to the student. */
  overrideJustification: string | null;
  gradedAt: Date | null;
}

/**
 * Every recording this student has made, newest first, with its latest grade.
 *
 * Self-scoped by student_id on top of RLS: RLS proves same-school, which is not
 * the same as "mine". Students must never see a classmate's recording.
 *
 * The grade columns are correlated subqueries against the LATEST grading_results
 * row rather than a join, because a submission can have several (a re-grade adds
 * a row instead of mutating — submissions are append-only). Joining would return
 * one line per grading run and show the student duplicates of the same take.
 */
export async function getStudentRecordings(
  session: SessionUser,
  limit = 100,
): Promise<StudentRecording[]> {
  const latest = (column: AnyColumn) => sql`(
    select ${column}
    from ${gradingResults}
    where ${gradingResults.submissionId} = ${submissions.id}
    order by ${gradingResults.gradedAt} desc
    limit 1
  )`;

  return withClaims(toAuthClaims(session), (tx) =>
    tx
      .select({
        id: submissions.id,
        activityTitle: activities.title,
        targetLanguage: activities.targetLanguage,
        submittedAt: submissions.submittedAt,
        status: sql<string>`coalesce(${submissionProcessingStates.status}, 'pending')`,
        mediaType: submissions.mediaType,
        rawStoragePath: submissions.rawStoragePath,
        transcript: sql<string | null>`${latest(gradingResults.transcript)}`,
        fluencyScore: sql<number | null>`${latest(gradingResults.fluencyScore)}`,
        pronunciationScore: sql<number | null>`${latest(gradingResults.pronunciationScore)}`,
        cefrEstimate: sql<string | null>`${latest(gradingResults.cefrEstimate)}`,
        wpm: sql<number | null>`${latest(gradingResults.wpm)}`,
        wer: sql<number | null>`${latest(gradingResults.wer)}`,
        overrideJustification: sql<
          string | null
        >`${latest(gradingResults.overrideJustification)}`,
        // See the note in teacher/gradebook.ts: a raw sql fragment needs
        // mapWith or it yields the raw pg string, not a Date.
        gradedAt: sql<Date | null>`${latest(gradingResults.gradedAt)}`.mapWith(
          gradingResults.gradedAt,
        ),
      })
      .from(submissions)
      .leftJoin(activities, eq(activities.id, submissions.activityId))
      .leftJoin(
        submissionProcessingStates,
        eq(submissionProcessingStates.submissionId, submissions.id),
      )
      .where(eq(submissions.studentId, session.id))
      .orderBy(desc(submissions.submittedAt))
      .limit(limit),
  );
}
