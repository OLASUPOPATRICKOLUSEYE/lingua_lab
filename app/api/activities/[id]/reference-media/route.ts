import { NextResponse } from "next/server";
import { parseUuidParam } from "@/utils/api/route-params";
import { activities, withClaims } from "@lingua/db";
import { and, eq } from "drizzle-orm";
import { getPresignedDownloadUrl, isLocalStorage } from "@/utils/storage/s3";
import { serveLocalMedia } from "@/utils/storage/serve-local-media";
import { verifySession, toAuthClaims } from "@/utils/auth/dal";
import { getStudentAssignmentForStudent } from "@/utils/student/assignment-data";

export const dynamic = 'force-dynamic';

// See submissions/[id]/media/route.ts for the same reasoning: 1 hour covers
// the largest expected reference video (200 MB) at any realistic connection
// speed, with negligible downside for a read-only presigned URL.
const MEDIA_PRESIGNED_EXPIRY_SECONDS = 3600;

type MediaKind = "audio" | "video";

interface ReferenceMediaRouteProps {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(
  request: Request,
  { params }: ReferenceMediaRouteProps,
): Promise<NextResponse> {
  const session = await verifySession();
  const { id } = await params;
  // A malformed id is a bad request, not a server error.
  if (!parseUuidParam(id)) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }
  const kind: MediaKind =
    new URL(request.url).searchParams.get("kind") === "video" ? "video" : "audio";
  const label = kind === "video" ? "Reference video" : "Reference audio";

  if (session.role === "student") {
    const assignment = await getStudentAssignmentForStudent(session, id);
    const hasReference =
      kind === "video"
        ? Boolean(assignment?.activity.teacherReferenceVideoUrl)
        : Boolean(assignment?.activity.teacherReferenceAudioUrl);
    if (!hasReference) {
      return NextResponse.json({ error: `${label} not found.` }, { status: 404 });
    }
  }

  const rows = await withClaims(toAuthClaims(session), (tx) =>
    tx
      .select({
        referenceAudioPath: activities.referenceAudioPath,
        referenceVideoPath: activities.referenceVideoPath,
      })
      .from(activities)
      .where(
        session.role === "teacher"
          ? and(eq(activities.id, id), eq(activities.teacherId, session.id))
          : eq(activities.id, id),
      )
      .limit(1),
  );
  const activity = rows[0];
  const storagePath =
    kind === "video"
      ? activity?.referenceVideoPath
      : activity?.referenceAudioPath;

  if (!storagePath) {
    return NextResponse.json({ error: `${label} not found.` }, { status: 404 });
  }

  // Dev with no object store: stream the bytes instead of redirecting to a
  // presigned URL that cannot exist. storagePath comes from the DB.
  if (isLocalStorage()) {
    return serveLocalMedia(storagePath, request) as unknown as NextResponse;
  }

  const presignedUrl = await getPresignedDownloadUrl(
    storagePath,
    MEDIA_PRESIGNED_EXPIRY_SECONDS,
  );
  return NextResponse.redirect(presignedUrl, { status: 307 });
}
