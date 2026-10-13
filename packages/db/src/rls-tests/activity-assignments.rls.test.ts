import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { type AuthClaims, withClaims } from "../client";
import {
  activities,
  activityAssignments,
  classes,
  schools,
  users,
} from "../schema";
import { adminDb } from "./support";

const schoolA = randomUUID();
const schoolB = randomUUID();
const teacherA = randomUUID();
const teacherB = randomUUID();
const classA = randomUUID();
const classB = randomUUID();
const activityA = randomUUID();
const activityB = randomUUID();
const assignmentA = randomUUID();
const assignmentB = randomUUID();

const claimsA: AuthClaims = { sub: teacherA, school_id: schoolA, role: "teacher" };

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
    { id: schoolA, name: "Assignment School A", slug: `assignment-a-${schoolA.slice(0, 8)}` },
    { id: schoolB, name: "Assignment School B", slug: `assignment-b-${schoolB.slice(0, 8)}` },
  ]);
  await adminDb.insert(users).values([
    { id: teacherA, schoolId: schoolA, role: "teacher", fullName: "Alice Teacher", email: `assignment-alice-${teacherA.slice(0, 8)}@a.test` },
    { id: teacherB, schoolId: schoolB, role: "teacher", fullName: "Bob Teacher", email: `assignment-bob-${teacherB.slice(0, 8)}@b.test` },
  ]);
  await adminDb.insert(classes).values([
    { id: classA, schoolId: schoolA, teacherId: teacherA, name: "French 9A", slug: "french-9a" },
    { id: classB, schoolId: schoolB, teacherId: teacherB, name: "French 9B", slug: "french-9b" },
  ]);
  await adminDb.insert(activities).values([
    {
      id: activityA,
      schoolId: schoolA,
      teacherId: teacherA,
      title: "French station",
      prompt: "Read the passage in French.",
      targetLanguage: "French",
      passageText: "Bonjour tout le monde.",
      teacherName: "Alice Teacher",
      teacherReferenceText: "Bonjour tout le monde.",
      coachNote: "Stay smooth.",
      submissionModes: ["audio"],
      timeLimitSeconds: 90,
    },
    {
      id: activityB,
      schoolId: schoolB,
      teacherId: teacherB,
      title: "English rain",
      prompt: "Read the passage in English.",
      targetLanguage: "English",
      passageText: "The rain started softly.",
      teacherName: "Bob Teacher",
      teacherReferenceText: "The rain started softly.",
      coachNote: "Stay clear.",
      submissionModes: ["audio"],
      timeLimitSeconds: 60,
    },
  ]);
  await adminDb.insert(activityAssignments).values([
    {
      id: assignmentA,
      schoolId: schoolA,
      activityId: activityA,
      classId: classA,
      assignedBy: teacherA,
      status: "assigned",
    },
    {
      id: assignmentB,
      schoolId: schoolB,
      activityId: activityB,
      classId: classB,
      assignedBy: teacherB,
      status: "assigned",
    },
  ]);
});

afterAll(async () => {
  await adminDb.delete(activityAssignments).where(eq(activityAssignments.id, assignmentA));
  await adminDb.delete(activityAssignments).where(eq(activityAssignments.id, assignmentB));
  await adminDb.delete(activities).where(eq(activities.id, activityA));
  await adminDb.delete(activities).where(eq(activities.id, activityB));
  await adminDb.delete(classes).where(eq(classes.id, classA));
  await adminDb.delete(classes).where(eq(classes.id, classB));
  await adminDb.delete(users).where(eq(users.id, teacherA));
  await adminDb.delete(users).where(eq(users.id, teacherB));
  await adminDb.delete(schools).where(eq(schools.id, schoolA));
  await adminDb.delete(schools).where(eq(schools.id, schoolB));
});

describe("activity_assignments RLS — cross-tenant isolation through Drizzle", () => {
  it("blocks cross-tenant READ", async () => {
    const rows = await withClaims(claimsA, (tx) =>
      tx
        .select()
        .from(activityAssignments)
        .where(eq(activityAssignments.id, assignmentB)),
    );
    expect(rows).toHaveLength(0);
  });

  it("blocks cross-tenant WRITE", async () => {
    const error = await withClaims(claimsA, (tx) =>
      tx.insert(activityAssignments).values({
        id: randomUUID(),
        schoolId: schoolB,
        activityId: activityB,
        classId: classB,
        assignedBy: teacherB,
        status: "assigned",
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
        .update(activityAssignments)
        .set({ status: "archived", archivedAt: new Date() })
        .where(eq(activityAssignments.id, assignmentB))
        .returning(),
    );
    expect(updated).toHaveLength(0);

    const deleted = await withClaims(claimsA, (tx) =>
      tx
        .delete(activityAssignments)
        .where(eq(activityAssignments.id, assignmentB))
        .returning(),
    );
    expect(deleted).toHaveLength(0);
  });
});
