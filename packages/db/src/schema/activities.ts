import {
  check,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { schools } from "./schools";
import { users } from "./users";

export const ACTIVITY_SUBMISSION_MODES = ["audio", "video"] as const;
export type ActivitySubmissionMode = (typeof ACTIVITY_SUBMISSION_MODES)[number];

/**
 * activities — teacher-authored speaking/read-aloud tasks. This is the real
 * target behind `submissions.activity_id` from the PRD. Carries `school_id`
 * so it is tenant-isolated through RLS like every other school-scoped table.
 */
export const activities = pgTable(
  "activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id),
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => users.id),
    title: text("title").notNull(),
    prompt: text("prompt").notNull(),
    targetLanguage: text("target_language").notNull(),
    passageText: text("passage_text").notNull(),
    teacherName: text("teacher_name").notNull(),
    teacherReferenceText: text("teacher_reference_text").notNull(),
    referenceAudioPath: text("reference_audio_path"),
    // Optional teacher-recorded reference VIDEO — powers the side-by-side mouth
    // comparison (student's mouth vs the model's). Independent of the audio
    // reference above, which drives the read-along/waveform. Canonical storage
    // path, set via the chunked reference-video upload route.
    referenceVideoPath: text("reference_video_path"),
    coachNote: text("coach_note"),
    submissionModes: jsonb("submission_modes")
      .$type<ActivitySubmissionMode[]>()
      .notNull(),
    timeLimitSeconds: integer("time_limit_seconds").notNull().default(90),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("activities_time_limit_seconds_check", sql`${table.timeLimitSeconds} > 0`),
    check(
      "activities_submission_modes_nonempty_check",
      sql`jsonb_array_length(${table.submissionModes}) > 0`,
    ),
  ],
);

export type Activity = typeof activities.$inferSelect;
export type NewActivity = typeof activities.$inferInsert;
