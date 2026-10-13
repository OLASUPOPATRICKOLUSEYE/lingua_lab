import { Queue, type JobsOptions } from "bullmq";
import { getRedisConnection } from "./redis";

export const NORMALIZATION_QUEUE_NAME = "submission-normalization";
export const NORMALIZATION_DLQ_NAME = "submission-normalization-dead-letter";
const NORMALIZATION_JOB_NAME = "normalize-submission";
const NORMALIZATION_DLQ_JOB_NAME = "normalization-failed";

export interface NormalizationJobPayload {
  submissionId: string;
  schoolId: string;
  studentId: string;
  activityId: string;
  rawStoragePath: string;
}

export interface NormalizationDeadLetterPayload {
  submissionId: string;
  schoolId: string;
  studentId: string;
  activityId: string;
  rawStoragePath: string;
  reason: string;
  failedAt: string;
}

const jobOptions: JobsOptions = {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 5_000,
  },
  removeOnComplete: 1000,
  removeOnFail: false,
};

let normalizationQueue: Queue<
  NormalizationJobPayload,
  unknown,
  typeof NORMALIZATION_JOB_NAME
> | null = null;

let normalizationDeadLetterQueue: Queue<
  NormalizationDeadLetterPayload,
  unknown,
  typeof NORMALIZATION_DLQ_JOB_NAME
> | null = null;

export function getNormalizationQueue(): Queue<
  NormalizationJobPayload,
  unknown,
  typeof NORMALIZATION_JOB_NAME
> {
  if (!normalizationQueue) {
    normalizationQueue = new Queue<
      NormalizationJobPayload,
      unknown,
      typeof NORMALIZATION_JOB_NAME
    >(NORMALIZATION_QUEUE_NAME, {
      connection: getRedisConnection(),
      defaultJobOptions: jobOptions,
    });
  }

  return normalizationQueue;
}

export function getNormalizationDeadLetterQueue(): Queue<
  NormalizationDeadLetterPayload,
  unknown,
  typeof NORMALIZATION_DLQ_JOB_NAME
> {
  if (!normalizationDeadLetterQueue) {
    normalizationDeadLetterQueue = new Queue<
      NormalizationDeadLetterPayload,
      unknown,
      typeof NORMALIZATION_DLQ_JOB_NAME
    >(NORMALIZATION_DLQ_NAME, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        removeOnComplete: false,
        removeOnFail: false,
      },
    });
  }

  return normalizationDeadLetterQueue;
}

export async function enqueueNormalizationJob(
  payload: NormalizationJobPayload,
): Promise<void> {
  await getNormalizationQueue().add(NORMALIZATION_JOB_NAME, payload, {
    ...jobOptions,
    jobId: payload.submissionId,
  });
}

export { NORMALIZATION_DLQ_JOB_NAME, NORMALIZATION_JOB_NAME };
