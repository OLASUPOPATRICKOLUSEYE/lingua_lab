import {
  pgTable,
  primaryKey,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { schools } from "./schools";
import { classes } from "./classes";
import { users } from "./users";

/**
 * class_memberships — which students belong to which class. Carries school_id
 * so RLS can isolate membership reads/writes by tenant like every other
 * school-scoped table.
 */
export const classMemberships = pgTable(
  "class_memberships",
  {
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.classId, table.studentId] })],
);

export type ClassMembership = typeof classMemberships.$inferSelect;
export type NewClassMembership = typeof classMemberships.$inferInsert;
