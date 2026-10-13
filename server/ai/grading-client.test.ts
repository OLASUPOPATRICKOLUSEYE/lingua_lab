import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AiServiceUnavailableError,
  gradeSubmissionWithAi,
} from "./grading-client";

const payload = {
  submissionId: "11111111-1111-1111-8111-111111111111",
  schoolId: "22222222-2222-2222-8222-222222222222",
  studentId: "33333333-3333-3333-8333-333333333333",
  activityId: "44444444-4444-4444-8444-444444444444",
  processedPath:
    "processed/22222222-2222-2222-8222-222222222222/44444444-4444-4444-8444-444444444444/33333333-3333-3333-8333-333333333333/11111111-1111-1111-8111-111111111111.wav",
  expectedTranscript: "hello world",
  targetLanguage: "English",
};

describe("grading client", () => {
  const originalFetch = global.fetch;
  const originalAiServiceUrl = process.env.AI_SERVICE_URL;

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.AI_SERVICE_URL = originalAiServiceUrl;
    vi.restoreAllMocks();
  });

  it("posts the grading payload and maps a valid AI response", async () => {
    process.env.AI_SERVICE_URL = "http://ai.internal:8000";
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        transcript: "hello world",
        phoneme_scores: [
          {
            phoneme: "HH",
            expected: "HH",
            confidence: 0.91,
            timestamp_ms: 120,
          },
        ],
        word_timestamps: [
          {
            word: "hello",
            start_ms: 0,
            end_ms: 320,
          },
          {
            word: "world",
            start_ms: 380,
            end_ms: 700,
          },
        ],
        wpm: 118,
        wer: 0.08,
        fluency_score: 84,
        pronunciation_score: 79,
        cefr_estimate: "B1",
        model_version: "whisper-medium-v1",
      }),
    }) as typeof fetch;

    const result = await gradeSubmissionWithAi(payload);

    expect(global.fetch).toHaveBeenCalledWith("http://ai.internal:8000/grade", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        submission_id: payload.submissionId,
        school_id: payload.schoolId,
        student_id: payload.studentId,
        activity_id: payload.activityId,
        processed_path: payload.processedPath,
        expected_transcript: payload.expectedTranscript,
        target_language: payload.targetLanguage,
      }),
    });
    expect(result).toEqual({
      transcript: "hello world",
      phonemeScores: [
        {
          phoneme: "HH",
          expected: "HH",
          confidence: 0.91,
          timestamp_ms: 120,
        },
      ],
      wordTimestamps: [
        {
          word: "hello",
          start_ms: 0,
          end_ms: 320,
        },
        {
          word: "world",
          start_ms: 380,
          end_ms: 700,
        },
      ],
      wpm: 118,
      wer: 0.08,
      fluencyScore: 84,
      pronunciationScore: 79,
      cefrEstimate: "B1",
      modelVersion: "whisper-medium-v1",
    });
  });

  it("fails clearly when the AI service returns a non-200 response", async () => {
    process.env.AI_SERVICE_URL = "http://ai.internal:8000";
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => "service unavailable",
    }) as typeof fetch;

    await expect(gradeSubmissionWithAi(payload)).rejects.toThrow(
      "AI grading request failed with status 503: service unavailable",
    );
    await expect(gradeSubmissionWithAi(payload)).rejects.toBeInstanceOf(
      AiServiceUnavailableError,
    );
  });

  it("fails clearly when the AI service cannot be reached", async () => {
    process.env.AI_SERVICE_URL = "http://ai.internal:8000";
    global.fetch = vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED")) as typeof fetch;

    await expect(gradeSubmissionWithAi(payload)).rejects.toThrow(
      "AI grading request could not reach the AI service: connect ECONNREFUSED",
    );
    await expect(gradeSubmissionWithAi(payload)).rejects.toBeInstanceOf(
      AiServiceUnavailableError,
    );
  });

  it("fails clearly when the AI response shape is invalid", async () => {
    process.env.AI_SERVICE_URL = "http://ai.internal:8000";
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        transcript: "hello world",
      }),
    }) as typeof fetch;

    await expect(gradeSubmissionWithAi(payload)).rejects.toThrow(
      "AI grading response was invalid: Invalid input: expected string, received undefined",
    );
  });

  it("requires AI_SERVICE_URL", async () => {
    process.env.AI_SERVICE_URL = "";

    await expect(gradeSubmissionWithAi(payload)).rejects.toThrow(
      "AI_SERVICE_URL is not set. The grading worker requires the AI service endpoint.",
    );
  });
});
