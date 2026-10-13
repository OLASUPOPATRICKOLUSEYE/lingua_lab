import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { activities, buildStoragePath, withClaims } from "@lingua/db";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireRole, toAuthClaims } from "@/utils/auth/dal";
import {
  assembleS3Upload,
  removeLocalChunkUpload,
  removeLocalUpload,
  writeChunkToLocalUpload,
} from "@/utils/storage/s3";

export const dynamic = 'force-dynamic';

const MAX_CHUNK_BYTES = 5 * 1024 * 1024;
// Reference clips are ≤5min of 720p video. Cap the total across chunks so a
// teacher can't fill the disk; 200MB is generous headroom for the format.
const MAX_TOTAL_BYTES = 200 * 1024 * 1024;
const MAX_TOTAL_CHUNKS = Math.ceil(MAX_TOTAL_BYTES / MAX_CHUNK_BYTES);

const uploadFormSchema = z.object({
  uploadId: z.string().uuid(),
  chunkIndex: z.coerce.number().int().min(0),
  totalChunks: z.coerce.number().int().min(1).max(MAX_TOTAL_CHUNKS),
  mimeType: z.string().trim().min(1),
  chunk: z.instanceof(File),
});

interface ReferenceVideoRouteProps {
  params: Promise<{ id: string }>;
}

function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

/** Reference video is only ever WebM (Chrome) or MP4 (Safari). */
function videoMimeToExtension(mimeType: string): string | null {
  const base = mimeType.split(";")[0]?.trim().toLowerCase();
  if (base === "video/webm") return "webm";
  if (base === "video/mp4") return "mp4";
  return null;
}

export async function POST(
  request: Request,
  { params }: ReferenceVideoRouteProps,
): Promise<NextResponse> {
  const session = await requireRole(["teacher", "dept_head", "system_admin"]);
  const { id } = await params;

  const formData = await request.formData();
  const parsed = uploadFormSchema.safeParse({
    uploadId: formData.get("uploadId"),
    chunkIndex: formData.get("chunkIndex"),
    totalChunks: formData.get("totalChunks"),
    mimeType: formData.get("mimeType"),
    chunk: formData.get("chunk"),
  });

  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Invalid upload payload.");
  }

  const payload = parsed.data;
  if (payload.chunkIndex >= payload.totalChunks) {
    return badRequest("chunkIndex must be less than totalChunks.");
  }
  if (payload.chunk.size === 0) {
    return badRequest("Chunk payload is empty.");
  }
  if (payload.chunk.size > MAX_CHUNK_BYTES) {
    return NextResponse.json(
      { error: `Chunk exceeds ${MAX_CHUNK_BYTES} bytes.` },
      { status: 413 },
    );
  }

  const extension = videoMimeToExtension(payload.mimeType);
  if (!extension) {
    return badRequest(`Unsupported video mime type: ${payload.mimeType}`);
  }
  // Derived unambiguously from the validated extension — no need to re-parse
  // the raw MIME string.
  const contentType = extension === "mp4" ? "video/mp4" : "video/webm";

  // Plain teachers may only attach reference media to their OWN activities;
  // dept heads / admins may manage any activity in their school. RLS bounds
  // everything to the tenant regardless.
  const activityFilter =
    session.role === "teacher"
      ? and(eq(activities.id, id), eq(activities.teacherId, session.id))
      : eq(activities.id, id);

  const [activity] = await withClaims(toAuthClaims(session), (tx) =>
    tx
      .select({
        id: activities.id,
        schoolId: activities.schoolId,
        referenceVideoPath: activities.referenceVideoPath,
      })
      .from(activities)
      .where(activityFilter)
      .limit(1),
  );

  if (!activity) {
    // Do not leave staged chunks around for an activity that isn't ours.
    await removeLocalChunkUpload(payload.uploadId).catch(() => {});
    return NextResponse.json({ error: "Activity not found." }, { status: 404 });
  }

  await writeChunkToLocalUpload({
    uploadId: payload.uploadId,
    chunkIndex: payload.chunkIndex,
    chunk: Buffer.from(await payload.chunk.arrayBuffer()),
  });

  // Non-final chunk: acknowledge and wait for the rest.
  if (payload.chunkIndex < payload.totalChunks - 1) {
    return NextResponse.json(
      {
        ok: true,
        uploadId: payload.uploadId,
        chunkIndex: payload.chunkIndex,
        totalChunks: payload.totalChunks,
      },
      { status: 202 },
    );
  }

  // Final chunk: assemble, then point the activity at the new asset.
  const referenceAssetId = randomUUID();
  const referenceVideoPath = buildStoragePath({
    bucket: "reference",
    schoolId: activity.schoolId,
    courseId: id,
    studentId: session.id,
    submissionId: referenceAssetId,
    ext: extension,
  });

  try {
    await assembleS3Upload({
      uploadId: payload.uploadId,
      totalChunks: payload.totalChunks,
      destinationRelativePath: referenceVideoPath,
      contentType,
    });
  } catch (error) {
    await removeLocalChunkUpload(payload.uploadId).catch(() => {});
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 422 },
    );
  }

  try {
    await withClaims(toAuthClaims(session), (tx) =>
      tx
        .update(activities)
        .set({ referenceVideoPath })
        .where(and(eq(activities.id, id), eq(activities.schoolId, activity.schoolId)))
        .returning(),
    );
  } catch (error) {
    await removeLocalUpload(referenceVideoPath).catch(() => {});
    throw error;
  }

  // Best-effort cleanup of the previous reference video, if any.
  if (activity.referenceVideoPath) {
    await removeLocalUpload(activity.referenceVideoPath).catch(() => {});
  }

  return NextResponse.json(
    {
      ok: true,
      referenceVideoUrl: `/api/activities/${id}/reference-media?kind=video`,
    },
    { status: 201 },
  );
}
