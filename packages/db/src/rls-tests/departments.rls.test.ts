import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { type AuthClaims, withClaims } from "../client";
import { departments, schools, users } from "../schema";
import { adminDb } from "./support";

const schoolA = randomUUID();
const schoolB = randomUUID();
const headA = randomUUID();
const headB = randomUUID();
const deptA = randomUUID();
const deptB = randomUUID();

const claimsA: AuthClaims = {
  sub: headA,
  school_id: schoolA,
  role: "system_admin",
};

function collectErrorText(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  let depth = 0;
  while (current && depth < 10) {
    const e = current as { message?: string; code?: string; cause?: unknown };
    if (e.message) parts.push(e.message);
    if (e.code) parts.push(`code=${e.code}`);
    current = e.cause;
    depth += 1;
  }
  return parts.join(" | ");
}

beforeAll(async () => {
  await adminDb.insert(schools).values([
    { id: schoolA, name: "Dept School A", slug: `dept-a-${schoolA.slice(0, 8)}` },
    { id: schoolB, name: "Dept School B", slug: `dept-b-${schoolB.slice(0, 8)}` },
  ]);
  await adminDb.insert(users).values([
    { id: headA, schoolId: schoolA, role: "dept_head", fullName: "Ada Head", email: `dept-ada-${headA.slice(0, 8)}@a.test` },
    { id: headB, schoolId: schoolB, role: "dept_head", fullName: "Ben Head", email: `dept-ben-${headB.slice(0, 8)}@b.test` },
  ]);
  await adminDb.insert(departments).values([
    { id: deptA, schoolId: schoolA, headId: headA, name: "Modern Languages", slug: "modern-languages" },
    { id: deptB, schoolId: schoolB, headId: headB, name: "Modern Languages", slug: "modern-languages" },
  ]);
});

afterAll(async () => {
  await adminDb.delete(departments).where(eq(departments.id, deptA));
  await adminDb.delete(departments).where(eq(departments.id, deptB));
  await adminDb.delete(users).where(eq(users.id, headA));
  await adminDb.delete(users).where(eq(users.id, headB));
  await adminDb.delete(schools).where(eq(schools.id, schoolA));
  await adminDb.delete(schools).where(eq(schools.id, schoolB));
});

describe("departments RLS — cross-tenant isolation through Drizzle", () => {
  it("blocks cross-tenant READ", async () => {
    const rows = await withClaims(claimsA, (tx) =>
      tx.select().from(departments).where(eq(departments.id, deptB)),
    );
    expect(rows).toHaveLength(0);
  });

  it("allows same-tenant READ", async () => {
    const rows = await withClaims(claimsA, (tx) =>
      tx.select().from(departments).where(eq(departments.id, deptA)),
    );
    expect(rows).toHaveLength(1);
  });

  it("blocks cross-tenant WRITE", async () => {
    const error = await withClaims(claimsA, (tx) =>
      tx.insert(departments).values({
        id: randomUUID(),
        schoolId: schoolB,
        headId: headB,
        name: "Wrong school",
        slug: "wrong-school",
      }),
    ).then(
      () => null,
      (e: unknown) => e,
    );

    expect(error).not.toBeNull();
    expect(collectErrorText(error)).toMatch(/row-level security|42501/i);
  });

  it("blocks cross-tenant UPDATE and DELETE", async () => {
    const updated = await withClaims(claimsA, (tx) =>
      tx
        .update(departments)
        .set({ name: "Hacked" })
        .where(eq(departments.id, deptB))
        .returning(),
    );
    expect(updated).toHaveLength(0);

    const deleted = await withClaims(claimsA, (tx) =>
      tx.delete(departments).where(eq(departments.id, deptB)).returning(),
    );
    expect(deleted).toHaveLength(0);
  });
});
