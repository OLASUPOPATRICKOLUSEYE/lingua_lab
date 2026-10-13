import { NextResponse } from "next/server";
import { classMemberships, classes, users, withClaims } from "@lingua/db";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireRole, toAuthClaims } from "@/utils/auth/dal";

export const dynamic = "force-dynamic";

const dbUuid = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    "must be a UUID",
  );

const payloadSchema = z.object({
  studentId: dbUuid,
});

interface MembershipsRouteProps {
  params: Promise<{ id: string }>;
}

export async function POST(
  request: Request,
  { params }: MembershipsRouteProps,
): Promise<NextResponse> {
  const session = await requireRole(["system_admin", "dept_head"]);
  const { id } = await params;
  const parsed = payloadSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload." },
      { status: 400 },
    );
  }

  const result = await withClaims(toAuthClaims(session), async (tx) => {
    const [classRow] = await tx
      .select({ id: classes.id })
      .from(classes)
      .where(eq(classes.id, id))
      .limit(1);
    if (!classRow) {
      return { type: "class_missing" as const };
    }

    const [student] = await tx
      .select({ id: users.id })
      .from(users)
      .where(
        and(eq(users.id, parsed.data.studentId), eq(users.role, "student")),
      )
      .limit(1);
    if (!student) {
      return { type: "student_missing" as const };
    }

    await tx
      .insert(classMemberships)
      .values({
        classId: id,
        schoolId: session.schoolId,
        studentId: parsed.data.studentId,
      })
      .onConflictDoNothing();

    return { type: "ok" as const };
  });

  if (result.type === "class_missing") {
    return NextResponse.json({ error: "Class not found." }, { status: 404 });
  }

  if (result.type === "student_missing") {
    return NextResponse.json(
      { error: "Selected student was not found." },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
