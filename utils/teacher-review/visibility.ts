import "server-only";

import { activities, submissions } from "@lingua/db";
import { eq, or, sql, type SQL } from "drizzle-orm";

/**
 * Which submissions a teacher may see and grade.
 *
 * Authoring an activity is NOT the same as teaching the class. An admin — or
 * another teacher — can create a mission and assign it to someone else's class.
 * Scoping visibility to `activities.teacher_id` alone meant that in exactly that
 * (normal) case the students' work was invisible to the teacher who actually
 * teaches them, and visible only to admins. So a teacher qualifies when EITHER:
 *
 *   1. they authored the activity, or
 *   2. they teach the class the submission's assignment targets.
 *
 * Branch 2 goes through `submissions.assignment_id` — the assignment frozen on
 * the row at upload — not the student's current memberships, so moving a
 * student between classes never retroactively changes who could grade past
 * work. Submissions with no assignment have no class context and match only
 * via branch 1.
 *
 * ONLY VALID in a query whose FROM/JOIN set includes BOTH `submissions` and
 * `activities` — it references `submissions.assignment_id`, so dropping it into
 * a query over `activities` alone produces a Postgres "missing FROM-clause
 * entry" error at runtime, not a type error. For activity-scoped queries (which
 * passages may I edit?) use plain `eq(activities.teacherId, id)` instead: that
 * is a question about authorship, and it is not the same question.
 *
 * The class side is an EXISTS subquery with its own aliases so call sites need
 * no extra joins and cannot collide with an outer `classes` join. RLS still
 * confines every branch to the caller's school; this widens WHICH teacher in
 * that school may review, never which school.
 */
export function teacherSubmissionVisibility(teacherId: string): SQL | undefined {
  return or(
    eq(activities.teacherId, teacherId),
    sql`exists (
      select 1
      from activity_assignments vis_aa
      join classes vis_c on vis_c.id = vis_aa.class_id
      where vis_aa.id = ${submissions.assignmentId}
        and vis_c.teacher_id = ${teacherId}
    )`,
  );
}
