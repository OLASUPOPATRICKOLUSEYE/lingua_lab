import type { NormalizationJobPayload } from "../queues/normalization";

export interface NormalizationResult {
  processedPath: string;
  status: string;
}

export interface DeadLetterPayload extends NormalizationJobPayload {
  reason: string;
  failedAt: string;
}

export interface FailedJobLike {
  data: NormalizationJobPayload;
  attemptsMade: number;
  opts: {
    attempts?: number;
  };
}

export interface NormalizationRuntimeDeps {
  buildProcessedStoragePath: (
    payload: NormalizationJobPayload,
  ) => string;
  /**
   * Downloads the raw recording from S3, normalises it with FFmpeg via local
   * temp files, uploads the resulting WAV back to S3, and cleans up. The
   * runtime only deals in S3-relative paths; the local temp-file lifecycle is
   * an implementation detail of the concrete dep in normalization-worker.ts.
   */
  normalizeAudio: (
    rawStoragePath: string,
    processedStoragePath: string,
  ) => Promise<void>;
  updateSubmission: (
    payload: NormalizationJobPayload,
    values: Partial<{
      processedPath: string;
      status: string;
    }>,
  ) => Promise<void>;
  getAiServiceUrl: () => string | undefined;
  enqueueGradingJob: (payload: {
    submissionId: string;
    schoolId: string;
    studentId: string;
    activityId: string;
    processedPath: string;
  }) => Promise<void>;
  addDeadLetter: (payload: DeadLetterPayload) => Promise<void>;
  now: () => string;
}

export function getWorkerConcurrency(): number {
  const raw = process.env.NORMALIZATION_WORKER_CONCURRENCY?.trim() ?? "50";
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 1) {
    throw new Error(
      `NORMALIZATION_WORKER_CONCURRENCY must be a positive integer, got: ${raw}`,
    );
  }
  return value;
}

export async function processNormalizationJob(
  payload: NormalizationJobPayload,
  deps: NormalizationRuntimeDeps,
): Promise<NormalizationResult> {
  const processedPath = deps.buildProcessedStoragePath(payload);

  await deps.updateSubmission(payload, { status: "processing" });

  await deps.normalizeAudio(payload.rawStoragePath, processedPath);

  const nextStatus = deps.getAiServiceUrl()?.trim()
    ? "processing"
    : "pending_review";

  await deps.updateSubmission(payload, {
    processedPath,
    status: nextStatus,
  });

  if (nextStatus === "processing") {
    await deps.enqueueGradingJob({
      submissionId: payload.submissionId,
      schoolId: payload.schoolId,
      studentId: payload.studentId,
      activityId: payload.activityId,
      processedPath,
    });
  }

  return {
    processedPath,
    status: nextStatus,
  };
}

export async function handleNormalizationFailure(
  job: FailedJobLike | undefined,
  error: Error,
  deps: Pick<NormalizationRuntimeDeps, "updateSubmission" | "addDeadLetter" | "now">,
): Promise<void> {
  if (!job) {
    return;
  }

  const attempts = job.opts.attempts ?? 1;
  const isTerminalFailure = job.attemptsMade >= attempts;

  if (!isTerminalFailure) {
    return;
  }

  await deps.updateSubmission(job.data, { status: "failed" });
  await deps.addDeadLetter({
    ...job.data,
    reason: error.message,
    failedAt: deps.now(),
  });
}
