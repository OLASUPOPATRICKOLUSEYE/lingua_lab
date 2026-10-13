import { NextResponse } from "next/server";
import { authCredentials, db, users, withClaims } from "@lingua/db";
import { hash } from "@node-rs/argon2";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireRole, toAuthClaims } from "@/utils/auth/dal";

export const dynamic = "force-dynamic";

const payloadSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(72),
});

export async function POST(request: Request): Promise<NextResponse> {
  // Only system_admin, not dept_head — creating a peer-level admin account
  // is a more sensitive privilege than provisioning a teacher or student.
  const session = await requireRole(["system_admin"]);
  const parsed = payloadSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload." },
      { status: 400 },
    );
  }

  let newUserId: string;
  try {
    const [created] = await withClaims(toAuthClaims(session), (tx) =>
      tx
        .insert(users)
        .values({
          schoolId: session.schoolId,
          role: "dept_head",
          fullName: parsed.data.fullName,
          email: parsed.data.email,
        })
        .returning({ id: users.id }),
    );
    if (!created) throw new Error("insert returned no row");
    newUserId = created.id;
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error && error.message.includes("unique")
            ? "A user with this email already exists."
            : "Failed to create the department head record.",
      },
      { status: 400 },
    );
  }

  try {
    const passwordHash = await hash(parsed.data.password);
    await db.insert(authCredentials).values({ userId: newUserId, passwordHash });
  } catch {
    // Don't leave a `users` row with no way to log in.
    await withClaims(toAuthClaims(session), (tx) =>
      tx.delete(users).where(eq(users.id, newUserId)),
    );
    return NextResponse.json(
      { error: "Failed to provision the department head's credentials." },
      { status: 400 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      deptHead: { id: newUserId, fullName: parsed.data.fullName, email: parsed.data.email },
    },
    { status: 201 },
  );
}
