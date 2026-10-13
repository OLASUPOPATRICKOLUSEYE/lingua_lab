import type {
  PhonemeScore,
  WordTimestamp,
} from "../../packages/db/src/schema/grading_results";
import {
  gradingRequestSchema,
  gradingResponseSchema,
} from "./grading-contract";

export class AiServiceUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiServiceUnavailableError";
  }
}

export interface GradeSubmissionInput {
  submissionId: string;
  schoolId: string;
  studentId: string;
  activityId: string;
  processedPath: string;
  expectedTranscript?: string | null;
  targetLanguage?: string | null;
}

export interface GradeSubmissionResult {
  transcript: string | null;
  phonemeScores: PhonemeScore[] | null;
  wordTimestamps: WordTimestamp[] | null;
  wpm: number | null;
  wer: number | null;
  fluencyScore: number | null;
  pronunciationScore: number | null;
  cefrEstimate: string | null;
  modelVersion: string;
}

function getAiServiceUrl(): string {
  const url = process.env.AI_SERVICE_URL?.trim();
  if (!url) {
    throw new Error(
      "AI_SERVICE_URL is not set. The grading worker requires the AI service endpoint.",
    );
  }
  return url.replace(/\/+$/, "");
}

export async function gradeSubmissionWithAi(
  input: GradeSubmissionInput,
): Promise<GradeSubmissionResult> {
  const requestPayload = gradingRequestSchema.parse({
    submission_id: input.submissionId,
    school_id: input.schoolId,
    student_id: input.studentId,
    activity_id: input.activityId,
    processed_path: input.processedPath,
    expected_transcript: input.expectedTranscript ?? null,
    target_language: input.targetLanguage ?? null,
  });

  let response: Response;
  try {
    response = await fetch(`${getAiServiceUrl()}/grade`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(requestPayload),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new AiServiceUnavailableError(
      `AI grading request could not reach the AI service: ${message}`,
    );
  }

  if (!response.ok) {
    if (response.status === 503) {
      throw new AiServiceUnavailableError(
        `AI grading request failed with status 503: ${await response.text()}`,
      );
    }
    throw new Error(
      `AI grading request failed with status ${response.status}: ${await response.text()}`,
    );
  }

  const parsed = gradingResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error(
      `AI grading response was invalid: ${parsed.error.issues[0]?.message ?? "unknown error"}`,
    );
  }

  return {
    transcript: parsed.data.transcript ?? null,
    phonemeScores: parsed.data.phoneme_scores ?? null,
    wordTimestamps: parsed.data.word_timestamps ?? null,
    wpm: parsed.data.wpm ?? null,
    wer: parsed.data.wer ?? null,
    fluencyScore: parsed.data.fluency_score ?? null,
    pronunciationScore: parsed.data.pronunciation_score ?? null,
    cefrEstimate: parsed.data.cefr_estimate ?? null,
    modelVersion: parsed.data.model_version,
  };
}
