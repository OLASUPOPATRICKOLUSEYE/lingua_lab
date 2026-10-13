import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { type AuthClaims, withClaims } from "../client";
import { classes, classMemberships, schools, users } from "../schema";
import { adminDb } from "./support";

const schoolA = randomUUID();
const schoolB = randomUUID();
const teacherA = randomUUID();
const teacherB = randomUUID();
const studentA = randomUUID();
const studentB = randomUUID();
const classA = randomUUID();
const classB = randomUUID();

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
    { id: schoolA, name: "Membership School A", slug: `membership-a-${schoolA.slice(0, 8)}` },
    { id: schoolB, name: "Membership School B", slug: `membership-b-${schoolB.slice(0, 8)}` },
  ]);
  await adminDb.insert(users).values([
    { id: teacherA, schoolId: schoolA, role: "teacher", fullName: "Alice Teacher", email: `membership-teacher-a-${teacherA.slice(0, 8)}@a.test` },
    { id: teacherB, schoolId: schoolB, role: "teacher", fullName: "Bob Teacher", email: `membership-teacher-b-${teacherB.slice(0, 8)}@b.test` },
    { id: studentA, schoolId: schoolA, role: "student", fullName: "Alice Student", email: `membership-student-a-${studentA.slice(0, 8)}@a.test` },
    { id: studentB, schoolId: schoolB, role: "student", fullName: "Bob Student", email: `membership-student-b-${studentB.slice(0, 8)}@b.test` },
  ]);
  await adminDb.insert(classes).values([
    { id: classA, schoolId: schoolA, teacherId: teacherA, name: "French 9A", slug: "french-9a" },
    { id: classB, schoolId: schoolB, teacherId: teacherB, name: "French 9B", slug: "french-9b" },
  ]);
  await adminDb.insert(classMemberships).values([
    { classId: classA, schoolId: schoolA, studentId: studentA },
    { classId: classB, schoolId: schoolB, studentId: studentB },
  ]);
});

afterAll(async () => {
  await adminDb.delete(classMemberships).where(eq(classMemberships.classId, classA));
  await adminDb.delete(classMemberships).where(eq(classMemberships.classId, classB));
  await adminDb.delete(classes).where(eq(classes.id, classA));
  await adminDb.delete(classes).where(eq(classes.id, classB));
  await adminDb.delete(users).where(eq(users.id, teacherA));
  await adminDb.delete(users).where(eq(users.id, teacherB));
  await adminDb.delete(users).where(eq(users.id, studentA));
  await adminDb.delete(users).where(eq(users.id, studentB));
  await adminDb.delete(schools).where(eq(schools.id, schoolA));
  await adminDb.delete(schools).where(eq(schools.id, schoolB));
});

describe("class_memberships RLS — cross-tenant isolation through Drizzle", () => {
  it("blocks cross-tenant READ", async () => {
    const rows = await withClaims(claimsA, (tx) =>
      tx
        .select()
        .from(classMemberships)
        .where(eq(classMemberships.classId, classB)),
    );
    expect(rows).toHaveLength(0);
  });

  it("blocks cross-tenant WRITE", async () => {
    const error = await withClaims(claimsA, (tx) =>
      tx.insert(classMemberships).values({
        classId: classB,
        schoolId: schoolB,
        studentId: studentB,
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
        .update(classMemberships)
        .set({ schoolId: schoolA })
        .where(eq(classMemberships.classId, classB))
        .returning(),
    );
    expect(updated).toHaveLength(0);

    const deleted = await withClaims(claimsA, (tx) =>
      tx
        .delete(classMemberships)
        .where(eq(classMemberships.classId, classB))
        .returning(),
    );
    expect(deleted).toHaveLength(0);
  });
});
