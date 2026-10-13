import { check, pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { activities } from "./activities";
import { activityAssignments } from "./activity_assignments";
import { schools } from "./schools";
import { users } from "./users";

/**
 * submissions — APPEND-ONLY. A row is never UPDATEd after creation
 * (AGENTS.md rule #1, data-model.md). There is deliberately no `updatedAt`
 * column. Grading produces a separate `grading_results` row; a re-grade is a
 * new `grading_results` row with an incremented `model_version`, never a
 * mutation here.
 *
 * Carries `school_id` → RLS-isolated (RLS anchor). PRD v1.0 §6 (submissions).
 */
export const submissions = pgTable(
  "submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // RLS anchor.
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id),
    // FK → activities(id). The constraint is NOT VALID in migration 0006 so
    // pre-activities dev rows (synthetic fixture UUIDs) are grandfathered while
    // every NEW submission must reference a real activity.
    activityId: uuid("activity_id")
      .notNull()
      .references(() => activities.id),
    // The specific assignment this submission was made against, captured at
    // creation so class/context attribution is FROZEN and unambiguous — never
    // re-inferred from the student's (mutable) memberships later. Nullable:
    // legacy rows predate assignments, and a submission may exist with no active
    // assignment (edge case). Teacher review joins through this, not memberships.
    assignmentId: uuid("assignment_id").references(() => activityAssignments.id),
    // Canonical storage paths — generated via src/lib/storage-paths.ts, never
    // constructed inline. {school_id}/{course_id}/{student_id}/{id}.{ext}
    rawStoragePath: text("raw_storage_path").notNull(),
    // Whether the student recorded audio or video. Written ONCE at creation
    // (never updated — append-only holds), because the file extension cannot
    // answer this: MediaRecorder emits both audio/webm and video/webm as .webm,
    // and both audio/mp4 and video/mp4 as .mp4. Without this the teacher's
    // review has no way to know whether to render a player with a picture.
    // Nullable: rows created before this column existed have no honest value,
    // so readers fall back to the (ambiguous) extension heuristic for them —
    // see resolveSubmissionMediaType in utils/presentation/submission.tsx.
    mediaType: text("media_type"),
    submittedAt: timestamp("submitted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "submissions_media_type_check",
      sql`${table.mediaType} is null or ${table.mediaType} in ('audio', 'video')`,
    ),
  ],
);

export type Submission = typeof submissions.$inferSelect;
export type NewSubmission = typeof submissions.$inferInsert;
