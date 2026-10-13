import { describe, expect, it, vi } from "vitest";
import {
  insertGradingResultCompat,
  isMissingWordTimestampsColumnError,
} from "./grading-result-write";

describe("grading result write compatibility", () => {
  it("detects a nested missing word_timestamps column error", () => {
    const error = new Error("Failed query");
    (error as Error & { cause?: unknown }).cause = new Error(
      'column "word_timestamps" does not exist',
    );

    expect(isMissingWordTimestampsColumnError(error)).toBe(true);
  });

  it("retries inserts without word timestamps on legacy schemas", async () => {
    const values = {
      id: "grade-1",
      schoolId: "school-1",
      submissionId: "submission-1",
      transcript: "hello world",
      wordTimestamps: [{ word: "hello", start_ms: 0, end_ms: 200 }],
      modelVersion: "model-v1",
    };

    const valuesMock = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error("Failed query"), {
          cause: new Error('column "word_timestamps" does not exist'),
        }),
      )
      .mockResolvedValueOnce(undefined);
    const tx = {
      insert: vi.fn(() => ({
        values: valuesMock,
      })),
    };

    await insertGradingResultCompat(tx as never, {} as never, values);

    expect(valuesMock).toHaveBeenNthCalledWith(1, values);
    expect(valuesMock).toHaveBeenNthCalledWith(2, {
      id: "grade-1",
      schoolId: "school-1",
      submissionId: "submission-1",
      transcript: "hello world",
      modelVersion: "model-v1",
    });
  });
});
