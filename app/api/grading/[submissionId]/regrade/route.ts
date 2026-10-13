import { NextResponse } from "next/server";
import { parseUuidParam } from "@/utils/api/route-params";
import { and, eq } from "drizzle-orm";
import {
  activities,
  submissionProcessingStates,
  submissions,
  withClaims,
} from "@lingua/db";
import { enqueueGradingJob } from "@/server/queues/grading";
import { requireRole, toAuthClaims } from "@/utils/auth/dal";
import { teacherSubmissionVisibility } from "@/utils/teacher-review/visibility";

export const dynamic = 'force-dynamic';

interface RegradeRouteProps {
  params: Promise<{
    submissionId: string;
  }>;
}

export async function POST(
  _request: Request,
  { params }: RegradeRouteProps,
): Promise<NextResponse> {
  const session = await requireRole(["teacher", "dept_head", "system_admin"]);
  if (!process.env.AI_SERVICE_URL?.trim()) {
    return NextResponse.json(
      { error: "AI service is not configured for this deployment tier." },
      { status: 409 },
    );
  }

  const { submissionId } = await params;

  // A malformed id is a bad request, not a server error.

  if (!parseUuidParam(submissionId)) {

    return NextResponse.json({ error: "Invalid id." }, { status: 400 });

  }
  const submission = await withClaims(toAuthClaims(session), async (tx) => {
    const [row] = await tx
      .select({
        id: submissions.id,
        schoolId: submissions.schoolId,
        studentId: submissions.studentId,
        activityId: submissions.activityId,
        processedPath: submissionProcessingStates.processedPath,
      })
      .from(submissions)
      .innerJoin(activities, eq(activities.id, submissions.activityId))
      .innerJoin(
        submissionProcessingStates,
        eq(submissionProcessingStates.submissionId, submissions.id),
      )
      .where(
        session.role === "teacher"
          ? and(eq(submissions.id, submissionId), teacherSubmissionVisibility(session.id))
          : eq(submissions.id, submissionId),
      )
      .limit(1);

    if (!row?.processedPath) {
      return null;
    }

    return {
      ...row,
      processedPath: row.processedPath,
    };
  });

  if (!submission) {
    return NextResponse.json(
      { error: "Processed audio is required before re-grading." },
      { status: 409 },
    );
  }

  await enqueueGradingJob({
    submissionId: submission.id,
    schoolId: submission.schoolId,
    studentId: submission.studentId,
    activityId: submission.activityId,
    processedPath: submission.processedPath,
  });

  await withClaims(toAuthClaims(session), async (tx) => {
    await tx
      .update(submissionProcessingStates)
      .set({ status: "processing" })
      .where(
        and(
          eq(submissionProcessingStates.submissionId, submissionId),
          eq(submissionProcessingStates.schoolId, submission.schoolId),
        ),
      );
  });

  return NextResponse.json({ ok: true, status: "processing" }, { status: 202 });
}
