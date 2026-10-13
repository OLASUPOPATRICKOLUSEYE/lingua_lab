import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { type AuthClaims, withClaims } from "../client";
import {
  activities,
  activityAssignments,
  classMemberships,
  classes,
  gradingResults,
  schools,
  submissionProcessingStates,
  submissions,
  users,
} from "../schema";
import { adminDb } from "./support";

/**
 * A teacher must be able to review work from the classes they TEACH, not only
 * activities they authored.
 *
 * The original policy allowed the authorship branch alone, so a mission created
 * by an admin and assigned to a teacher's class was invisible to that teacher
 * at the database level — their review queue returned zero rows and no
 * application-layer change could recover them. These tests pin the widened rule
 * and, just as importantly, pin its limits.
 */
const schoolA = randomUUID();
const schoolB = randomUUID();
const admin = randomUUID();
const classTeacher = randomUUID();
const otherTeacher = randomUUID();
const foreignTeacher = randomUUID();
const student = randomUUID();
const classA = randomUUID();
const activityA = randomUUID();
const assignmentA = randomUUID();
const submissionA = randomUUID();
const gradeA = randomUUID();

const asClassTeacher: AuthClaims = { sub: classTeacher, school_id: schoolA, role: "teacher" };
const asOtherTeacher: AuthClaims = { sub: otherTeacher, school_id: schoolA, role: "teacher" };
const asForeignTeacher: AuthClaims = { sub: foreignTeacher, school_id: schoolB, role: "teacher" };

beforeAll(async () => {
  await adminDb.insert(schools).values([
    { id: schoolA, name: "Vis A", slug: `vis-a-${schoolA.slice(0, 8)}` },
    { id: schoolB, name: "Vis B", slug: `vis-b-${schoolB.slice(0, 8)}` },
  ]);
  await adminDb.insert(users).values([
    { id: admin, schoolId: schoolA, role: "system_admin", fullName: "Vis Admin", email: `vis-admin-${admin.slice(0, 8)}@a.test` },
    { id: classTeacher, schoolId: schoolA, role: "teacher", fullName: "Class Teacher", email: `vis-ct-${classTeacher.slice(0, 8)}@a.test` },
    { id: otherTeacher, schoolId: schoolA, role: "teacher", fullName: "Other Teacher", email: `vis-ot-${otherTeacher.slice(0, 8)}@a.test` },
    { id: foreignTeacher, schoolId: schoolB, role: "teacher", fullName: "Foreign Teacher", email: `vis-ft-${foreignTeacher.slice(0, 8)}@b.test` },
    { id: student, schoolId: schoolA, role: "student", fullName: "Vis Student", email: `vis-st-${student.slice(0, 8)}@a.test` },
  ]);
  // Authored by the ADMIN — the case that used to be invisible.
  await adminDb.insert(activities).values({
    id: activityA, schoolId: schoolA, teacherId: admin, title: "Admin mission",
    prompt: "Read it", targetLanguage: "English", passageText: "Hello there.",
    teacherName: "Vis Admin", teacherReferenceText: "Hello there.",
    submissionModes: ["audio"], timeLimitSeconds: 60,
  });
  await adminDb.insert(classes).values({
    id: classA, schoolId: schoolA, teacherId: classTeacher, name: "Vis Class", slug: `vis-class-${classA.slice(0, 8)}`,
  });
  await adminDb.insert(classMemberships).values({ classId: classA, schoolId: schoolA, studentId: student });
  await adminDb.insert(activityAssignments).values({
    id: assignmentA, schoolId: schoolA, activityId: activityA, classId: classA, assignedBy: admin, status: "assigned",
  });
  await adminDb.insert(submissions).values({
    id: submissionA, schoolId: schoolA, studentId: student, activityId: activityA,
    assignmentId: assignmentA, rawStoragePath: `raw/${schoolA}/${activityA}/${student}/${submissionA}.webm`,
    mediaType: "audio",
  });
  await adminDb.insert(submissionProcessingStates).values({
    submissionId: submissionA, schoolId: schoolA, status: "graded",
  });
  await adminDb.insert(gradingResults).values({
    id: gradeA, schoolId: schoolA, submissionId: submissionA, fluencyScore: 80,
    pronunciationScore: 75, cefrEstimate: "B1", modelVersion: "test-v1",
  });
});

afterAll(async () => {
  await adminDb.delete(gradingResults).where(eq(gradingResults.id, gradeA));
  await adminDb.delete(submissionProcessingStates).where(eq(submissionProcessingStates.submissionId, submissionA));
  await adminDb.delete(submissions).where(eq(submissions.id, submissionA));
  await adminDb.delete(activityAssignments).where(eq(activityAssignments.id, assignmentA));
  await adminDb.delete(classMemberships).where(eq(classMemberships.classId, classA));
  await adminDb.delete(classes).where(eq(classes.id, classA));
  await adminDb.delete(activities).where(eq(activities.id, activityA));
  for (const id of [admin, classTeacher, otherTeacher, foreignTeacher, student]) {
    await adminDb.delete(users).where(eq(users.id, id));
  }
  await adminDb.delete(schools).where(eq(schools.id, schoolA));
  await adminDb.delete(schools).where(eq(schools.id, schoolB));
});

describe("teacher visibility of admin-authored work assigned to their class", () => {
  it("the class's teacher CAN read the submission", async () => {
    const rows = await withClaims(asClassTeacher, (tx) =>
      tx.select().from(submissions).where(eq(submissions.id, submissionA)),
    );
    expect(rows).toHaveLength(1);
  });

  it("the class's teacher CAN read its processing state and grade", async () => {
    const states = await withClaims(asClassTeacher, (tx) =>
      tx.select().from(submissionProcessingStates).where(eq(submissionProcessingStates.submissionId, submissionA)),
    );
    expect(states).toHaveLength(1);

    const grades = await withClaims(asClassTeacher, (tx) =>
      tx.select().from(gradingResults).where(eq(gradingResults.submissionId, submissionA)),
    );
    expect(grades).toHaveLength(1);
  });

  it("a teacher who neither authored it nor teaches the class CANNOT read it", async () => {
    const rows = await withClaims(asOtherTeacher, (tx) =>
      tx.select().from(submissions).where(eq(submissions.id, submissionA)),
    );
    expect(rows).toHaveLength(0);

    const grades = await withClaims(asOtherTeacher, (tx) =>
      tx.select().from(gradingResults).where(eq(gradingResults.submissionId, submissionA)),
    );
    expect(grades).toHaveLength(0);
  });

  it("a teacher in ANOTHER school CANNOT read it", async () => {
    const rows = await withClaims(asForeignTeacher, (tx) =>
      tx.select().from(submissions).where(eq(submissions.id, submissionA)),
    );
    expect(rows).toHaveLength(0);
  });
});
