import {
  check,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { schools } from "./schools";
import { users } from "./users";

/**
 * classes — teacher-owned student groups that activities can be assigned to.
 * This is the first targeting layer above school-wide activities: students
 * should see only the missions assigned to classes they belong to.
 */
export const classes = pgTable(
  "classes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id),
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("classes_school_slug_unique").on(table.schoolId, table.slug),
    check("classes_name_nonempty_check", sql`char_length(trim(${table.name})) > 0`),
    check("classes_slug_nonempty_check", sql`char_length(trim(${table.slug})) > 0`),
  ],
);

export type Class = typeof classes.$inferSelect;
export type NewClass = typeof classes.$inferInsert;
