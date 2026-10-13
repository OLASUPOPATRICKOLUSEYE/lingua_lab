import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { type AuthClaims, withClaims } from "../client";
import {
  classes,
  liveSessionAttendance,
  liveSessions,
  schools,
  users,
} from "../schema";
import { adminDb } from "./support";

const schoolA = randomUUID();
const schoolB = randomUUID();
const teacherA = randomUUID();
const teacherB = randomUUID();
const studentA = randomUUID();
const studentB = randomUUID();
const classA = randomUUID();
const classB = randomUUID();
const sessionA = randomUUID();
const sessionB = randomUUID();
const attendanceA = randomUUID();
const attendanceB = randomUUID();

const claimsA: AuthClaims = { sub: studentA, school_id: schoolA, role: "student" };

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

const now = Date.now();
const startsAt = new Date(now - 5 * 60 * 1000);
const endsAt = new Date(now + 55 * 60 * 1000);

beforeAll(async () => {
  await adminDb.insert(schools).values([
    { id: schoolA, name: "Att School A", slug: `att-a-${schoolA.slice(0, 8)}` },
    { id: schoolB, name: "Att School B", slug: `att-b-${schoolB.slice(0, 8)}` },
  ]);
  await adminDb.insert(users).values([
    { id: teacherA, schoolId: schoolA, role: "teacher", fullName: "Att Teacher A", email: `att-ta-${teacherA.slice(0, 8)}@a.test` },
    { id: teacherB, schoolId: schoolB, role: "teacher", fullName: "Att Teacher B", email: `att-tb-${teacherB.slice(0, 8)}@b.test` },
    { id: studentA, schoolId: schoolA, role: "student", fullName: "Att Student A", email: `att-sa-${studentA.slice(0, 8)}@a.test` },
    { id: studentB, schoolId: schoolB, role: "student", fullName: "Att Student B", email: `att-sb-${studentB.slice(0, 8)}@b.test` },
  ]);
  await adminDb.insert(classes).values([
    { id: classA, schoolId: schoolA, teacherId: teacherA, name: "Att Class A", slug: "att-class-a" },
    { id: classB, schoolId: schoolB, teacherId: teacherB, name: "Att Class B", slug: "att-class-b" },
  ]);
  await adminDb.insert(liveSessions).values([
    { id: sessionA, schoolId: schoolA, classId: classA, provider: "zoom", joinUrl: "https://zoom.us/j/1", startsAt, endsAt },
    { id: sessionB, schoolId: schoolB, classId: classB, provider: "zoom", joinUrl: "https://zoom.us/j/2", startsAt, endsAt },
  ]);
  await adminDb.insert(liveSessionAttendance).values([
    { id: attendanceA, schoolId: schoolA, liveSessionId: sessionA, studentId: studentA, checkedIn: true },
    { id: attendanceB, schoolId: schoolB, liveSessionId: sessionB, studentId: studentB, checkedIn: true },
  ]);
});

afterAll(async () => {
  await adminDb.delete(liveSessionAttendance).where(eq(liveSessionAttendance.id, attendanceA));
  await adminDb.delete(liveSessionAttendance).where(eq(liveSessionAttendance.id, attendanceB));
  await adminDb.delete(liveSessions).where(eq(liveSessions.id, sessionA));
  await adminDb.delete(liveSessions).where(eq(liveSessions.id, sessionB));
  await adminDb.delete(classes).where(eq(classes.id, classA));
  await adminDb.delete(classes).where(eq(classes.id, classB));
  for (const id of [teacherA, teacherB, studentA, studentB]) {
    await adminDb.delete(users).where(eq(users.id, id));
  }
  await adminDb.delete(schools).where(eq(schools.id, schoolA));
  await adminDb.delete(schools).where(eq(schools.id, schoolB));
});

describe("live_session_attendance RLS — cross-tenant isolation through Drizzle", () => {
  it("blocks cross-tenant READ", async () => {
    const rows = await withClaims(claimsA, (tx) =>
      tx
        .select()
        .from(liveSessionAttendance)
        .where(eq(liveSessionAttendance.id, attendanceB)),
    );
    expect(rows).toHaveLength(0);
  });

  it("allows same-tenant READ", async () => {
    const rows = await withClaims(claimsA, (tx) =>
      tx
        .select()
        .from(liveSessionAttendance)
        .where(eq(liveSessionAttendance.id, attendanceA)),
    );
    expect(rows).toHaveLength(1);
  });

  it("blocks cross-tenant WRITE", async () => {
    const error = await withClaims(claimsA, (tx) =>
      tx.insert(liveSessionAttendance).values({
        id: randomUUID(),
        schoolId: schoolB,
        liveSessionId: sessionB,
        studentId: studentB,
        checkedIn: true,
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
        .update(liveSessionAttendance)
        .set({ checkedIn: false })
        .where(eq(liveSessionAttendance.id, attendanceB))
        .returning(),
    );
    expect(updated).toHaveLength(0);

    const deleted = await withClaims(claimsA, (tx) =>
      tx
        .delete(liveSessionAttendance)
        .where(eq(liveSessionAttendance.id, attendanceB))
        .returning(),
    );
    expect(deleted).toHaveLength(0);
  });
});
