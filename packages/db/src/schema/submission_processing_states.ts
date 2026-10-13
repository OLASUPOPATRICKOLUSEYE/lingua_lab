import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { schools } from "./schools";
import { submissions } from "./submissions";

/**
 * Mutable pipeline state for a submission. `submissions` itself stays immutable
 * after creation (AGENTS.md rule #1); normalization / grading lifecycle and the
 * processed media path live here instead.
 */
export const submissionProcessingStates = pgTable("submission_processing_states", {
  submissionId: uuid("submission_id")
    .primaryKey()
    .references(() => submissions.id),
  schoolId: uuid("school_id")
    .notNull()
    .references(() => schools.id),
  status: text("status").notNull().default("pending"),
  processedPath: text("processed_path"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type SubmissionProcessingState =
  typeof submissionProcessingStates.$inferSelect;
export type NewSubmissionProcessingState =
  typeof submissionProcessingStates.$inferInsert;
