import { check, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { schools } from "./schools";
import { classes } from "./classes";

/**
 * The external meeting providers a live class can point at. LinguaLab never
 * handles the media itself — this is a scheduled link-out, NOT the deferred
 * LiveKit/WebRTC cluster (PRD addendum §2). Adding a provider here means
 * adding a host allowlist entry in `utils/live-sessions/providers.ts` too.
 */
export const LIVE_SESSION_PROVIDERS = [
  "zoom",
  "google_meet",
  // A class happening in the room, with no meeting to join. Exists because a
  // school on a local network with no internet still runs live classes — it
  // just does not need video conferencing to do it. Students check in; the
  // teacher gets the same register. This is NOT the deferred LiveKit/WebRTC
  // work (PRD addendum §2): nothing streams anywhere.
  "in_person",
] as const;
export type LiveSessionProvider = (typeof LIVE_SESSION_PROVIDERS)[number];

/**
 * live_sessions — a scheduled live class for a `classes` row, pointing at an
 * externally hosted Zoom/Google Meet meeting.
 *
 * There is no `status` column on purpose: upcoming / live / ended is derived
 * from starts_at, ends_at and canceled_at at the presentation layer, so the
 * "is it live right now" window can be retuned without a migration or a
 * background job flipping rows. Cancelling is a soft `canceled_at` stamp so a
 * cancelled session stays visible to students who were expecting it.
 *
 * The host is the class's teacher (`classes.teacher_id`) — deliberately not
 * duplicated here.
 */
export const liveSessions = pgTable(
  "live_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id),
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id),
    provider: text("provider").notNull(),
    // Null for in-person classes — there is nothing to join.
    joinUrl: text("join_url"),
    title: text("title"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "live_sessions_provider_check",
      sql`${table.provider} in ('zoom', 'google_meet', 'in_person')`,
    ),
    check("live_sessions_time_order_check", sql`${table.endsAt} > ${table.startsAt}`),
    // Provider and URL must agree: a remote class without a link is unjoinable,
    // and an in-person class with one is a contradiction the UI cannot render.
    check(
      "live_sessions_join_url_check",
      sql`(${table.provider} = 'in_person' and ${table.joinUrl} is null)
          or (${table.provider} <> 'in_person' and ${table.joinUrl} like 'https://%')`,
    ),
  ],
);

export type LiveSession = typeof liveSessions.$inferSelect;
export type NewLiveSession = typeof liveSessions.$inferInsert;
