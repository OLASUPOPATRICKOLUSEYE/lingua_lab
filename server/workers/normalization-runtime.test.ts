import { describe, expect, it, vi } from "vitest";
import type { NormalizationJobPayload } from "../queues/normalization";
import {
  getWorkerConcurrency,
  handleNormalizationFailure,
  processNormalizationJob,
} from "./normalization-runtime";

const payload: NormalizationJobPayload = {
  submissionId: "11111111-1111-1111-1111-111111111111",
  schoolId: "22222222-2222-2222-2222-222222222222",
  studentId: "33333333-3333-3333-3333-333333333333",
  activityId: "44444444-4444-4444-4444-444444444444",
  rawStoragePath:
    "raw/22222222-2222-2222-2222-222222222222/44444444-4444-4444-4444-444444444444/33333333-3333-3333-3333-333333333333/11111111-1111-1111-1111-111111111111.webm",
};

describe("normalization runtime", () => {
  it("routes normalized submissions to pending_review when AI is disabled", async () => {
    const updateSubmission = vi.fn().mockResolvedValue(undefined);
    const normalizeAudio = vi.fn().mockResolvedValue(undefined);
    const enqueueGradingJob = vi.fn().mockResolvedValue(undefined);

    const processedPath =
      "processed/22222222-2222-2222-2222-222222222222/44444444-4444-4444-4444-444444444444/33333333-3333-3333-3333-333333333333/11111111-1111-1111-1111-111111111111.wav";

    const result = await processNormalizationJob(payload, {
      buildProcessedStoragePath: () => processedPath,
      normalizeAudio,
      updateSubmission,
      getAiServiceUrl: () => "",
      enqueueGradingJob,
      addDeadLetter: vi.fn(),
      now: () => "2026-07-02T00:00:00.000Z",
    });

    // The runtime passes the S3 relative paths through to the dep; the dep is
    // responsible for local temp files, ffmpeg, and S3 upload internally.
    expect(normalizeAudio).toHaveBeenCalledWith(
      payload.rawStoragePath,
      processedPath,
    );
    expect(updateSubmission).toHaveBeenNthCalledWith(1, payload, {
      status: "processing",
    });
    expect(updateSubmission).toHaveBeenNthCalledWith(2, payload, {
      processedPath,
      status: "pending_review",
    });
    expect(enqueueGradingJob).not.toHaveBeenCalled();
    expect(result.status).toBe("pending_review");
  });

  it("keeps normalized submissions in processing and enqueues grading when AI is enabled", async () => {
    const updateSubmission = vi.fn().mockResolvedValue(undefined);
    const enqueueGradingJob = vi.fn().mockResolvedValue(undefined);

    const result = await processNormalizationJob(payload, {
      buildProcessedStoragePath: () => "processed/path.wav",
      normalizeAudio: vi.fn().mockResolvedValue(undefined),
      updateSubmission,
      getAiServiceUrl: () => "http://ai.internal:8000",
      enqueueGradingJob,
      addDeadLetter: vi.fn(),
      now: () => "2026-07-02T00:00:00.000Z",
    });

    expect(updateSubmission).toHaveBeenLastCalledWith(payload, {
      processedPath: "processed/path.wav",
      status: "processing",
    });
    expect(enqueueGradingJob).toHaveBeenCalledWith({
      submissionId: payload.submissionId,
      schoolId: payload.schoolId,
      studentId: payload.studentId,
      activityId: payload.activityId,
      processedPath: "processed/path.wav",
    });
    expect(result.status).toBe("processing");
  });

  it("writes terminal failures to failed status and the dead-letter queue", async () => {
    const updateSubmission = vi.fn().mockResolvedValue(undefined);
    const addDeadLetter = vi.fn().mockResolvedValue(undefined);

    await handleNormalizationFailure(
      {
        data: payload,
        attemptsMade: 3,
        opts: { attempts: 3 },
      },
      new Error("ffmpeg crashed"),
      {
        updateSubmission,
        addDeadLetter,
        now: () => "2026-07-02T00:00:00.000Z",
      },
    );

    expect(updateSubmission).toHaveBeenCalledWith(payload, { status: "failed" });
    expect(addDeadLetter).toHaveBeenCalledWith({
      ...payload,
      reason: "ffmpeg crashed",
      failedAt: "2026-07-02T00:00:00.000Z",
    });
  });

  it("does not dead-letter non-terminal failures", async () => {
    const updateSubmission = vi.fn().mockResolvedValue(undefined);
    const addDeadLetter = vi.fn().mockResolvedValue(undefined);

    await handleNormalizationFailure(
      {
        data: payload,
        attemptsMade: 1,
        opts: { attempts: 3 },
      },
      new Error("retry me"),
      {
        updateSubmission,
        addDeadLetter,
        now: () => "2026-07-02T00:00:00.000Z",
      },
    );

    expect(updateSubmission).not.toHaveBeenCalled();
    expect(addDeadLetter).not.toHaveBeenCalled();
  });

  it("validates worker concurrency", () => {
    const original = process.env.NORMALIZATION_WORKER_CONCURRENCY;
    process.env.NORMALIZATION_WORKER_CONCURRENCY = "0";

    expect(() => getWorkerConcurrency()).toThrow(
      "NORMALIZATION_WORKER_CONCURRENCY must be a positive integer, got: 0",
    );

    process.env.NORMALIZATION_WORKER_CONCURRENCY = original;
  });
});
