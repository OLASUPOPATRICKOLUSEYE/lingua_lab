import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { type AuthClaims, withClaims } from "../client";
import { activities, schools, users } from "../schema";
import { adminDb } from "./support";

const schoolA = randomUUID();
const schoolB = randomUUID();
const userA = randomUUID();
const userB = randomUUID();
const activityA = randomUUID();
const activityB = randomUUID();

const claimsA: AuthClaims = { sub: userA, school_id: schoolA, role: "teacher" };

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
    { id: schoolA, name: "School A", slug: `activities-a-${schoolA.slice(0, 8)}` },
    { id: schoolB, name: "School B", slug: `activities-b-${schoolB.slice(0, 8)}` },
  ]);
  await adminDb.insert(users).values([
    { id: userA, schoolId: schoolA, role: "teacher", fullName: "Alice Teacher", email: `activities-alice-${userA.slice(0, 8)}@a.test` },
    { id: userB, schoolId: schoolB, role: "teacher", fullName: "Bob Teacher", email: `activities-bob-${userB.slice(0, 8)}@b.test` },
  ]);
  await adminDb.insert(activities).values([
    {
      id: activityA,
      schoolId: schoolA,
      teacherId: userA,
      title: "French station",
      prompt: "Read the full passage in French.",
      targetLanguage: "French",
      passageText: "Bonjour tout le monde.",
      teacherName: "Alice Teacher",
      teacherReferenceText: "Bonjour tout le monde.",
      coachNote: "Keep it smooth.",
      submissionModes: ["audio", "video"],
      timeLimitSeconds: 90,
    },
    {
      id: activityB,
      schoolId: schoolB,
      teacherId: userB,
      title: "English rain",
      prompt: "Read the full passage in English.",
      targetLanguage: "English",
      passageText: "The rain started softly.",
      teacherName: "Bob Teacher",
      teacherReferenceText: "The rain started softly.",
      coachNote: "Stay clear.",
      submissionModes: ["audio"],
      timeLimitSeconds: 60,
    },
  ]);
});

afterAll(async () => {
  await adminDb.delete(activities).where(eq(activities.id, activityA));
  await adminDb.delete(activities).where(eq(activities.id, activityB));
  await adminDb.delete(users).where(eq(users.id, userA));
  await adminDb.delete(users).where(eq(users.id, userB));
  await adminDb.delete(schools).where(eq(schools.id, schoolA));
  await adminDb.delete(schools).where(eq(schools.id, schoolB));
});

describe("activities RLS — cross-tenant isolation through Drizzle", () => {
  it("blocks cross-tenant READ", async () => {
    const rows = await withClaims(claimsA, (tx) =>
      tx.select().from(activities).where(eq(activities.id, activityB)),
    );
    expect(rows).toHaveLength(0);
  });

  it("blocks cross-tenant WRITE", async () => {
    const error = await withClaims(claimsA, (tx) =>
      tx.insert(activities).values({
        id: randomUUID(),
        schoolId: schoolB,
        teacherId: userB,
        title: "Wrong school",
        prompt: "Prompt",
        targetLanguage: "French",
        passageText: "Texte",
        teacherName: "Alice Teacher",
        teacherReferenceText: "Texte",
        coachNote: "Note",
        submissionModes: ["audio"],
        timeLimitSeconds: 30,
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
        .update(activities)
        .set({ title: "Hacked" })
        .where(eq(activities.id, activityB))
        .returning(),
    );
    expect(updated).toHaveLength(0);

    const deleted = await withClaims(claimsA, (tx) =>
      tx.delete(activities).where(eq(activities.id, activityB)).returning(),
    );
    expect(deleted).toHaveLength(0);
  });
});
