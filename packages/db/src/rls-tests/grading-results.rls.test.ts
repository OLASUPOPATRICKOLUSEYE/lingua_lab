import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { type AuthClaims, withClaims } from "../client";
import { activities, gradingResults, schools, submissions, users } from "../schema";
import { adminDb } from "./support";

const schoolA = randomUUID();
const schoolB = randomUUID();
const userA = randomUUID();
const userB = randomUUID();
const submissionA = randomUUID();
const submissionB = randomUUID();
const activityId = randomUUID();
const resultA = randomUUID();
const resultB = randomUUID();

const claimsA: AuthClaims = { sub: userA, school_id: schoolA, role: "student" };
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

beforeAll(async () => {
  await adminDb.insert(schools).values([
    { id: schoolA, name: "School A", slug: `grades-a-${schoolA.slice(0, 8)}` },
    { id: schoolB, name: "School B", slug: `grades-b-${schoolB.slice(0, 8)}` },
  ]);
  await adminDb.insert(users).values([
    { id: userA, schoolId: schoolA, role: "student", fullName: "Alice", email: `grades-alice-${userA.slice(0, 8)}@a.test` },
    { id: userB, schoolId: schoolB, role: "student", fullName: "Bob", email: `grades-bob-${userB.slice(0, 8)}@b.test` },
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
  await adminDb.insert(submissions).values([
    {
      id: submissionA,
      schoolId: schoolA,
      studentId: userA,
      activityId,
      rawStoragePath: `raw/${schoolA}/${activityId}/${userA}/${submissionA}.webm`,
    },
    {
      id: submissionB,
      schoolId: schoolB,
      studentId: userB,
      activityId,
      rawStoragePath: `raw/${schoolB}/${activityId}/${userB}/${submissionB}.webm`,
    },
  ]);
  await adminDb.insert(gradingResults).values([
    { id: resultA, schoolId: schoolA, submissionId: submissionA, modelVersion: "model-a-1", fluencyScore: 80 },
    { id: resultB, schoolId: schoolB, submissionId: submissionB, modelVersion: "model-b-1", fluencyScore: 81 },
  ]);
});

afterAll(async () => {
  await adminDb.delete(gradingResults).where(eq(gradingResults.id, resultA));
  await adminDb.delete(gradingResults).where(eq(gradingResults.id, resultB));
  await adminDb.delete(submissions).where(eq(submissions.id, submissionA));
  await adminDb.delete(submissions).where(eq(submissions.id, submissionB));
  await adminDb.delete(activities).where(eq(activities.id, activityId));
  await adminDb.delete(users).where(eq(users.id, userA));
  await adminDb.delete(users).where(eq(users.id, userB));
  await adminDb.delete(schools).where(eq(schools.id, schoolA));
  await adminDb.delete(schools).where(eq(schools.id, schoolB));
});

describe("grading_results RLS — cross-tenant isolation through Drizzle", () => {
  it("blocks cross-tenant READ by submission id", async () => {
    const rows = await withClaims(claimsA, (tx) =>
      tx
        .select()
        .from(gradingResults)
        .where(eq(gradingResults.submissionId, submissionB)),
    );
    expect(rows).toHaveLength(0);
  });

  it("blocks cross-tenant WRITE", async () => {
    const error = await withClaims(claimsA, (tx) =>
      tx.insert(gradingResults).values({
        id: randomUUID(),
        schoolId: schoolB,
        submissionId: submissionB,
        modelVersion: "model-b-2",
      }),
    ).then(
      () => null,
      (e: unknown) => e,
    );

    expect(error).not.toBeNull();
    expect(collectErrorText(error)).toMatch(/row-level security|42501/i);
  });

  it("blocks cross-tenant UPDATE and DELETE", async () => {
    const updated = await withClaims(claimsA, (tx) =>
      tx
        .update(gradingResults)
        .set({ fluencyScore: 99 })
        .where(eq(gradingResults.id, resultB))
        .returning(),
    );
    expect(updated).toHaveLength(0);

    const deleted = await withClaims(claimsA, (tx) =>
      tx.delete(gradingResults).where(eq(gradingResults.id, resultB)).returning(),
    );
    expect(deleted).toHaveLength(0);
  });
});
