import { describe, expect, it, vi } from "vitest";
import { AiServiceUnavailableError } from "../ai/grading-client";
import type { GradingJobPayload } from "../queues/grading";
import {
  getGradingWorkerConcurrency,
  handleGradingFailure,
  processGradingJob,
} from "./grading-runtime";

const payload: GradingJobPayload = {
  submissionId: "11111111-1111-1111-1111-111111111111",
  schoolId: "22222222-2222-2222-2222-222222222222",
  studentId: "33333333-3333-3333-3333-333333333333",
  activityId: "44444444-4444-4444-4444-444444444444",
  processedPath:
    "processed/22222222-2222-2222-2222-222222222222/44444444-4444-4444-4444-444444444444/33333333-3333-3333-3333-333333333333/11111111-1111-1111-1111-111111111111.wav",
};

describe("grading runtime", () => {
  it("calls AI grading, writes the grading result, and marks the submission graded", async () => {
    const result = {
      transcript: "hello world",
      phonemeScores: null,
      wordTimestamps: null,
      wpm: 120,
      wer: 0.08,
      fluencyScore: 82,
      pronunciationScore: 79,
      cefrEstimate: "B1",
      modelVersion: "whisper-medium-v1",
    };

    const gradeSubmissionWithAi = vi.fn().mockResolvedValue(result);
    const insertGradingResult = vi.fn().mockResolvedValue(undefined);
    const updateSubmissionStatus = vi.fn().mockResolvedValue(undefined);

    const output = await processGradingJob(payload, {
      gradeSubmissionWithAi,
      insertGradingResult,
      updateSubmissionStatus,
      addDeadLetter: vi.fn(),
      now: () => "2026-07-02T00:00:00.000Z",
    });

    expect(gradeSubmissionWithAi).toHaveBeenCalledWith(payload);
    expect(insertGradingResult).toHaveBeenCalledWith(payload, result);
    expect(updateSubmissionStatus).toHaveBeenCalledWith(payload, "graded");
    expect(output).toEqual(result);
  });

  it("marks the submission failed and dead-letters terminal grading failures", async () => {
    const updateSubmissionStatus = vi.fn().mockResolvedValue(undefined);
    const addDeadLetter = vi.fn().mockResolvedValue(undefined);

    await handleGradingFailure(
      {
        data: payload,
        attemptsMade: 3,
        opts: { attempts: 3 },
      },
      new Error("AI service timeout"),
      {
        updateSubmissionStatus,
        addDeadLetter,
        now: () => "2026-07-02T00:00:00.000Z",
      },
    );

    expect(updateSubmissionStatus).toHaveBeenCalledWith(payload, "failed");
    expect(addDeadLetter).toHaveBeenCalledWith({
      ...payload,
      reason: "AI service timeout",
      failedAt: "2026-07-02T00:00:00.000Z",
    });
  });

  it("routes terminal AI-service outages to pending_review instead of failed", async () => {
    const updateSubmissionStatus = vi.fn().mockResolvedValue(undefined);
    const addDeadLetter = vi.fn().mockResolvedValue(undefined);

    await handleGradingFailure(
      {
        data: payload,
        attemptsMade: 3,
        opts: { attempts: 3 },
      },
      new AiServiceUnavailableError("AI service unavailable"),
      {
        updateSubmissionStatus,
        addDeadLetter,
        now: () => "2026-07-02T00:00:00.000Z",
      },
    );

    expect(updateSubmissionStatus).toHaveBeenCalledWith(
      payload,
      "pending_review",
    );
    expect(addDeadLetter).not.toHaveBeenCalled();
  });

  it("does not dead-letter retriable grading failures", async () => {
    const updateSubmissionStatus = vi.fn().mockResolvedValue(undefined);
    const addDeadLetter = vi.fn().mockResolvedValue(undefined);

    await handleGradingFailure(
      {
        data: payload,
        attemptsMade: 1,
        opts: { attempts: 3 },
      },
      new Error("retry"),
      {
        updateSubmissionStatus,
        addDeadLetter,
        now: () => "2026-07-02T00:00:00.000Z",
      },
    );

    expect(updateSubmissionStatus).not.toHaveBeenCalled();
    expect(addDeadLetter).not.toHaveBeenCalled();
  });

  it("requires GPU queue concurrency of exactly 1", () => {
    const original = process.env.GRADING_WORKER_CONCURRENCY;
    process.env.GRADING_WORKER_CONCURRENCY = "2";

    expect(() => getGradingWorkerConcurrency()).toThrow(
      "GRADING_WORKER_CONCURRENCY must be 1 to protect GPU VRAM, got: 2",
    );

    process.env.GRADING_WORKER_CONCURRENCY = original;
  });
});
