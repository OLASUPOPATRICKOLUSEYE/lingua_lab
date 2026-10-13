import { NextResponse } from "next/server";
import {
  activities,
  activityAssignments,
  classes,
  withClaims,
} from "@lingua/db";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireRole, toAuthClaims } from "@/utils/auth/dal";

export const dynamic = 'force-dynamic';

const payloadSchema = z.object({
  status: z.enum(["assigned", "archived"]).optional(),
  dueAt: z.string().datetime().nullable().optional(),
});

interface AssignmentDetailRouteProps {
  params: Promise<{
    id: string;
    assignmentId: string;
  }>;
}

function activityScope(
  session: Awaited<ReturnType<typeof requireRole>>,
  activityId: string,
) {
  if (session.role === "teacher") {
    return and(eq(activities.id, activityId), eq(activities.teacherId, session.id));
  }

  return eq(activities.id, activityId);
}

export async function PATCH(
  request: Request,
  { params }: AssignmentDetailRouteProps,
): Promise<NextResponse> {
  const session = await requireRole(["teacher", "dept_head", "system_admin"]);
  const { id, assignmentId } = await params;
  const parsed = payloadSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload." },
      { status: 400 },
    );
  }

  const dueAt =
    parsed.data.dueAt === undefined
      ? undefined
      : parsed.data.dueAt
        ? new Date(parsed.data.dueAt)
        : null;

  if (dueAt instanceof Date && Number.isNaN(dueAt.getTime())) {
    return NextResponse.json({ error: "Invalid due date." }, { status: 400 });
  }

  const updated = await withClaims(toAuthClaims(session), async (tx) => {
    const activityRows = await tx
      .select({ id: activities.id })
      .from(activities)
      .where(activityScope(session, id))
      .limit(1);

    if (!activityRows[0]) {
      return { type: "activity_missing" as const };
    }

    const assignmentRows = await tx
      .select({
        id: activityAssignments.id,
        activityId: activityAssignments.activityId,
        classId: activityAssignments.classId,
        className: classes.name,
        classSlug: classes.slug,
      })
      .from(activityAssignments)
      .innerJoin(classes, eq(classes.id, activityAssignments.classId))
      .where(
        and(
          eq(activityAssignments.id, assignmentId),
          eq(activityAssignments.activityId, id),
          session.role === "teacher"
            ? eq(classes.teacherId, session.id)
            : eq(activityAssignments.activityId, id),
        ),
      )
      .limit(1);
    const assignment = assignmentRows[0];

    if (!assignment) {
      return { type: "assignment_missing" as const };
    }

    const nextStatus = parsed.data.status ?? undefined;

    const rows = await tx
      .update(activityAssignments)
      .set({
        status: nextStatus,
        dueAt,
        archivedAt:
          nextStatus === "archived"
            ? new Date()
            : nextStatus === "assigned"
              ? null
              : undefined,
      })
      .where(eq(activityAssignments.id, assignment.id))
      .returning({
        id: activityAssignments.id,
        status: activityAssignments.status,
        dueAt: activityAssignments.dueAt,
      });

    return {
      type: "ok" as const,
      assignment: {
        id: rows[0]!.id,
        classId: assignment.classId,
        className: assignment.className,
        classSlug: assignment.classSlug,
        status: rows[0]!.status,
        dueAt: rows[0]!.dueAt,
      },
    };
  });

  if (updated.type === "activity_missing") {
    return NextResponse.json({ error: "Activity not found." }, { status: 404 });
  }

  if (updated.type === "assignment_missing") {
    return NextResponse.json({ error: "Assignment not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, assignment: updated.assignment });
}
