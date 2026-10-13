import "dotenv/config";
import { randomUUID } from "node:crypto";
import {
  gradingResults,
  submissionProcessingStates,
  withClaims,
} from "@lingua/db";
import { and, eq } from "drizzle-orm";
import { Worker } from "bullmq";
import {
  gradeSubmissionWithAi,
  type GradeSubmissionResult,
} from "../ai/grading-client";
import { getActivityReferenceById } from "../activities/reference";
import {
  GRADING_DLQ_JOB_NAME,
  GRADING_QUEUE_NAME,
  getGradingDeadLetterQueue,
  type GradingJobPayload,
} from "../queues/grading";
import { getRedisConnection } from "../queues/redis";
import {
  getGradingWorkerConcurrency,
  handleGradingFailure,
  processGradingJob,
} from "./grading-runtime";
import { insertGradingResultCompat } from "../grading/grading-result-write";

async function insertGradingResult(
  payload: GradingJobPayload,
  result: GradeSubmissionResult,
): Promise<void> {
  await withClaims(
    {
      sub: payload.studentId,
      school_id: payload.schoolId,
      role: "student",
    },
    async (tx) => {
      const existingResults = await tx
        .select({
          modelVersion: gradingResults.modelVersion,
        })
        .from(gradingResults)
        .where(eq(gradingResults.submissionId, payload.submissionId));

      const normalizedModelVersion =
        existingResults.some((row) => row.modelVersion === result.modelVersion)
          ? `${result.modelVersion}-regrade-${existingResults.length + 1}`
          : result.modelVersion;

      await insertGradingResultCompat(tx, gradingResults, {
        id: randomUUID(),
        schoolId: payload.schoolId,
        submissionId: payload.submissionId,
        transcript: result.transcript,
        phonemeScores: result.phonemeScores,
        wordTimestamps: result.wordTimestamps,
        wpm: result.wpm,
        wer: result.wer,
        fluencyScore: result.fluencyScore,
        pronunciationScore: result.pronunciationScore,
        cefrEstimate: result.cefrEstimate,
        modelVersion: normalizedModelVersion,
      });
    },
  );
}

async function updateSubmissionStatus(
  payload: GradingJobPayload,
  status: "graded" | "failed" | "pending_review",
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
        .set({ status })
        .where(
          and(
            eq(submissionProcessingStates.submissionId, payload.submissionId),
            eq(submissionProcessingStates.schoolId, payload.schoolId),
          ),
        );
    },
  );
}

const worker = new Worker<GradingJobPayload, GradeSubmissionResult>(
  GRADING_QUEUE_NAME,
  async (job) =>
    processGradingJob(job.data, {
      gradeSubmissionWithAi: async (payload) => {
        const assignment = await getActivityReferenceById({
          activityId: payload.activityId,
          schoolId: payload.schoolId,
        });

        return gradeSubmissionWithAi({
          ...payload,
          expectedTranscript: assignment?.activity.teacherReferenceText ?? null,
          targetLanguage: assignment?.activity.targetLanguage ?? null,
        });
      },
      insertGradingResult,
      updateSubmissionStatus,
      addDeadLetter: async (payload) => {
        await getGradingDeadLetterQueue().add(GRADING_DLQ_JOB_NAME, payload, {
          jobId: `${payload.submissionId}:dead-letter:${Date.now()}`,
        });
      },
      now: () => new Date().toISOString(),
    }),
  {
    connection: getRedisConnection(),
    concurrency: getGradingWorkerConcurrency(),
  },
);

worker.on("completed", (job, result) => {
  console.log(
    `[grading] completed submission=${job.id} model=${result?.modelVersion ?? "unknown"}`,
  );
});

worker.on("failed", async (job, error) => {
  if (!job) {
    console.error("[grading] failed job without payload", error);
    return;
  }

  console.error(
    `[grading] failed submission=${job.data.submissionId} attempt=${job.attemptsMade}/${job.opts.attempts ?? 1}: ${error.message}`,
  );

  await handleGradingFailure(job, error, {
    updateSubmissionStatus,
    addDeadLetter: async (payload) => {
      await getGradingDeadLetterQueue().add(GRADING_DLQ_JOB_NAME, payload, {
        jobId: `${payload.submissionId}:dead-letter:${Date.now()}`,
      });
    },
    now: () => new Date().toISOString(),
  });
});

worker.on("error", (error) => {
  console.error("[grading] worker error", error);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void worker.close().finally(() => process.exit(0));
  });
}

console.log(
  `[grading] worker started queue=${GRADING_QUEUE_NAME} concurrency=${getGradingWorkerConcurrency()}`,
);
