import { NextResponse } from "next/server";
import { parseUuidParam } from "@/utils/api/route-params";
import { classes, liveSessions, withClaims } from "@lingua/db";
import { and, eq, isNull } from "drizzle-orm";
import { requireRole, toAuthClaims } from "@/utils/auth/dal";

export const dynamic = "force-dynamic";

interface LiveSessionRouteProps {
  params: Promise<{ id: string }>;
}

/**
 * Cancels a scheduled live class. Soft cancel (`canceled_at`) rather than a
 * row delete, so students who were expecting the class still see that it was
 * called off instead of it silently vanishing.
 */
export async function DELETE(
  _request: Request,
  { params }: LiveSessionRouteProps,
): Promise<NextResponse> {
  const session = await requireRole(["teacher", "dept_head", "system_admin"]);
  const { id } = await params;
  // A malformed id is a bad request, not a server error.
  if (!parseUuidParam(id)) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  const outcome = await withClaims(toAuthClaims(session), async (tx) => {
    const [target] = await tx
      .select({ id: liveSessions.id, teacherId: classes.teacherId })
      .from(liveSessions)
      .innerJoin(classes, eq(classes.id, liveSessions.classId))
      .where(eq(liveSessions.id, id))
      .limit(1);

    if (!target) {
      return { type: "missing" as const };
    }

    if (session.role === "teacher" && target.teacherId !== session.id) {
      return { type: "forbidden" as const };
    }

    const rows = await tx
      .update(liveSessions)
      .set({ canceledAt: new Date() })
      .where(and(eq(liveSessions.id, id), isNull(liveSessions.canceledAt)))
      .returning({ id: liveSessions.id });

    return rows.length > 0
      ? ({ type: "ok" } as const)
      : ({ type: "already_canceled" } as const);
  });

  if (outcome.type === "missing") {
    return NextResponse.json(
      { error: "Live class was not found." },
      { status: 404 },
    );
  }

  if (outcome.type === "forbidden") {
    return NextResponse.json(
      { error: "You do not manage this class." },
      { status: 403 },
    );
  }

  return NextResponse.json({ ok: true, alreadyCanceled: outcome.type === "already_canceled" });
}
