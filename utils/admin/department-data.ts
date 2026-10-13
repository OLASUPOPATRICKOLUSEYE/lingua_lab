import "server-only";

import { departments, users, withClaims } from "@lingua/db";
import { asc, eq } from "drizzle-orm";
import type { SessionUser } from "@/utils/auth/dal";
import { toAuthClaims } from "@/utils/auth/dal";

export interface AdminDepartmentSummary {
  id: string;
  name: string;
  slug: string;
  headId: string | null;
  headName: string | null;
  headEmail: string | null;
}

export async function getAdminDepartments(
  session: SessionUser,
): Promise<AdminDepartmentSummary[]> {
  return withClaims(toAuthClaims(session), (tx) =>
    tx
      .select({
        id: departments.id,
        name: departments.name,
        slug: departments.slug,
        headId: departments.headId,
        headName: users.fullName,
        headEmail: users.email,
      })
      .from(departments)
      // leftJoin: head_id is nullable — a department with no head still lists.
      .leftJoin(users, eq(users.id, departments.headId))
      .orderBy(asc(departments.name)),
  );
}
