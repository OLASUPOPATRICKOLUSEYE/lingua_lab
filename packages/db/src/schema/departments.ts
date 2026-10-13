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
 * departments — the organisational grouping a school is divided into
 * (e.g. "Modern Languages"), provisioned by an admin alongside classes.
 * `head_id` is nullable on purpose: a department can be created before the
 * dept_head account that will lead it exists, and a head can leave without
 * taking the department with them.
 */
export const departments = pgTable(
  "departments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id),
    headId: uuid("head_id").references(() => users.id),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("departments_school_slug_unique").on(table.schoolId, table.slug),
    check(
      "departments_name_nonempty_check",
      sql`char_length(trim(${table.name})) > 0`,
    ),
    check(
      "departments_slug_nonempty_check",
      sql`char_length(trim(${table.slug})) > 0`,
    ),
  ],
);

export type Department = typeof departments.$inferSelect;
export type NewDepartment = typeof departments.$inferInsert;
