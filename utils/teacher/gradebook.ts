import "server-only";

import {
  activityAssignments,
  classMemberships,
  classes,
  gradingResults,
  submissionProcessingStates,
  submissions,
  users,
  withClaims,
} from "@lingua/db";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { SessionUser } from "@/utils/auth/dal";
import { toAuthClaims } from "@/utils/auth/dal";

export interface GradebookRow {
  studentId: string;
  fullName: string;
  email: string;
  takeCount: number;
  gradedCount: number;
  awaitingReviewCount: number;
  latestFluencyScore: number | null;
  latestPronunciationScore: number | null;
  latestCefrEstimate: string | null;
  latestSubmittedAt: Date | null;
}

export interface Gradebook {
  classId: string;
  className: string;
  classSlug: string;
  rows: GradebookRow[];
}

/**
 * One row per student on a class roster, with their latest scores.
 *
 * Built FROM the roster outward, so a student who has never recorded still
 * appears with zeros — spotting who has NOT submitted is the main thing a
 * teacher wants here, and a list built from submissions cannot show it.
 *
 * "Work for this class" means submissions whose frozen `assignment_id` belongs
 * to this class, not the student's current memberships — moving a student
 * between classes must not retroactively move their past work.
 */
export async function getClassGradebook(
  session: SessionUser,
  classSlug: string,
): Promise<Gradebook | null> {
  return withClaims(toAuthClaims(session), async (tx) => {
    const [classRow] = await tx
      .select({ id: classes.id, name: classes.name, slug: classes.slug })
      .from(classes)
      .where(
        and(
          eq(classes.slug, classSlug),
          ...(session.role === "teacher"
            ? [eq(classes.teacherId, session.id)]
            : []),
        ),
      )
      .limit(1);

    if (!classRow) {
      return null;
    }

    // Resolved as a plain list rather than an inline subquery: it keeps the
    // aggregate query readable, and an empty class is then an explicit case
    // instead of SQL that silently matches nothing.
    const assignmentRows = await tx
      .select({ id: activityAssignments.id })
      .from(activityAssignments)
      .where(eq(activityAssignments.classId, classRow.id));
    const assignmentIds = assignmentRows.map((row) => row.id);

    const submissionJoin = assignmentIds.length
      ? and(
          eq(submissions.studentId, users.id),
          inArray(submissions.assignmentId, assignmentIds),
        )
      : // No assignments yet — every student legitimately has zero takes.
        sql`false`;

    const counts = await tx
      .select({
        studentId: users.id,
        fullName: users.fullName,
        email: users.email,
        takeCount: sql<number>`count(distinct ${submissions.id})`.mapWith(Number),
        gradedCount: sql<number>`count(distinct case when ${submissionProcessingStates.status} = 'graded' then ${submissions.id} end)`.mapWith(
          Number,
        ),
        awaitingReviewCount: sql<number>`count(distinct case when ${submissionProcessingStates.status} = 'pending_review' then ${submissions.id} end)`.mapWith(
          Number,
        ),
        // mapWith applies the column's driver parser. Without it a raw sql
        // fragment returns the RAW STRING from pg and `sql<Date|null>` is just
        // a compile-time lie — which then threw "Invalid time value" the first
        // time anything formatted it.
        latestSubmittedAt: sql<Date | null>`max(${submissions.submittedAt})`.mapWith(
          submissions.submittedAt,
        ),
      })
      .from(classMemberships)
      .innerJoin(users, eq(users.id, classMemberships.studentId))
      // Left joins so a student with no submissions still produces a row.
      .leftJoin(submissions, submissionJoin)
      .leftJoin(
        submissionProcessingStates,
        eq(submissionProcessingStates.submissionId, submissions.id),
      )
      .where(eq(classMemberships.classId, classRow.id))
      .groupBy(users.id, users.fullName, users.email)
      .orderBy(asc(users.fullName));

    // Latest grade per student, newest first, reduced in JS. A re-grade appends
    // a grading_results row rather than mutating (submissions are append-only),
    // so "latest" means most recently graded, not "the one row".
    const latestByStudent = new Map<
      string,
      { fluency: number | null; pronunciation: number | null; cefr: string | null }
    >();

    if (assignmentIds.length) {
      const gradeRows = await tx
        .select({
          studentId: submissions.studentId,
          fluencyScore: gradingResults.fluencyScore,
          pronunciationScore: gradingResults.pronunciationScore,
          cefrEstimate: gradingResults.cefrEstimate,
        })
        .from(gradingResults)
        .innerJoin(submissions, eq(submissions.id, gradingResults.submissionId))
        .where(inArray(submissions.assignmentId, assignmentIds))
        .orderBy(desc(gradingResults.gradedAt));

      for (const row of gradeRows) {
        if (!latestByStudent.has(row.studentId)) {
          latestByStudent.set(row.studentId, {
            fluency: row.fluencyScore,
            pronunciation: row.pronunciationScore,
            cefr: row.cefrEstimate,
          });
        }
      }
    }

    return {
      classId: classRow.id,
      className: classRow.name,
      classSlug: classRow.slug,
      rows: counts.map((row) => {
        const latest = latestByStudent.get(row.studentId);
        return {
          ...row,
          latestFluencyScore: latest?.fluency ?? null,
          latestPronunciationScore: latest?.pronunciation ?? null,
          latestCefrEstimate: latest?.cefr ?? null,
        };
      }),
    };
  });
}
