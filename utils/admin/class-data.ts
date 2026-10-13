import "server-only";

import { classMemberships, classes, users, withClaims } from "@lingua/db";
import { and, asc, eq, notInArray, sql } from "drizzle-orm";
import type { SessionUser } from "@/utils/auth/dal";
import { toAuthClaims } from "@/utils/auth/dal";

export interface AdminClassSummary {
  id: string;
  name: string;
  slug: string;
  teacherId: string;
  teacherName: string;
  studentCount: number;
}

export interface AdminClassDetail extends AdminClassSummary {
  roster: { id: string; fullName: string; email: string }[];
}

export interface AssignableUser {
  id: string;
  fullName: string;
  email: string;
}

export async function getAdminClasses(
  session: SessionUser,
): Promise<AdminClassSummary[]> {
  return withClaims(toAuthClaims(session), async (tx) => {
    const rows = await tx
      .select({
        id: classes.id,
        name: classes.name,
        slug: classes.slug,
        teacherId: classes.teacherId,
        teacherName: users.fullName,
        studentCount: sql<number>`count(distinct ${classMemberships.studentId})`.mapWith(
          Number,
        ),
      })
      .from(classes)
      .innerJoin(users, eq(users.id, classes.teacherId))
      .leftJoin(classMemberships, eq(classMemberships.classId, classes.id))
      .groupBy(classes.id, users.fullName)
      .orderBy(asc(classes.name));

    return rows;
  });
}

export async function getAdminClassDetail(
  session: SessionUser,
  classId: string,
): Promise<AdminClassDetail | null> {
  return withClaims(toAuthClaims(session), async (tx) => {
    const [classRow] = await tx
      .select({
        id: classes.id,
        name: classes.name,
        slug: classes.slug,
        teacherId: classes.teacherId,
        teacherName: users.fullName,
      })
      .from(classes)
      .innerJoin(users, eq(users.id, classes.teacherId))
      .where(eq(classes.id, classId))
      .limit(1);

    if (!classRow) {
      return null;
    }

    const roster = await tx
      .select({
        id: users.id,
        fullName: users.fullName,
        email: users.email,
      })
      .from(classMemberships)
      .innerJoin(users, eq(users.id, classMemberships.studentId))
      .where(eq(classMemberships.classId, classId))
      .orderBy(asc(users.fullName));

    return {
      ...classRow,
      studentCount: roster.length,
      roster,
    };
  });
}

export async function getAssignableTeachers(
  session: SessionUser,
): Promise<AssignableUser[]> {
  return withClaims(toAuthClaims(session), (tx) =>
    tx
      .select({ id: users.id, fullName: users.fullName, email: users.email })
      .from(users)
      .where(eq(users.role, "teacher"))
      .orderBy(asc(users.fullName)),
  );
}

export async function getAllStudents(
  session: SessionUser,
): Promise<AssignableUser[]> {
  return withClaims(toAuthClaims(session), (tx) =>
    tx
      .select({ id: users.id, fullName: users.fullName, email: users.email })
      .from(users)
      .where(eq(users.role, "student"))
      .orderBy(asc(users.fullName)),
  );
}

export async function getDeptHeads(
  session: SessionUser,
): Promise<AssignableUser[]> {
  return withClaims(toAuthClaims(session), (tx) =>
    tx
      .select({ id: users.id, fullName: users.fullName, email: users.email })
      .from(users)
      .where(eq(users.role, "dept_head"))
      .orderBy(asc(users.fullName)),
  );
}

/** Students in the school not already on this class's roster. */
export async function getAssignableStudents(
  session: SessionUser,
  classId: string,
): Promise<AssignableUser[]> {
  return withClaims(toAuthClaims(session), async (tx) => {
    const rosterRows = await tx
      .select({ studentId: classMemberships.studentId })
      .from(classMemberships)
      .where(eq(classMemberships.classId, classId));
    const rosterIds = rosterRows.map((row) => row.studentId);

    return tx
      .select({ id: users.id, fullName: users.fullName, email: users.email })
      .from(users)
      .where(
        rosterIds.length > 0
          ? and(eq(users.role, "student"), notInArray(users.id, rosterIds))
          : eq(users.role, "student"),
      )
      .orderBy(asc(users.fullName));
  });
}
