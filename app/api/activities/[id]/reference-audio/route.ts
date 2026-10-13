import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { parseUuidParam } from "@/utils/api/route-params";
import { activities, withClaims } from "@lingua/db";
import { and, eq } from "drizzle-orm";
import { buildStoragePath } from "@lingua/db";
import { requireRole, toAuthClaims } from "@/utils/auth/dal";
import {
  removeLocalUpload,
  writeBufferToLocalUpload,
} from "@/utils/storage/s3";

export const dynamic = 'force-dynamic';

function mimeTypeToExtension(mimeType: string): string {
  const baseMimeType = mimeType.split(";")[0]?.trim().toLowerCase();

  switch (baseMimeType) {
    case "audio/webm":
      return "webm";
    case "audio/mp4":
    case "audio/x-m4a":
      return "m4a";
    case "audio/mpeg":
      return "mp3";
    case "audio/wav":
    case "audio/x-wav":
      return "wav";
    case "audio/aac":
      return "aac";
    case "audio/ogg":
      return "ogg";
    default:
      throw new Error(`Unsupported audio mime type: ${mimeType}`);
  }
}

/*
 * Reference takes are ≤5min of audio; 20MB is generous headroom. The file is
 * buffered in memory before writing, so an explicit cap is load-bearing.
 */
const MAX_REFERENCE_AUDIO_BYTES = 20 * 1024 * 1024;

interface ReferenceAudioRouteProps {
  params: Promise<{
    id: string;
  }>;
}

export async function POST(
  request: Request,
  { params }: ReferenceAudioRouteProps,
): Promise<NextResponse> {
  const session = await requireRole(["teacher", "dept_head", "system_admin"]);
  const { id } = await params;
  // A malformed id is a bad request, not a server error.
  if (!parseUuidParam(id)) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Audio file is required." }, { status: 400 });
  }

  if (file.size === 0 || file.size > MAX_REFERENCE_AUDIO_BYTES) {
    return NextResponse.json(
      { error: `Audio file must be between 1 byte and ${MAX_REFERENCE_AUDIO_BYTES} bytes.` },
      { status: 413 },
    );
  }

  let extension: string;
  try {
    extension = mimeTypeToExtension(file.type);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }

  // Normalize to canonical IANA MIME type for the S3 ContentType header.
  const rawBase = file.type.split(";")[0]?.trim().toLowerCase() ?? "";
  const contentType =
    rawBase === "audio/x-m4a" ? "audio/mp4" :
    rawBase === "audio/x-wav" ? "audio/wav" :
    rawBase;

  // Plain teachers may only attach reference audio to their OWN activities
  // (same scoping as PATCH /api/activities/[id]); dept heads and admins may
  // manage any activity in their school. RLS still bounds everything to the
  // tenant regardless.
  const activityFilter =
    session.role === "teacher"
      ? and(eq(activities.id, id), eq(activities.teacherId, session.id))
      : eq(activities.id, id);

  const existing = await withClaims(toAuthClaims(session), (tx) =>
    tx
      .select({
        id: activities.id,
        schoolId: activities.schoolId,
        referenceAudioPath: activities.referenceAudioPath,
      })
      .from(activities)
      .where(activityFilter)
      .limit(1),
  );
  const activity = existing[0];

  if (!activity) {
    return NextResponse.json({ error: "Activity not found." }, { status: 404 });
  }

  const referenceAssetId = randomUUID();
  const referenceAudioPath = buildStoragePath({
    bucket: "reference",
    schoolId: activity.schoolId,
    courseId: id,
    studentId: session.id,
    submissionId: referenceAssetId,
    ext: extension,
  });

  try {
    await writeBufferToLocalUpload(
      referenceAudioPath,
      Buffer.from(await file.arrayBuffer()),
      contentType,
    );
  } catch {
    return NextResponse.json({ error: "Could not store the audio file." }, { status: 500 });
  }

  try {
    await withClaims(toAuthClaims(session), (tx) =>
      tx
        .update(activities)
        .set({ referenceAudioPath })
        .where(
          and(
            eq(activities.id, id),
            eq(activities.schoolId, activity.schoolId),
          ),
        )
        .returning(),
    );
  } catch (error) {
    await removeLocalUpload(referenceAudioPath).catch(() => {});
    throw error;
  }

  if (activity.referenceAudioPath) {
    await removeLocalUpload(activity.referenceAudioPath).catch(() => {});
  }

  return NextResponse.json(
    {
      ok: true,
      referenceAudioUrl: `/api/activities/${id}/reference-media`,
    },
    { status: 201 },
  );
}
