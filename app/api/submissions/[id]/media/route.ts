import { NextResponse } from "next/server";
import { parseUuidParam } from "@/utils/api/route-params";
import { and, eq } from "drizzle-orm";
import {
  activities,
  submissionProcessingStates,
  submissions,
  withClaims,
} from "@lingua/db";
import { getPresignedDownloadUrl, isLocalStorage } from "@/utils/storage/s3";
import { serveLocalMedia } from "@/utils/storage/serve-local-media";
import { toAuthClaims, verifySession } from "@/utils/auth/dal";
import { teacherSubmissionVisibility } from "@/utils/teacher-review/visibility";

export const dynamic = 'force-dynamic';

// 1 hour rather than the 5-minute s3.ts default. Browsers make Range requests
// against the same presigned URL throughout buffering/seeking, so the URL must
// outlast the full download, not just the initial connection. Student recordings
// run up to 300 s; reference video can be up to 200 MB (~25 min at 1 Mbps). A
// 1-hour window covers both comfortably. Read-only presigned URLs have minimal
// security downside at this expiry.
const MEDIA_PRESIGNED_EXPIRY_SECONDS = 3600;

interface MediaRouteProps {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(
  request: Request,
  { params }: MediaRouteProps,
): Promise<NextResponse> {
  const session = await verifySession();
  const { id } = await params;
  // A malformed id is a bad request, not a server error.
  if (!parseUuidParam(id)) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") === "raw" ? "raw" : "processed";

  const [submission] = await withClaims(toAuthClaims(session), async (tx) => {
    const submissionFilter =
      session.role === "student"
        ? and(eq(submissions.id, id), eq(submissions.studentId, session.id))
        : session.role === "teacher"
          ? and(eq(submissions.id, id), teacherSubmissionVisibility(session.id))
          : eq(submissions.id, id);

    return tx
      .select({
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
  });

  if (!submission) {
    return NextResponse.json({ error: "Submission not found." }, { status: 404 });
  }

  const mediaPath =
    kind === "processed"
      ? submission.processedPath ?? submission.rawStoragePath
      : submission.rawStoragePath;

  // No object store configured (dev): serve the bytes ourselves, since there is
  // no presigned URL to redirect to. mediaPath comes from the DB, never the
  // request, so this cannot be pointed at an arbitrary file.
  if (isLocalStorage()) {
    return serveLocalMedia(mediaPath, request) as unknown as NextResponse;
  }

  const presignedUrl = await getPresignedDownloadUrl(
    mediaPath,
    MEDIA_PRESIGNED_EXPIRY_SECONDS,
  );
  return NextResponse.redirect(presignedUrl, { status: 307 });
}
