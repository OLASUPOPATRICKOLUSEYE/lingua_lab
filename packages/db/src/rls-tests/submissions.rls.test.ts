/**
 * RLS gate for the `submissions` table (AGENTS.md rule #2, data-model.md).
 *
 * Two users in two different schools. Every assertion runs through the REAL
 * application connection path (`withClaims` → Drizzle → Postgres as the
 * non-privileged `authenticated` role), NOT a raw psql/admin session. RLS that
 * passes a manual SQL check but is bypassed by the app's connection role is a
 * SEVERE security bug — this test exists to prove it is NOT bypassed.
 *
 * This is the pattern file referenced by data-model.md for every other
 * school_id-bearing table's RLS test.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, and } from "drizzle-orm";
import { withClaims, type AuthClaims } from "../client";
import { activities, schools, users, submissions } from "../schema";
import { adminDb } from "./support";

// Two tenants, two users, one submission each. Seeded with unique UUIDs so the
// suite is self-contained and re-runnable without colliding with prior runs.
const schoolA = randomUUID();
const schoolB = randomUUID();
const userA = randomUUID();
const userB = randomUUID();
const submissionA = randomUUID();
const submissionB = randomUUID();
const activityId = randomUUID();

const claimsA: AuthClaims = { sub: userA, school_id: schoolA, role: "student" };
const claimsB: AuthClaims = { sub: userB, school_id: schoolB, role: "student" };

/** Flatten an error and its `.cause` chain (with pg `.code`) into one string. */
function collectErrorText(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  let depth = 0;
  while (current && depth < 10) {
    const e = current as { message?: string; code?: string; cause?: unknown };
    if (e.message) parts.push(e.message);
    if (e.code) parts.push(`code=${e.code}`);
    current = e.cause;
    depth += 1;
  }
  return parts.join(" | ");
}

function newSubmission(id: string, schoolId: string, studentId: string) {
  return {
    id,
    schoolId,
    studentId,
    activityId,
    rawStoragePath: `raw/${schoolId}/${randomUUID()}/${studentId}/${id}.webm`,
  };
}

beforeAll(async () => {
  // Seed via the privileged admin handle (bypasses RLS) so both tenants exist.
  await adminDb
    .insert(schools)
    .values([
      { id: schoolA, name: "School A", slug: `a-${schoolA.slice(0, 8)}` },
      { id: schoolB, name: "School B", slug: `b-${schoolB.slice(0, 8)}` },
    ]);
  await adminDb.insert(users).values([
    { id: userA, schoolId: schoolA, role: "student", fullName: "Alice", email: `alice-${userA.slice(0, 8)}@a.test` },
    { id: userB, schoolId: schoolB, role: "student", fullName: "Bob", email: `bob-${userB.slice(0, 8)}@b.test` },
  ]);
  // submissions.activity_id is a real FK (migration 0006) — seed the activity.
  await adminDb.insert(activities).values({
    id: activityId,
    schoolId: schoolA,
    teacherId: userA,
    title: "RLS fixture passage",
    prompt: "Read the passage.",
    targetLanguage: "English",
    passageText: "A fixture passage for RLS tests.",
    teacherName: "Alice",
    teacherReferenceText: "A fixture passage for RLS tests.",
    submissionModes: ["audio"],
  });
  await adminDb
    .insert(submissions)
    .values([
      newSubmission(submissionA, schoolA, userA),
      newSubmission(submissionB, schoolB, userB),
    ]);
});

afterAll(async () => {
  // Teardown via admin; order respects FKs.
  await adminDb.delete(submissions).where(eq(submissions.activityId, activityId));
  await adminDb.delete(activities).where(eq(activities.id, activityId));
  await adminDb.delete(users).where(eq(users.schoolId, schoolA));
  await adminDb.delete(users).where(eq(users.schoolId, schoolB));
  await adminDb.delete(schools).where(eq(schools.id, schoolA));
  await adminDb.delete(schools).where(eq(schools.id, schoolB));
});

describe("submissions RLS — cross-tenant isolation through Drizzle", () => {
  it("sanity: each user sees their OWN school's submission", async () => {
    const rowsA = await withClaims(claimsA, (tx) => tx.select().from(submissions));
    expect(rowsA).toHaveLength(1);
    expect(rowsA[0]?.id).toBe(submissionA);

    const rowsB = await withClaims(claimsB, (tx) => tx.select().from(submissions));
    expect(rowsB).toHaveLength(1);
    expect(rowsB[0]?.id).toBe(submissionB);
  });

  it("blocks cross-tenant READ: A selecting all sees zero of B's rows", async () => {
    const rows = await withClaims(claimsA, (tx) => tx.select().from(submissions));
    expect(rows.some((r) => r.schoolId === schoolB)).toBe(false);
    expect(rows.some((r) => r.id === submissionB)).toBe(false);
  });

  it("blocks cross-tenant READ by id: A querying B's submission id returns nothing", async () => {
    const rows = await withClaims(claimsA, (tx) =>
      tx.select().from(submissions).where(eq(submissions.id, submissionB)),
    );
    expect(rows).toHaveLength(0);
  });

  it("blocks cross-tenant WRITE: A cannot INSERT a row tagged with school B", async () => {
    // Drizzle wraps the pg error; the RLS rejection (SQLSTATE 42501 — a
    // WITH CHECK violation) surfaces on the error chain, not the top message.
    const error = await withClaims(claimsA, (tx) =>
      tx.insert(submissions).values(newSubmission(randomUUID(), schoolB, userB)),
    ).then(
      () => null,
      (e: unknown) => e,
    );

    expect(error, "INSERT into another school must be rejected").not.toBeNull();
    const chain = collectErrorText(error);
    expect(chain).toMatch(/row-level security|42501/i);

    // And nothing leaked in: B still has exactly its one original row.
    const rowsB = await withClaims(claimsB, (tx) => tx.select().from(submissions));
    expect(rowsB).toHaveLength(1);
  });

  it("blocks cross-tenant UPDATE: A updating B's row affects zero rows", async () => {
    // submissions is append-only (AGENTS.md rule #1) — no code path issues an
    // UPDATE against it. This still asserts the RLS boundary rejects one as
    // defense in depth, the same way the DELETE test below does.
    const updated = await withClaims(claimsA, (tx) =>
      tx
        .update(submissions)
        .set({ rawStoragePath: "raw/hijacked/path.webm" })
        .where(eq(submissions.id, submissionB))
        .returning(),
    );
    expect(updated).toHaveLength(0);

    // Confirm via B's own view that the row is untouched.
    const [bRow] = await withClaims(claimsB, (tx) =>
      tx.select().from(submissions).where(eq(submissions.id, submissionB)),
    );
    expect(bRow?.rawStoragePath).not.toBe("raw/hijacked/path.webm");
  });

  it("blocks cross-tenant DELETE: A deleting B's row affects zero rows", async () => {
    const deleted = await withClaims(claimsA, (tx) =>
      tx.delete(submissions).where(eq(submissions.id, submissionB)).returning(),
    );
    expect(deleted).toHaveLength(0);

    const rowsB = await withClaims(claimsB, (tx) =>
      tx
        .select()
        .from(submissions)
        .where(and(eq(submissions.id, submissionB), eq(submissions.schoolId, schoolB))),
    );
    expect(rowsB).toHaveLength(1);
  });
});
