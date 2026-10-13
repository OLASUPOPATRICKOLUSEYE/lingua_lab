/**
 * Class-context STABILITY (was a repro for the drift bug).
 *
 * A `submissions` row now persists `assignment_id` — the exact assignment it
 * was made against — captured once at upload. Teacher review joins class
 * through that frozen assignment (submissions.assignment_id ->
 * activity_assignments -> classes), NOT through the student's mutable
 * memberships. So class attribution is unambiguous and does not change when
 * memberships change later.
 *
 * This file previously reproduced the bug (a student in two classes with the
 * same activity got mis-attributed, and the attribution mutated retroactively).
 * It now asserts the fixed behavior. Runs through the real Drizzle connection
 * so it exercises the actual column + join, not a mock. Named *.rls.test.ts so
 * `pnpm test:rls` picks it up.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { type AuthClaims, withClaims } from "../client";
import {
  activities,
  activityAssignments,
  classMemberships,
  classes,
  schools,
  submissions,
  users,
} from "../schema";
import { adminDb } from "./support";

const school = randomUUID();
const teacher = randomUUID();
const student = randomUUID();
// Two classes the SAME student belongs to. Names chosen so alphabetical order
// (what the OLD min() picked) would flip attribution: "Aardvark" < "Zephyr".
const classAar = randomUUID();
const classZep = randomUUID();
const activity = randomUUID();
const assignmentAar = randomUUID();
const assignmentZep = randomUUID();
const submissionId = randomUUID();

const teacherClaims: AuthClaims = {
  sub: teacher,
  school_id: school,
  role: "teacher",
};

/**
 * The class-resolution join, copied from the fixed production read path
 * (utils/teacher-review/data.ts): class comes from the assignment frozen on
 * the submission, so it is one row and independent of memberships.
 */
async function resolvedClassName(): Promise<string | null> {
  return withClaims(teacherClaims, async (tx) => {
    const rows = await tx
      .select({ className: classes.name })
      .from(submissions)
      .leftJoin(
        activityAssignments,
        eq(activityAssignments.id, submissions.assignmentId),
      )
      .leftJoin(classes, eq(classes.id, activityAssignments.classId))
      .where(eq(submissions.id, submissionId));

    // The whole point: exactly one class, deterministically.
    expect(rows).toHaveLength(1);
    return rows[0]?.className ?? null;
  });
}

beforeAll(async () => {
  await adminDb.insert(schools).values({
    id: school,
    name: "Drift School",
    slug: `drift-${school.slice(0, 8)}`,
  });
  await adminDb.insert(users).values([
    {
      id: teacher,
      schoolId: school,
      role: "teacher",
      fullName: "Drift Teacher",
      email: `drift-teacher-${teacher.slice(0, 8)}@d.test`,
    },
    {
      id: student,
      schoolId: school,
      role: "student",
      fullName: "Drift Student",
      email: `drift-student-${student.slice(0, 8)}@d.test`,
    },
  ]);
  await adminDb.insert(classes).values([
    {
      id: classAar,
      schoolId: school,
      teacherId: teacher,
      name: "Aardvark 9A",
      slug: `aardvark-${classAar.slice(0, 8)}`,
    },
    {
      id: classZep,
      schoolId: school,
      teacherId: teacher,
      name: "Zephyr 9B",
      slug: `zephyr-${classZep.slice(0, 8)}`,
    },
  ]);
  await adminDb.insert(activities).values({
    id: activity,
    schoolId: school,
    teacherId: teacher,
    title: "Shared passage",
    prompt: "Read the passage.",
    targetLanguage: "English",
    passageText: "The rain started softly.",
    teacherName: "Drift Teacher",
    teacherReferenceText: "The rain started softly.",
    coachNote: "Stay clear.",
    submissionModes: ["audio"],
    timeLimitSeconds: 60,
  });
  // Same activity assigned to BOTH of the student's classes.
  await adminDb.insert(activityAssignments).values([
    {
      id: assignmentAar,
      schoolId: school,
      activityId: activity,
      classId: classAar,
      assignedBy: teacher,
      status: "assigned",
    },
    {
      id: assignmentZep,
      schoolId: school,
      activityId: activity,
      classId: classZep,
      assignedBy: teacher,
      status: "assigned",
    },
  ]);
  // Student initially belongs only to the Zephyr class and submits there — so
  // the submission FREEZES assignment_id = the Zephyr assignment.
  await adminDb.insert(classMemberships).values({
    classId: classZep,
    schoolId: school,
    studentId: student,
  });
  await adminDb.insert(submissions).values({
    id: submissionId,
    schoolId: school,
    studentId: student,
    activityId: activity,
    assignmentId: assignmentZep,
    rawStoragePath: `${school}/${activity}/${student}/${submissionId}.webm`,
  });
});

afterAll(async () => {
  await adminDb.delete(submissions).where(eq(submissions.id, submissionId));
  await adminDb
    .delete(classMemberships)
    .where(eq(classMemberships.studentId, student));
  await adminDb
    .delete(activityAssignments)
    .where(eq(activityAssignments.activityId, activity));
  await adminDb.delete(activities).where(eq(activities.id, activity));
  await adminDb.delete(classes).where(eq(classes.id, classAar));
  await adminDb.delete(classes).where(eq(classes.id, classZep));
  await adminDb.delete(users).where(eq(users.id, teacher));
  await adminDb.delete(users).where(eq(users.id, student));
  await adminDb.delete(schools).where(eq(schools.id, school));
});

describe("submission class-context is frozen at creation (drift fixed)", () => {
  it("attributes the submission to the class it was actually made for (Zephyr 9B)", async () => {
    expect(await resolvedClassName()).toBe("Zephyr 9B");
  });

  it("stays Zephyr 9B after the student joins a second class with the same activity", async () => {
    // Enroll the student into Aardvark 9A AFTER they submitted. Under the old
    // membership-inference join this flipped attribution to "Aardvark 9A" and
    // made it ambiguous; with the frozen assignment_id it must not move.
    await adminDb.insert(classMemberships).values({
      classId: classAar,
      schoolId: school,
      studentId: student,
    });

    expect(await resolvedClassName()).toBe("Zephyr 9B");
  });

  it("stays Zephyr 9B even after the student leaves the original class", async () => {
    // Remove the Zephyr membership entirely. Membership inference would now
    // null the class (or show Aardvark); the frozen assignment keeps history
    // intact.
    await adminDb
      .delete(classMemberships)
      .where(eq(classMemberships.classId, classZep));

    expect(await resolvedClassName()).toBe("Zephyr 9B");
  });
});
