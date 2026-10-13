import { z } from "zod";

/*
 * These ids come straight from Postgres `uuid` columns (submissions, users,
 * activities) — they are already valid and trusted. z.uuid() enforces the
 * strict RFC-4122 variant/version nibbles, which rejects perfectly valid
 * Postgres UUIDs (e.g. all-1s test/tenant ids). Validate SHAPE only, not the
 * RFC variant, for these internal identifiers.
 */
const dbUuid = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    "must be a UUID",
  );

export const phonemeScoreSchema = z.object({
  phoneme: z.string(),
  expected: z.string(),
  confidence: z.number(),
  timestamp_ms: z.number().int().nonnegative(),
});

export const wordTimestampSchema = z.object({
  word: z.string().min(1),
  start_ms: z.number().int().nonnegative(),
  end_ms: z.number().int().nonnegative(),
});

export const gradingRequestSchema = z.object({
  submission_id: dbUuid,
  school_id: dbUuid,
  student_id: dbUuid,
  activity_id: dbUuid,
  processed_path: z.string().min(1),
  expected_transcript: z.string().trim().min(1).nullable().optional(),
  target_language: z.string().trim().min(1).nullable().optional(),
});

export const gradingResponseSchema = z.object({
  transcript: z.string().nullable().optional(),
  phoneme_scores: z.array(phonemeScoreSchema).nullable().optional(),
  word_timestamps: z.array(wordTimestampSchema).nullable().optional(),
  wpm: z.number().int().nullable().optional(),
  wer: z.number().nullable().optional(),
  fluency_score: z.number().int().nullable().optional(),
  pronunciation_score: z.number().int().nullable().optional(),
  cefr_estimate: z.string().nullable().optional(),
  model_version: z.string().min(1),
});

export type GradingRequest = z.infer<typeof gradingRequestSchema>;
export type GradingResponse = z.infer<typeof gradingResponseSchema>;
