import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

/**
 * schools — the tenant root. Every other table anchors to a school via
 * `school_id`. This table does NOT carry a `school_id` of its own (it *is* the
 * tenant); access is gated by the authenticated user's `school_id` claim — a
 * user may only read their own school row (see drizzle/rls/schools.sql).
 *
 * PRD v1.0 §6 (schools).
 */
export const schools = pgTable("schools", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  // Used in subdomain routing — UNIQUE NOT NULL.
  slug: text("slug").notNull().unique(),
  plan: text("plan").notNull().default("standard"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type School = typeof schools.$inferSelect;
export type NewSchool = typeof schools.$inferInsert;
