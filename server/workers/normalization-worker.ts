import "dotenv/config";
import { randomUUID } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Worker } from "bullmq";
import {
  buildProcessedStoragePath,
  submissionProcessingStates,
  withClaims,
} from "@lingua/db";
import { and, eq } from "drizzle-orm";
import { deleteExpiredSessions } from "@/utils/auth/session-maintenance";
import { normalizeAudioWithFfmpeg } from "../audio/ffmpeg";
import { enqueueGradingJob } from "../queues/grading";
import {
  getNormalizationDeadLetterQueue,
  NORMALIZATION_DLQ_JOB_NAME,
  NORMALIZATION_JOB_NAME,
  NORMALIZATION_QUEUE_NAME,
  type NormalizationJobPayload,
} from "../queues/normalization";
import { getRedisConnection } from "../queues/redis";
import {
  getObjectBuffer,
  sweepStagedChunks,
  writeBufferToLocalUpload,
} from "../../utils/storage/s3";
import {
  getWorkerConcurrency,
  handleNormalizationFailure,
  processNormalizationJob,
} from "./normalization-runtime";

/**
 * Downloads the raw recording from S3, runs FFmpeg normalisation via local
 * temp files, uploads the resulting WAV back to S3, then cleans up both temp
 * files regardless of outcome.
 *
 * Temp files live in os.tmpdir() (/tmp on Linux). Each job gets a unique UUID
 * prefix so concurrent jobs (NORMALIZATION_WORKER_CONCURRENCY=2) never share
 * a filename — randomUUID() is 128-bit random, making collisions negligible.
 *
 * The input temp file preserves no meaningful extension because FFmpeg infers
 * the container from the file header (magic bytes), not the filename.
 */
async function normalizeAudio(
  rawStoragePath: string,
  processedStoragePath: string,
): Promise<void> {
  const tempId = randomUUID();
  const tempInput = path.join(tmpdir(), `normalization-${tempId}.input`);
  const tempOutput = path.join(tmpdir(), `normalization-${tempId}.wav`);

  try {
    // 1. Download the raw recording from S3 to a local temp file.
    //    getObjectBuffer is appropriate here: student audio recordings are
    //    typically 1–50 MB (up to ~75 MB for a 300 s video at 2 Mbps), well
    //    within comfortable in-memory range for the worker container (512 MB
    //    limit). Streaming to disk via getObjectStream would save peak memory
    //    but adds pipe-handling complexity that isn't warranted at this size.
    const rawBuffer = await getObjectBuffer(rawStoragePath);
    await writeFile(tempInput, rawBuffer);

    // 2. Run FFmpeg: temp input → temp output. Same flags as before
    //    (16 kHz, mono, loudnorm). ffmpeg.ts creates the parent dir and
    //    pre-deletes the output — both are no-ops for /tmp paths but harmless.
    await normalizeAudioWithFfmpeg({ inputPath: tempInput, outputPath: tempOutput });

    // 3. Read the normalised WAV and upload it to S3 at the processed key.
    const processedBuffer = await readFile(tempOutput);
    await writeBufferToLocalUpload(processedStoragePath, processedBuffer, "audio/wav");
  } finally {
    // 4. Clean up both temp files regardless of success or failure.
    //    { force: true } makes rm a no-op if a file was never created (e.g.
    //    if step 1 or 2 threw before producing it). allSettled ensures the
    //    second rm always runs even if the first one throws.
    await Promise.allSettled([
      rm(tempInput, { force: true }),
      rm(tempOutput, { force: true }),
    ]);
  }
}

async function updateSubmission(
  payload: NormalizationJobPayload,
  values: Partial<{
    processedPath: string;
    status: string;
  }>,
): Promise<void> {
  await withClaims(
    {
      sub: payload.studentId,
      school_id: payload.schoolId,
      role: "student",
    },
    async (tx) => {
      await tx
        .update(submissionProcessingStates)
        .set(values)
        .where(
          and(
            eq(submissionProcessingStates.submissionId, payload.submissionId),
            eq(submissionProcessingStates.schoolId, payload.schoolId),
          ),
        );
    },
  );
}

const worker = new Worker<
  NormalizationJobPayload,
  { processedPath: string; status: string },
  typeof NORMALIZATION_JOB_NAME
>(
  NORMALIZATION_QUEUE_NAME,
  async (job) => {
    return processNormalizationJob(job.data, {
      buildProcessedStoragePath: (payload) =>
        buildProcessedStoragePath({
          schoolId: payload.schoolId,
          courseId: payload.activityId,
          studentId: payload.studentId,
          submissionId: payload.submissionId,
        }),
      normalizeAudio,
      updateSubmission,
      getAiServiceUrl: () => process.env.AI_SERVICE_URL,
      enqueueGradingJob,
      addDeadLetter: async (payload) => {
        await getNormalizationDeadLetterQueue().add(
          NORMALIZATION_DLQ_JOB_NAME,
          payload,
          {
            jobId: `${payload.submissionId}:dead-letter:${Date.now()}`,
          },
        );
      },
      now: () => new Date().toISOString(),
    });
  },
  {
    connection: getRedisConnection(),
    concurrency: getWorkerConcurrency(),
  },
);

worker.on("completed", (job, result) => {
  console.log(
    `[normalization] completed submission=${job.id} status=${String(result?.status ?? "unknown")}`,
  );
});

worker.on("failed", async (job, error) => {
  if (!job) {
    console.error("[normalization] failed job without payload", error);
    return;
  }

  const payload = job.data;
  const attempts = job.opts.attempts ?? 1;

  console.error(
    `[normalization] failed submission=${payload.submissionId} attempt=${job.attemptsMade}/${attempts}: ${error.message}`,
  );

  await handleNormalizationFailure(job, error, {
    updateSubmission,
    addDeadLetter: async (deadLetterPayload) => {
      await getNormalizationDeadLetterQueue().add(
        NORMALIZATION_DLQ_JOB_NAME,
        deadLetterPayload,
        {
          jobId: `${deadLetterPayload.submissionId}:dead-letter:${Date.now()}`,
        },
      );
    },
    now: () => new Date().toISOString(),
  });
});

worker.on("error", (error) => {
  console.error("[normalization] worker error", error);
});

// Abandoned uploads (closed tab, dropped Wi-Fi, exhausted chunk retries) never
// reach assemble, so their staged chunks have no other collector. Swept here
// because this worker is long-lived and already owns post-upload cleanup.
const CHUNK_SWEEP_INTERVAL_MS = 60 * 60 * 1000;

async function sweepChunks(): Promise<void> {
  try {
    const removed = await sweepStagedChunks();
    if (removed > 0) {
      console.log(`[normalization] swept ${removed} stale chunk upload(s)`);
    }
  } catch (error) {
    // Never let cleanup take the worker down — it is housekeeping, not the job.
    console.error("[normalization] chunk sweep failed", error);
  }

  try {
    const expired = await deleteExpiredSessions();
    if (expired > 0) {
      console.log(`[normalization] purged ${expired} expired session(s)`);
    }
  } catch (error) {
    console.error("[normalization] session purge failed", error);
  }
}

void sweepChunks();
const sweepTimer = setInterval(() => void sweepChunks(), CHUNK_SWEEP_INTERVAL_MS);
// Do not hold the event loop open on shutdown.
sweepTimer.unref();

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    clearInterval(sweepTimer);
    void worker.close().finally(() => process.exit(0));
  });
}

console.log(
  `[normalization] worker started queue=${NORMALIZATION_QUEUE_NAME} concurrency=${getWorkerConcurrency()}`,
);
