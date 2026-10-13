import { randomUUID } from "node:crypto";
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
  name: z.string().trim().min(2).max(120),
  teacherId: dbUuid,
});

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "class";
}

export async function POST(request: Request): Promise<NextResponse> {
  const session = await requireRole(["system_admin", "dept_head"]);
  const parsed = payloadSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload." },
      { status: 400 },
    );
  }

  const created = await withClaims(toAuthClaims(session), async (tx) => {
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

    const baseSlug = slugify(parsed.data.name);
    let slug = baseSlug;
    for (let suffix = 2; suffix <= 21; suffix += 1) {
      const [collision] = await tx
        .select({ id: classes.id })
        .from(classes)
        .where(eq(classes.slug, slug))
        .limit(1);
      if (!collision) {
        break;
      }
      slug = `${baseSlug}-${suffix}`;
    }

    const id = randomUUID();
    await tx.insert(classes).values({
      id,
      schoolId: session.schoolId,
      teacherId: parsed.data.teacherId,
      name: parsed.data.name,
      slug,
    });

    return { type: "ok" as const, class: { id, name: parsed.data.name, slug } };
  });

  if (created.type === "teacher_missing") {
    return NextResponse.json(
      { error: "Selected teacher was not found." },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true, class: created.class }, { status: 201 });
}
