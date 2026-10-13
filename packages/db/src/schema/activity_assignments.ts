import {
  check,
  pgTable,
  timestamp,
  unique,
  uuid,
  text,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { activities } from "./activities";
import { classes } from "./classes";
import { schools } from "./schools";
import { users } from "./users";

export const ACTIVITY_ASSIGNMENT_STATUSES = ["assigned", "archived"] as const;
export type ActivityAssignmentStatus =
  (typeof ACTIVITY_ASSIGNMENT_STATUSES)[number];

/**
 * activity_assignments — links a published activity to a class. This is the
 * delivery layer students are filtered through: they should see only assigned
 * missions for classes they belong to, not every activity in the school.
 */
export const activityAssignments = pgTable(
  "activity_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id),
    activityId: uuid("activity_id")
      .notNull()
      .references(() => activities.id),
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id),
    assignedBy: uuid("assigned_by")
      .notNull()
      .references(() => users.id),
    status: text("status").notNull().default("assigned"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    assignedAt: timestamp("assigned_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    unique("activity_assignments_activity_class_unique").on(
      table.activityId,
      table.classId,
    ),
    check(
      "activity_assignments_status_check",
      sql`${table.status} in ('assigned', 'archived')`,
    ),
    check(
      "activity_assignments_archived_consistency_check",
      sql`(${table.status} = 'archived') = (${table.archivedAt} is not null)`,
    ),
  ],
);

export type ActivityAssignment = typeof activityAssignments.$inferSelect;
export type NewActivityAssignment = typeof activityAssignments.$inferInsert;
