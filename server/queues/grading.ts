import { Queue, type JobsOptions } from "bullmq";
import { getRedisConnection } from "./redis";

export const GRADING_QUEUE_NAME = "submission-grading";
export const GRADING_DLQ_NAME = "submission-grading-dead-letter";
const GRADING_JOB_NAME = "grade-submission";
const GRADING_DLQ_JOB_NAME = "grading-failed";

export interface GradingJobPayload {
  submissionId: string;
  schoolId: string;
  studentId: string;
  activityId: string;
  processedPath: string;
}

export interface GradingDeadLetterPayload extends GradingJobPayload {
  reason: string;
  failedAt: string;
}

const jobOptions: JobsOptions = {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 10_000,
  },
  removeOnComplete: 1000,
  removeOnFail: false,
};

let gradingQueue: Queue<
  GradingJobPayload,
  unknown,
  typeof GRADING_JOB_NAME
> | null = null;

let gradingDeadLetterQueue: Queue<
  GradingDeadLetterPayload,
  unknown,
  typeof GRADING_DLQ_JOB_NAME
> | null = null;

export function getGradingQueue(): Queue<
  GradingJobPayload,
  unknown,
  typeof GRADING_JOB_NAME
> {
  if (!gradingQueue) {
    gradingQueue = new Queue<
      GradingJobPayload,
      unknown,
      typeof GRADING_JOB_NAME
    >(GRADING_QUEUE_NAME, {
      connection: getRedisConnection(),
      defaultJobOptions: jobOptions,
    });
  }

  return gradingQueue;
}

export function getGradingDeadLetterQueue(): Queue<
  GradingDeadLetterPayload,
  unknown,
  typeof GRADING_DLQ_JOB_NAME
> {
  if (!gradingDeadLetterQueue) {
    gradingDeadLetterQueue = new Queue<
      GradingDeadLetterPayload,
      unknown,
      typeof GRADING_DLQ_JOB_NAME
    >(GRADING_DLQ_NAME, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        removeOnComplete: false,
        removeOnFail: false,
      },
    });
  }

  return gradingDeadLetterQueue;
}

export async function enqueueGradingJob(
  payload: GradingJobPayload,
): Promise<void> {
  await getGradingQueue().add(GRADING_JOB_NAME, payload, {
    ...jobOptions,
    jobId: payload.submissionId,
  });
}

export { GRADING_DLQ_JOB_NAME, GRADING_JOB_NAME };
