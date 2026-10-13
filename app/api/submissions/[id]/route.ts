import { NextResponse } from "next/server";
import { parseUuidParam } from "@/utils/api/route-params";
import {
  activities,
  gradingResults,
  submissionProcessingStates,
  submissions,
  withClaims,
} from "@lingua/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { toAuthClaims, verifySession } from "@/utils/auth/dal";
import { teacherSubmissionVisibility } from "@/utils/teacher-review/visibility";

interface SubmissionRouteProps {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(
  _request: Request,
  { params }: SubmissionRouteProps,
): Promise<NextResponse> {
  const session = await verifySession();
  const { id } = await params;
  // A malformed id is a bad request, not a server error.
  if (!parseUuidParam(id)) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  const rows = await withClaims(toAuthClaims(session), async (tx) => {
    const submissionFilter =
      session.role === "student"
        ? and(eq(submissions.id, id), eq(submissions.studentId, session.id))
        : session.role === "teacher"
          ? and(eq(submissions.id, id), teacherSubmissionVisibility(session.id))
          : eq(submissions.id, id);

    const [submission] = await tx
      .select({
        id: submissions.id,
        activityId: submissions.activityId,
        status: sql<string>`coalesce(${submissionProcessingStates.status}, 'pending')`,
        submittedAt: submissions.submittedAt,
        rawStoragePath: submissions.rawStoragePath,
        processedPath: submissionProcessingStates.processedPath,
      })
      .from(submissions)
      .innerJoin(activities, eq(activities.id, submissions.activityId))
      .leftJoin(
        submissionProcessingStates,
        eq(submissionProcessingStates.submissionId, submissions.id),
      )
      .where(submissionFilter)
      .limit(1);

    if (!submission) {
      return null;
    }

    const [latestGrade] = await tx
      .select({
        transcript: gradingResults.transcript,
        wer: gradingResults.wer,
        wpm: gradingResults.wpm,
        fluencyScore: gradingResults.fluencyScore,
        pronunciationScore: gradingResults.pronunciationScore,
        cefrEstimate: gradingResults.cefrEstimate,
        wordTimestamps: gradingResults.wordTimestamps,
        phonemeScores: gradingResults.phonemeScores,
        // Teacher's manual-review note, when this grade was a human override —
        // this is the human feedback the student should see.
        overrideJustification: gradingResults.overrideJustification,
        gradedAt: gradingResults.gradedAt,
      })
      .from(gradingResults)
      .where(
        and(
          eq(gradingResults.submissionId, submission.id),
          eq(gradingResults.schoolId, session.schoolId),
        ),
      )
      .orderBy(desc(gradingResults.gradedAt))
      .limit(1);

    const latestGradeForStudent =
      latestGrade?.overrideJustification
        ? {
            ...latestGrade,
            transcript: null,
            wer: null,
            wpm: null,
            wordTimestamps: null,
            phonemeScores: null,
          }
        : latestGrade;

    return {
      ...submission,
      latestGrade: latestGradeForStudent ?? null,
    };
  });

  if (!rows) {
    return NextResponse.json({ error: "Submission not found." }, { status: 404 });
  }

  // Internal storage paths stay server-side; clients get only the media URLs.
  return NextResponse.json({
    ok: true,
    submission: {
      id: rows.id,
      activityId: rows.activityId,
      status: rows.status,
      submittedAt: rows.submittedAt,
      latestGrade: rows.latestGrade,
      rawMediaUrl: `/api/submissions/${rows.id}/media?kind=raw`,
      processedMediaUrl: rows.processedPath
        ? `/api/submissions/${rows.id}/media?kind=processed`
        : null,
    },
  });
}
