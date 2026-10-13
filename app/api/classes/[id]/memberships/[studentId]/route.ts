import { NextResponse } from "next/server";
import { classMemberships, withClaims } from "@lingua/db";
import { and, eq } from "drizzle-orm";
import { requireRole, toAuthClaims } from "@/utils/auth/dal";

export const dynamic = "force-dynamic";

interface MembershipRouteProps {
  params: Promise<{ id: string; studentId: string }>;
}

export async function DELETE(
  _request: Request,
  { params }: MembershipRouteProps,
): Promise<NextResponse> {
  const session = await requireRole(["system_admin", "dept_head"]);
  const { id, studentId } = await params;

  const rows = await withClaims(toAuthClaims(session), (tx) =>
    tx
      .delete(classMemberships)
      .where(
        and(
          eq(classMemberships.classId, id),
          eq(classMemberships.studentId, studentId),
        ),
      )
      .returning({ studentId: classMemberships.studentId }),
  );

  if (rows.length === 0) {
    return NextResponse.json(
      { error: "Student is not on this class roster." },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true });
}
