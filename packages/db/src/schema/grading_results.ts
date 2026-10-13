import {
  pgTable,
  uuid,
  text,
  integer,
  doublePrecision,
  jsonb,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { schools } from "./schools";
import { submissions } from "./submissions";
import { users } from "./users";

/**
 * One phoneme-confidence entry. The raw `confidence` (0.0–1.0) is ALWAYS
 * stored — never a band label ("strong"/"weak"/"flagged"). Bands are computed
 * at the presentation layer from PRD addendum §6.1 thresholds (>=0.8 strong,
 * 0.3–0.8 weak, <0.3 flagged) so they can be retuned without re-grading.
 */
export interface PhonemeScore {
  phoneme: string;
  expected: string;
  confidence: number; // 0.0 – 1.0, raw
  timestamp_ms: number;
}

export interface WordTimestamp {
  word: string;
  start_ms: number;
  end_ms: number;
}

/**
 * grading_results — written by the AI worker, one per grading pass. A re-grade
 * inserts a NEW row with the same `submission_id` and an incremented
 * `model_version` (never an UPDATE of submissions). The original PRD §6 table
 * marks `submission_id` UNIQUE; re-grading (addendum §6.4) requires multiple
 * results per submission, so uniqueness is on (submission_id, model_version)
 * — see drizzle/rls + the generated migration. The teacher dashboard shows the
 * latest by `graded_at`.
 *
 * Carries `school_id` → RLS-isolated (per §6 intro: "All tables include
 * school_id"). PRD v1.0 §6 (grading_results), PRD addendum §6.1.
 */
export const gradingResults = pgTable(
  "grading_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // RLS anchor — denormalized from the parent submission.
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => submissions.id),
    transcript: text("transcript"),
    // Raw confidence array — jsonb. Shape: PhonemeScore[].
    phonemeScores: jsonb("phoneme_scores").$type<PhonemeScore[]>(),
    wordTimestamps: jsonb("word_timestamps").$type<WordTimestamp[]>(),
    wpm: integer("wpm"),
    wer: doublePrecision("wer"), // word error rate, 0.0 – 1.0
    fluencyScore: integer("fluency_score"), // 0 – 100
    pronunciationScore: integer("pronunciation_score"), // 0 – 100
    cefrEstimate: text("cefr_estimate"), // A1 | A2 | B1 | B2 | C1 | C2
    modelVersion: text("model_version").notNull(),
    overrideJustification: text("override_justification"),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    gradedAt: timestamp("graded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // One result per (submission, model_version) — supports re-grading
    // (addendum §6.4) while keeping each pass unique. Supersedes the v1.0 §6
    // "submission_id UNIQUE" which predates the re-grade workflow.
    unique("grading_results_submission_model_unique").on(
      table.submissionId,
      table.modelVersion,
    ),
  ],
);

export type GradingResult = typeof gradingResults.$inferSelect;
export type NewGradingResult = typeof gradingResults.$inferInsert;
