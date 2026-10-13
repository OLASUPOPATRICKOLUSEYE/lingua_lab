import { boolean, pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { schools } from "./schools";
import { liveSessions } from "./live_sessions";
import { users } from "./users";

/**
 * live_session_attendance — who turned up to a live class.
 *
 * LinguaLab cannot observe the meeting itself (Zoom/Meet host the media), so
 * this records the strongest signal we actually own: the student pressed Join
 * from inside the app. `checked_in` distinguishes the two ways that happens —
 * true when they confirmed on the check-in form, false when they used the
 * "join without checking in" escape hatch. That escape hatch exists on purpose:
 * a check-in must never be the reason a student misses class, so the row is
 * written either way and the teacher can see the difference.
 *
 * Deliberately NOT a claim of presence for the full session — a student who
 * joins and walks away still has a row. True presence needs provider webhooks
 * (Zoom participant events / Meet attendance reports), which need per-school
 * OAuth credentials we do not have.
 *
 * One row per (session, student): re-joining keeps the FIRST joined_at, and
 * `checked_in` only ever ratchets false → true (see the upsert in
 * app/api/live-sessions/[id]/attendance/route.ts).
 */
export const liveSessionAttendance = pgTable(
  "live_session_attendance",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id),
    liveSessionId: uuid("live_session_id")
      .notNull()
      .references(() => liveSessions.id),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id),
    checkedIn: boolean("checked_in").notNull().default(false),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("live_session_attendance_session_student_unique").on(
      table.liveSessionId,
      table.studentId,
    ),
  ],
);

export type LiveSessionAttendance = typeof liveSessionAttendance.$inferSelect;
export type NewLiveSessionAttendance = typeof liveSessionAttendance.$inferInsert;
