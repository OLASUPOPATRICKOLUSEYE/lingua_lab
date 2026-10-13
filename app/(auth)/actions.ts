"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { users, authCredentials, withClaims, db, sql } from "@lingua/db";
import { eq } from "drizzle-orm";
import { verify } from "@node-rs/argon2";
import { z } from "zod";
import { verifySession, toAuthClaims } from "@/utils/auth/dal";
import { createSession, destroySession } from "@/utils/auth/session";
import { ROLE_HOME } from "@/utils/auth/dal";
import type { UserRole } from "@lingua/db";
import { randomBytes, createHash } from "node:crypto";
import { sendPasswordResetEmail } from "@/server/email/resend";
import { passwordResetTokens } from "@lingua/db";
import { hash } from "@node-rs/argon2";
import { destroyAllSessionsForUser } from "@/utils/auth/session";
const LoginSchema = z.object({
  email: z.string().email("Enter a valid email."),
  password: z.string().min(1, "Password is required."),
});

export interface LoginState {
  error?: string;
  fieldErrors?: Partial<Record<"email" | "password", string>>;
}

export interface ForgotPasswordState {
  error?: string;
  message?: string;
  fieldErrors?: Partial<Record<"email", string>>;
}

export interface ResetPasswordState {
  error?: string;
  message?: string;
  fieldErrors?: Partial<Record<"password" | "confirmPassword", string>>;
}

export interface ProfileState {
  error?: string;
  message?: string;
  fieldErrors?: Partial<Record<"fullName" | "preferredLanguage", string>>;
}

export interface SettingState {
  error?: string;
  message?: string;
  fieldErrors?: Partial<Record<"timezone" | "weeklyGoalMinutes", string>>;
}

/**
 * Email/password login via Supabase Auth, then role-based redirect. Runs only
 * on the server (Server Action), so credentials never touch the client bundle.
 */
export async function login(
  _prev: LoginState | undefined,
  formData: FormData,
): Promise<LoginState> {
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    const f = parsed.error.flatten().fieldErrors;
    return {
      fieldErrors: { email: f.email?.[0], password: f.password?.[0] },
    };
  }
   // Look up the user by email. This runs BEFORE any tenant-scoped claims
  // exist — same reasoning as auth_credentials having no RLS: a login has
  // to be resolvable before there's anything to scope by. Direct query on
  // the admin-ish app pool is correct here, not withClaims().

const result = await db.execute(
    sql`select id, role from login_lookup_by_email(${parsed.data.email})`,
  );
  const user = result.rows[0] as { id: string; role: string } | undefined;

  if (!user) {
    return { error: "Invalid email or password." };
  }

  // Read through the SECURITY DEFINER function, not the table: `lingua_app` no
  // longer holds SELECT on auth_credentials, so a stray query can never enumerate
  // password hashes (see 005_credential_lookup.sql).
  const credentialResult = await db.execute(
    sql`select credential_hash_for_user(${user.id}) as password_hash`,
  );
  const passwordHash = (
    credentialResult.rows[0] as { password_hash: string | null } | undefined
  )?.password_hash;

  if (!passwordHash) {
    return { error: "Invalid email or password." };
  }

  const validPassword = await verify(passwordHash, parsed.data.password);

  if (!validPassword) {
    return { error: "Invalid email or password." };
  }

  await createSession(user.id);

  const role = user.role as UserRole;
  redirect(ROLE_HOME[role] ?? "/onboarding");
}

/** Sign out and return to the login screen. */
export async function logout(): Promise<void> {
  await destroySession();
  redirect("/login");
}

async function getPasswordResetRedirectUrl(): Promise<string> {
  const headerStore = await headers();
  const forwardedProto = headerStore.get("x-forwarded-proto");
  const forwardedHost = headerStore.get("x-forwarded-host");
  const host = forwardedHost ?? headerStore.get("host");
  const origin = host ? `${forwardedProto ?? "http"}://${host}` : undefined;
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    origin ??
    "http://localhost:3000";

  return new URL("/reset-password", baseUrl).toString();
}

const ForgotPasswordSchema = z.object({
  email: z.string().email("Enter a valid email."),
});

export async function requestPasswordReset(
  _prev: ForgotPasswordState | undefined,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const parsed = ForgotPasswordSchema.safeParse({
    email: formData.get("email"),
  });

  if (!parsed.success) {
    const f = parsed.error.flatten().fieldErrors;
    return { fieldErrors: { email: f.email?.[0] } };
  }

  // Always return the same message regardless of whether the email exists —
  // same reasoning as the login error message: don't leak which emails are
  // registered.
  const genericResponse: ForgotPasswordState = {
    message: "If that email is registered, a password reset link has been sent.",
  };

  const result = await db.execute(
    sql`select id from login_lookup_by_email(${parsed.data.email})`,
  );
  const user = result.rows[0] as { id: string } | undefined;

  if (!user) {
    return genericResponse;
  }

  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await db.insert(passwordResetTokens).values({
    userId: user.id,
    tokenHash,
    expiresAt,
  });

  const redirectBase = await getPasswordResetRedirectUrl();
  const resetUrl = `${redirectBase}?token=${token}`;

  await sendPasswordResetEmail(parsed.data.email, resetUrl);

  return genericResponse;
}

const ResetPasswordSchema = z
  .object({
    password: z.string().min(8, "Use at least 8 characters."),
    confirmPassword: z.string().min(1, "Confirm your new password."),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export async function resetPassword(
  _prev: ResetPasswordState | undefined,
  formData: FormData,
): Promise<ResetPasswordState> {
  const parsed = ResetPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    const f = parsed.error.flatten().fieldErrors;
    return {
      fieldErrors: {
        password: f.password?.[0],
        confirmPassword: f.confirmPassword?.[0],
      },
    };
  }

  const token = formData.get("token");
  if (typeof token !== "string" || !token) {
    return {
      error: "This reset link is invalid. Request a new one.",
    };
  }

  const tokenHash = createHash("sha256").update(token).digest("hex");

  const [resetToken] = await db
    .select()
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.tokenHash, tokenHash))
    .limit(1);

  if (
    !resetToken ||
    resetToken.usedAt !== null ||
    resetToken.expiresAt < new Date()
  ) {
    return {
      error:
        "This reset link is invalid or has expired. Request a new one.",
    };
  }

  const passwordHash = await hash(parsed.data.password);

  await db
    .insert(authCredentials)
    .values({ userId: resetToken.userId, passwordHash })
    .onConflictDoUpdate({
      target: authCredentials.userId,
      set: { passwordHash },
    });

  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(eq(passwordResetTokens.id, resetToken.id));

  await destroyAllSessionsForUser(resetToken.userId);

  redirect("/login");
}

const ProfileSchema = z.object({
  fullName: z.string().min(2, "Enter your full name."),
  preferredLanguage: z.string().min(2, "Select a preferred language."),
});

/**
 * Persist the user's profile (name + preferred language) to their `users` row
 * through the tenant-scoped connection. Validation-first, RLS-enforced.
 */
export async function updateProfile(
  _prev: ProfileState | undefined,
  formData: FormData,
): Promise<ProfileState> {
  const parsed = ProfileSchema.safeParse({
    fullName: formData.get("fullName"),
    preferredLanguage: formData.get("preferredLanguage"),
  });

  if (!parsed.success) {
    const f = parsed.error.flatten().fieldErrors;
    return {
      fieldErrors: {
        fullName: f.fullName?.[0],
        preferredLanguage: f.preferredLanguage?.[0],
      },
    };
  }

  const session = await verifySession();
  const [updatedUser] = await withClaims(toAuthClaims(session), (tx) =>
    tx
      .update(users)
      .set({
        fullName: parsed.data.fullName,
        languagePref: parsed.data.preferredLanguage,
      })
      .where(eq(users.id, session.id))
      .returning({
        fullName: users.fullName,
        languagePref: users.languagePref,
      }),
  );

  if (!updatedUser) {
    return { error: "Unable to update your profile right now. Try again." };
  }

  revalidatePath("/settings");

  return {
    message: "Profile updated.",
  };
}

const SettingSchema = z.object({
  timezone: z.string().min(2, "Enter a timezone."),
  weeklyGoalMinutes: z.coerce
    .number()
    .int("Enter a whole number.")
    .min(15, "Set at least 15 minutes.")
    .max(600, "Keep goals under 600 minutes."),
});

/**
 * Validates the settings inputs but does not persist them: the `users` schema
 * has no timezone / weekly-goal columns yet, so there is nowhere to write. The
 * form is intentionally read-only until those columns land (tracked as future
 * schema work) — the returned message says so plainly rather than implying a
 * save. When the columns exist, follow the `updateProfile` pattern above.
 */
export async function updateSettings(
  _prev: SettingState | undefined,
  formData: FormData,
): Promise<SettingState> {
  const parsed = SettingSchema.safeParse({
    timezone: formData.get("timezone"),
    weeklyGoalMinutes: formData.get("weeklyGoalMinutes"),
  });

  if (!parsed.success) {
    const f = parsed.error.flatten().fieldErrors;
    return {
      fieldErrors: {
        timezone: f.timezone?.[0],
        weeklyGoalMinutes: f.weeklyGoalMinutes?.[0],
      },
    };
  }

  // Not saved: no timezone / weekly-goal columns exist on `users` yet. Return a
  // message that never implies a successful save.
  return {
    message:
      "These preferences aren’t saved yet — timezone and weekly goal will be enabled in a later update.",
  };
}
