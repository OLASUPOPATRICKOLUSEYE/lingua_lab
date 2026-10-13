import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { type AuthClaims, withClaims } from "../client";
import { schools, users } from "../schema";
import { adminDb } from "./support";

const schoolA = randomUUID();
const schoolB = randomUUID();
const userA = randomUUID();
const userB = randomUUID();

const claimsA: AuthClaims = { sub: userA, school_id: schoolA, role: "student" };
const claimsB: AuthClaims = { sub: userB, school_id: schoolB, role: "student" };

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
    { id: schoolA, name: "School A", slug: `users-a-${schoolA.slice(0, 8)}` },
    { id: schoolB, name: "School B", slug: `users-b-${schoolB.slice(0, 8)}` },
  ]);
  await adminDb.insert(users).values([
    { id: userA, schoolId: schoolA, role: "student", fullName: "Alice", email: `users-alice-${userA.slice(0, 8)}@a.test` },
    { id: userB, schoolId: schoolB, role: "student", fullName: "Bob", email: `users-bob-${userB.slice(0, 8)}@b.test` },
  ]);
});

afterAll(async () => {
  await adminDb.delete(users).where(eq(users.id, userA));
  await adminDb.delete(users).where(eq(users.id, userB));
  await adminDb.delete(schools).where(eq(schools.id, schoolA));
  await adminDb.delete(schools).where(eq(schools.id, schoolB));
});

describe("users RLS — cross-tenant isolation through Drizzle", () => {
  it("sanity: each user sees only their own school", async () => {
    const rowsA = await withClaims(claimsA, (tx) => tx.select().from(users));
    expect(rowsA).toHaveLength(1);
    expect(rowsA[0]?.id).toBe(userA);

    const rowsB = await withClaims(claimsB, (tx) => tx.select().from(users));
    expect(rowsB).toHaveLength(1);
    expect(rowsB[0]?.id).toBe(userB);
  });

  it("blocks cross-tenant READ by id", async () => {
    const rows = await withClaims(claimsA, (tx) =>
      tx.select().from(users).where(eq(users.id, userB)),
    );
    expect(rows).toHaveLength(0);
  });

  it("blocks cross-tenant WRITE", async () => {
    const error = await withClaims(claimsA, (tx) =>
      tx.insert(users).values({
        id: randomUUID(),
        schoolId: schoolB,
        role: "student",
        fullName: "Mallory",
        email: `users-mallory-${randomUUID().slice(0, 8)}@b.test`,
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
        .update(users)
        .set({ fullName: "Wrong" })
        .where(eq(users.id, userB))
        .returning(),
    );
    expect(updated).toHaveLength(0);

    const deleted = await withClaims(claimsA, (tx) =>
      tx.delete(users).where(and(eq(users.id, userB), eq(users.schoolId, schoolB))).returning(),
    );
    expect(deleted).toHaveLength(0);
  });
});
