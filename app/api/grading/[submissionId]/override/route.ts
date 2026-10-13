import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import {
  activities,
  gradingResults,
  submissionProcessingStates,
  submissions,
  withClaims,
} from "@lingua/db";
import { z } from "zod";
import { getNextManualModelVersion } from "@/server/grading/manual-review";
import { insertGradingResultCompat } from "../../../../../server/grading/grading-result-write";
import { requireRole, toAuthClaims } from "@/utils/auth/dal";
import { teacherSubmissionVisibility } from "@/utils/teacher-review/visibility";

export const dynamic = 'force-dynamic';

const payloadSchema = z.object({
  fluencyScore: z.number().int().min(0).max(100),
  pronunciationScore: z.number().int().min(0).max(100),
  cefrEstimate: z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]),
  justification: z.string().trim().min(10),
});

interface OverrideRouteProps {
  params: Promise<{
    submissionId: string;
  }>;
}

export async function POST(
  request: Request,
  { params }: OverrideRouteProps,
): Promise<NextResponse> {
  const session = await requireRole(["teacher", "dept_head", "system_admin"]);
  const { submissionId } = await params;
  const parsed = payloadSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload." },
      { status: 400 },
    );
  }

  const result = await withClaims(toAuthClaims(session), async (tx) => {
    const [submission] = await tx
      .select({
        id: submissions.id,
        schoolId: submissions.schoolId,
      })
      .from(submissions)
      .innerJoin(activities, eq(activities.id, submissions.activityId))
      .where(
        session.role === "teacher"
          ? and(eq(submissions.id, submissionId), teacherSubmissionVisibility(session.id))
          : eq(submissions.id, submissionId),
      )
      .limit(1);

    if (!submission) {
      return null;
    }

    const modelVersion = await getNextManualModelVersion(tx, submissionId);
    await insertGradingResultCompat(tx, gradingResults, {
      id: randomUUID(),
      schoolId: submission.schoolId,
      submissionId,
      transcript: null,
      phonemeScores: null,
      wordTimestamps: null,
      wpm: null,
      wer: null,
      fluencyScore: parsed.data.fluencyScore,
      pronunciationScore: parsed.data.pronunciationScore,
      cefrEstimate: parsed.data.cefrEstimate,
      modelVersion,
      overrideJustification: parsed.data.justification,
      reviewedBy: session.id,
    });
    await tx
      .update(submissionProcessingStates)
      .set({ status: "graded" })
      .where(
        and(
          eq(submissionProcessingStates.submissionId, submissionId),
          eq(submissionProcessingStates.schoolId, submission.schoolId),
        ),
      );

    return { modelVersion };
  });

  if (!result) {
    return NextResponse.json({ error: "Submission not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, modelVersion: result.modelVersion });
}
