import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { departments, users, withClaims } from "@lingua/db";
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
  // Optional: a department can exist before it has a head. The empty string is
  // accepted because that is what an unselected <select> submits.
  headId: z
    .union([dbUuid, z.literal("")])
    .nullish()
    .transform((value) => value || null),
});

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "department";
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

  const { name, headId } = parsed.data;

  const created = await withClaims(toAuthClaims(session), async (tx) => {
    if (headId) {
      // Scoped by RLS, so a head from another school reads as "not found".
      const [head] = await tx
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, headId), eq(users.role, "dept_head")))
        .limit(1);

      if (!head) {
        return { type: "head_missing" as const };
      }
    }

    const baseSlug = slugify(name);
    let slug = baseSlug;
    for (let suffix = 2; suffix <= 21; suffix += 1) {
      const [collision] = await tx
        .select({ id: departments.id })
        .from(departments)
        .where(eq(departments.slug, slug))
        .limit(1);
      if (!collision) {
        break;
      }
      slug = `${baseSlug}-${suffix}`;
    }

    const id = randomUUID();
    await tx.insert(departments).values({
      id,
      schoolId: session.schoolId,
      headId,
      name,
      slug,
    });

    return { type: "ok" as const, department: { id, name, slug } };
  }).catch((error: unknown) => {
    if (error instanceof Error && error.message.includes("unique")) {
      return { type: "duplicate" as const };
    }
    throw error;
  });

  if (created.type === "head_missing") {
    return NextResponse.json(
      { error: "Selected department head was not found." },
      { status: 400 },
    );
  }

  if (created.type === "duplicate") {
    return NextResponse.json(
      { error: "A department with this name already exists." },
      { status: 400 },
    );
  }

  return NextResponse.json(
    { ok: true, department: created.department },
    { status: 201 },
  );
}
