import { NextResponse } from "next/server";
import { classes, users, withClaims } from "@lingua/db";
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
  name: z.string().trim().min(2).max(120).optional(),
  teacherId: dbUuid.optional(),
});

interface ClassRouteProps {
  params: Promise<{ id: string }>;
}

export async function PATCH(
  request: Request,
  { params }: ClassRouteProps,
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

  if (!parsed.data.name && !parsed.data.teacherId) {
    return NextResponse.json(
      { error: "Provide a name or a teacherId to update." },
      { status: 400 },
    );
  }

  const updated = await withClaims(toAuthClaims(session), async (tx) => {
    if (parsed.data.teacherId) {
      const [teacher] = await tx
        .select({ id: users.id })
        .from(users)
        .where(
          and(eq(users.id, parsed.data.teacherId), eq(users.role, "teacher")),
        )
        .limit(1);
      if (!teacher) {
        return { type: "teacher_missing" as const };
      }
    }

    const rows = await tx
      .update(classes)
      .set({
        name: parsed.data.name,
        teacherId: parsed.data.teacherId,
      })
      .where(eq(classes.id, id))
      .returning({
        id: classes.id,
        name: classes.name,
        teacherId: classes.teacherId,
      });

    return rows[0]
      ? { type: "ok" as const, class: rows[0] }
      : { type: "class_missing" as const };
  });

  if (updated.type === "teacher_missing") {
    return NextResponse.json(
      { error: "Selected teacher was not found." },
      { status: 400 },
    );
  }

  if (updated.type === "class_missing") {
    return NextResponse.json({ error: "Class not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, class: updated.class });
}
