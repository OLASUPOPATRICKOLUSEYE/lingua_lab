import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * auth_credentials — one row per user, holding their password hash.
 * Deliberately has no `school_id` and is never RLS-protected: a login has to
 * be resolvable before there are any claims to scope by. Granted directly to
 * `lingua_app` (see drizzle/rls/002_auth_tables.sql), bypassing the
 * `authenticated`-role/withClaims() path every other table goes through.
 */
export const authCredentials = pgTable("auth_credentials", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type AuthCredential = typeof authCredentials.$inferSelect;
export type NewAuthCredential = typeof authCredentials.$inferInsert;
