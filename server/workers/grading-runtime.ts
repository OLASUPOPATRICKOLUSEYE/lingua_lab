import type { GradingJobPayload } from "../queues/grading";
import {
  AiServiceUnavailableError,
  type GradeSubmissionResult,
} from "../ai/grading-client";

export interface GradingDeadLetterPayload extends GradingJobPayload {
  reason: string;
  failedAt: string;
}

export interface FailedGradingJobLike {
  data: GradingJobPayload;
  attemptsMade: number;
  opts: {
    attempts?: number;
  };
}

export interface GradingRuntimeDeps {
  gradeSubmissionWithAi: (
    payload: GradingJobPayload,
  ) => Promise<GradeSubmissionResult>;
  insertGradingResult: (
    payload: GradingJobPayload,
    result: GradeSubmissionResult,
  ) => Promise<void>;
  updateSubmissionStatus: (
    payload: GradingJobPayload,
    status: "graded" | "failed" | "pending_review",
  ) => Promise<void>;
  addDeadLetter: (payload: GradingDeadLetterPayload) => Promise<void>;
  now: () => string;
}

export function getGradingWorkerConcurrency(): number {
  const raw = process.env.GRADING_WORKER_CONCURRENCY?.trim() ?? "1";
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value !== 1) {
    throw new Error(
      `GRADING_WORKER_CONCURRENCY must be 1 to protect GPU VRAM, got: ${raw}`,
    );
  }
  return value;
}

export async function processGradingJob(
  payload: GradingJobPayload,
  deps: GradingRuntimeDeps,
): Promise<GradeSubmissionResult> {
  const result = await deps.gradeSubmissionWithAi(payload);
  await deps.insertGradingResult(payload, result);
  await deps.updateSubmissionStatus(payload, "graded");
  return result;
}

export async function handleGradingFailure(
  job: FailedGradingJobLike | undefined,
  error: Error,
  deps: Pick<GradingRuntimeDeps, "updateSubmissionStatus" | "addDeadLetter" | "now">,
): Promise<void> {
  if (!job) {
    return;
  }

  const attempts = job.opts.attempts ?? 1;
  const isTerminalFailure = job.attemptsMade >= attempts;

  if (!isTerminalFailure) {
    return;
  }

  const fallbackToPendingReview = error instanceof AiServiceUnavailableError;

  await deps.updateSubmissionStatus(
    job.data,
    fallbackToPendingReview ? "pending_review" : "failed",
  );

  if (fallbackToPendingReview) {
    return;
  }

  await deps.addDeadLetter({
    ...job.data,
    reason: error.message,
    failedAt: deps.now(),
  });
}
