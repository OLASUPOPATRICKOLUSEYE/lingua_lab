import { NextResponse } from "next/server";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import {
  submissionProcessingStates,
  submissions,
  withClaims,
} from "@lingua/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { normalizeActivityId } from "../../../../server/activities/reference";
import { enqueueNormalizationJob } from "@/server/queues/normalization";
import { finalizeUpload } from "@/server/uploads/finalize-upload";
import { toAuthClaims, verifySession } from "@/utils/auth/dal";
import {
  getStudentAssignmentForStudent,
  resolveAssignmentIdForSubmission,
} from "@/utils/student/assignment-data";
import {
  assembleS3Upload,
  removeLocalChunkUpload,
  removeLocalUpload,
  writeChunkToLocalUpload,
} from "@/utils/storage/s3";

const MAX_CHUNK_BYTES = 5 * 1024 * 1024;
// Ceiling on a whole submission, mirroring the reference-video route. The
// longest configurable take is 5 minutes, which is ~75 MB of 720p video at
// 2 Mbps; 200 MB leaves generous headroom for a verbose codec. Without a cap,
// `totalChunks` is a client-supplied integer with no upper bound — a caller
// could claim 10,000 chunks and stream 50 GB into the bucket. Audio kept that
// theoretical; video is what makes it worth paying for.
const MAX_TOTAL_BYTES = 200 * 1024 * 1024;
const MAX_TOTAL_CHUNKS = Math.ceil(MAX_TOTAL_BYTES / MAX_CHUNK_BYTES);
const uploadFormSchema = z.object({
  uploadId: z.string().uuid(),
  activityId: z.string().trim().min(1),
  takeId: z.string().uuid(),
  chunkIndex: z.coerce.number().int().min(0),
  totalChunks: z.coerce.number().int().min(1).max(MAX_TOTAL_CHUNKS),
  fileName: z.string().trim().min(1),
  mimeType: z.string().trim().min(1),
  durationMs: z.coerce.number().int().min(1),
  chunk: z.instanceof(File),
});

function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

function tooLarge(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 413 });
}

function mimeTypeToExtension(mimeType: string): string {
  const baseMimeType = mimeType.split(";")[0]?.trim().toLowerCase();

  switch (baseMimeType) {
    case "audio/webm":
    case "video/webm":
      return "webm";
    case "audio/mp4":
    case "video/mp4":
      return "mp4";
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

/**
 * Audio vs video, which the extension cannot express: MediaRecorder emits
 * audio/webm and video/webm as the same ".webm". Persisted on the submission so
 * the teacher's review knows whether to render a player with a picture.
 */
function mimeTypeToMediaType(mimeType: string): "audio" | "video" {
  return mimeType.split(";")[0]?.trim().toLowerCase().startsWith("video/")
    ? "video"
    : "audio";
}

export async function POST(request: Request): Promise<NextResponse> {
  let session;
  try {
    session = await verifySession();
  } catch (error) {
    if (isRedirectError(error)) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    throw error;
  }

  const formData = await request.formData();
  const parsed = uploadFormSchema.safeParse({
    uploadId: formData.get("uploadId"),
    activityId: formData.get("activityId"),
    takeId: formData.get("takeId"),
    chunkIndex: formData.get("chunkIndex"),
    totalChunks: formData.get("totalChunks"),
    fileName: formData.get("fileName"),
    mimeType: formData.get("mimeType"),
    durationMs: formData.get("durationMs"),
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
    return tooLarge(`Chunk exceeds ${MAX_CHUNK_BYTES} bytes.`);
  }

  let extension: string;
  let activityUuid: string;
  try {
    extension = mimeTypeToExtension(payload.mimeType);
    activityUuid = normalizeActivityId(payload.activityId);
  } catch (error) {
    return badRequest((error as Error).message);
  }

  // Normalize the browser MIME type to a canonical IANA type for the S3
  // ContentType header. Strip codec params (e.g. ";codecs=opus") and map the
  // two non-standard x- prefixes that MediaRecorder emits on some platforms.
  const rawBase = payload.mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  const contentType =
    rawBase === "audio/x-m4a" ? "audio/mp4" :
    rawBase === "audio/x-wav" ? "audio/wav" :
    rawBase;

  // Verify assignment visibility before writing any chunk. If a mission has
  // been revoked mid-upload, also clear any earlier staged chunks for this
  // upload so temp storage does not accumulate.
  const assignment = await getStudentAssignmentForStudent(session, activityUuid);
  if (!assignment) {
    await removeLocalChunkUpload(payload.uploadId);
    return NextResponse.json(
      { error: "Unknown activity for this school." },
      { status: 404 },
    );
  }

  // Freeze which assignment this submission is made against, resolved once here
  // rather than re-inferred from mutable memberships at read time.
  const assignmentId = await resolveAssignmentIdForSubmission(
    session,
    activityUuid,
  );

  await writeChunkToLocalUpload({
    uploadId: payload.uploadId,
    chunkIndex: payload.chunkIndex,
    chunk: Buffer.from(await payload.chunk.arrayBuffer()),
  });

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

  try {
    const { submissionId } = await finalizeUpload(
      {
        session,
        activityId: activityUuid,
        assignmentId,
        extension,
        mediaType: mimeTypeToMediaType(payload.mimeType),
        uploadId: payload.uploadId,
        totalChunks: payload.totalChunks,
      },
      {
        assembleLocalUpload: (input) => assembleS3Upload({ ...input, contentType }),
        insertSubmission: async ({
          submissionId,
          schoolId,
          studentId,
          activityId,
          assignmentId,
          rawStoragePath,
          mediaType,
        }) => {
          await withClaims(toAuthClaims(session), async (tx) => {
            await tx.insert(submissions).values({
              id: submissionId,
              schoolId,
              studentId,
              activityId,
              assignmentId,
              rawStoragePath,
              mediaType,
            });
            await tx.insert(submissionProcessingStates).values({
              submissionId,
              schoolId,
              status: "pending",
            });
          });
        },
        enqueueNormalizationJob,
        markSubmissionFailed: async (submissionId) => {
          await withClaims(toAuthClaims(session), async (tx) => {
            await tx
              .update(submissionProcessingStates)
              .set({ status: "failed" })
              .where(eq(submissionProcessingStates.submissionId, submissionId));
          });
        },
        removeLocalUpload,
      },
    );

    return NextResponse.json(
      {
        ok: true,
        submissionId,
        status: "pending",
        manualReview: !process.env.AI_SERVICE_URL,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Missing chunk ")) {
      await removeLocalChunkUpload(payload.uploadId);
      return badRequest(error.message);
    }
    throw error;
  }
}
