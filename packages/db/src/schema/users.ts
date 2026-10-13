import { pgTable, uuid, text, timestamp, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { schools } from "./schools";

/**
 * The 4-tier RBAC roles. The CHECK constraint below is the canonical
 * enforcement; this array is the single source of truth referenced by the app
 * (role-based redirects, requireRole/verifySession). PRD v1.0 §6 (users.role).
 */
export const USER_ROLES = [
  "system_admin",
  "dept_head",
  "teacher",
  "student",
] as const;
export type UserRole = (typeof USER_ROLES)[number];

/**
 * users — one row per platform user, owning both identity and app profile +
 * tenant membership (auth_credentials/sessions hang off this id — see those
 * schema files). Carries `school_id` → RLS-isolated. PRD v1.0 §6 (users).
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id),
    role: text("role").notNull(),
    fullName: text("full_name").notNull(),
    email: text("email").notNull().unique(),
    languagePref: text("language_pref").notNull().default("en"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "users_role_check",
      sql`${table.role} in ('system_admin', 'dept_head', 'teacher', 'student')`,
    ),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
