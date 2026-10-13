import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  activities,
  activityAssignments,
  classes,
  withClaims,
} from "@lingua/db";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { requireRole, toAuthClaims } from "@/utils/auth/dal";

export const dynamic = 'force-dynamic';

const dbUuid = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    "must be a UUID",
  );

const payloadSchema = z.object({
  classId: dbUuid,
  dueAt: z.string().datetime().nullable().optional().default(null),
});

interface ActivityAssignmentRouteProps {
  params: Promise<{
    id: string;
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

function classScope(
  session: Awaited<ReturnType<typeof requireRole>>,
  classId: string,
) {
  if (session.role === "teacher") {
    return and(eq(classes.id, classId), eq(classes.teacherId, session.id));
  }

  return eq(classes.id, classId);
}

export async function GET(
  _request: Request,
  { params }: ActivityAssignmentRouteProps,
): Promise<NextResponse> {
  const session = await requireRole(["teacher", "dept_head", "system_admin"]);
  const { id } = await params;

  const rows = await withClaims(toAuthClaims(session), async (tx) => {
    const activityRows = await tx
      .select({ id: activities.id })
      .from(activities)
      .where(activityScope(session, id))
      .limit(1);

    if (!activityRows[0]) {
      return null;
    }

    return tx
      .select({
        id: activityAssignments.id,
        classId: classes.id,
        className: classes.name,
        classSlug: classes.slug,
        status: activityAssignments.status,
        dueAt: activityAssignments.dueAt,
        assignedAt: activityAssignments.assignedAt,
      })
      .from(activityAssignments)
      .innerJoin(classes, eq(classes.id, activityAssignments.classId))
      .where(eq(activityAssignments.activityId, id))
      .orderBy(asc(classes.name));
  });

  if (rows === null) {
    return NextResponse.json({ error: "Activity not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, assignments: rows });
}

export async function POST(
  request: Request,
  { params }: ActivityAssignmentRouteProps,
): Promise<NextResponse> {
  const session = await requireRole(["teacher", "dept_head", "system_admin"]);
  const { id } = await params;
  const parsed = payloadSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload." },
      { status: 400 },
    );
  }

  const dueAt = parsed.data.dueAt ? new Date(parsed.data.dueAt) : null;
  if (dueAt && Number.isNaN(dueAt.getTime())) {
    return NextResponse.json({ error: "Invalid due date." }, { status: 400 });
  }

  const assignment = await withClaims(toAuthClaims(session), async (tx) => {
    const activityRows = await tx
      .select({
        id: activities.id,
        schoolId: activities.schoolId,
        title: activities.title,
      })
      .from(activities)
      .where(activityScope(session, id))
      .limit(1);
    const activity = activityRows[0];

    if (!activity) {
      return { type: "activity_missing" as const };
    }

    const classRows = await tx
      .select({
        id: classes.id,
        schoolId: classes.schoolId,
        name: classes.name,
        slug: classes.slug,
      })
      .from(classes)
      .where(classScope(session, parsed.data.classId))
      .limit(1);
    const targetClass = classRows[0];

    if (!targetClass) {
      return { type: "class_missing" as const };
    }

    if (targetClass.schoolId !== activity.schoolId) {
      return { type: "cross_school" as const };
    }

    const existing = await tx
      .select({ id: activityAssignments.id })
      .from(activityAssignments)
      .where(
        and(
          eq(activityAssignments.activityId, activity.id),
          eq(activityAssignments.classId, targetClass.id),
        ),
      )
      .limit(1);

    const assignmentId = existing[0]?.id ?? randomUUID();

    if (existing[0]) {
      await tx
        .update(activityAssignments)
        .set({
          status: "assigned",
          dueAt,
          assignedBy: session.id,
          archivedAt: null,
        })
        .where(eq(activityAssignments.id, assignmentId));
    } else {
      await tx.insert(activityAssignments).values({
        id: assignmentId,
        schoolId: activity.schoolId,
        activityId: activity.id,
        classId: targetClass.id,
        assignedBy: session.id,
        status: "assigned",
        dueAt,
      });
    }

    return {
      type: "ok" as const,
      assignment: {
        id: assignmentId,
        activityId: activity.id,
        activityTitle: activity.title,
        classId: targetClass.id,
        className: targetClass.name,
        classSlug: targetClass.slug,
        status: "assigned" as const,
        dueAt: dueAt?.toISOString() ?? null,
      },
    };
  });

  if (assignment.type === "activity_missing") {
    return NextResponse.json({ error: "Activity not found." }, { status: 404 });
  }

  if (assignment.type === "class_missing") {
    return NextResponse.json({ error: "Class not found." }, { status: 404 });
  }

  if (assignment.type === "cross_school") {
    return NextResponse.json(
      { error: "Activity and class must belong to the same school." },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true, assignment: assignment.assignment });
}
