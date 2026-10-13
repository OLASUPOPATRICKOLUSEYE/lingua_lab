import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { type AuthClaims, withClaims } from "../client";
import { schools } from "../schema";
import { adminDb } from "./support";

const schoolA = randomUUID();
const schoolB = randomUUID();

const claimsA: AuthClaims = {
  sub: randomUUID(),
  school_id: schoolA,
  role: "student",
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
    { id: schoolA, name: "School A", slug: `schools-a-${schoolA.slice(0, 8)}` },
    { id: schoolB, name: "School B", slug: `schools-b-${schoolB.slice(0, 8)}` },
  ]);
});

afterAll(async () => {
  await adminDb.delete(schools).where(eq(schools.id, schoolA));
  await adminDb.delete(schools).where(eq(schools.id, schoolB));
});

describe("schools RLS — tenant root isolation through Drizzle", () => {
  it("sanity: a user sees only their own school row", async () => {
    const rows = await withClaims(claimsA, (tx) => tx.select().from(schools));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(schoolA);
  });

  it("blocks cross-tenant READ by id", async () => {
    const rows = await withClaims(claimsA, (tx) =>
      tx.select().from(schools).where(eq(schools.id, schoolB)),
    );
    expect(rows).toHaveLength(0);
  });

  it("blocks INSERT of a foreign school row", async () => {
    const error = await withClaims(claimsA, (tx) =>
      tx.insert(schools).values({
        id: randomUUID(),
        name: "Mallory High",
        slug: `schools-mallory-${randomUUID().slice(0, 8)}`,
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
        .update(schools)
        .set({ name: "Hijacked" })
        .where(eq(schools.id, schoolB))
        .returning(),
    );
    expect(updated).toHaveLength(0);

    const deleted = await withClaims(claimsA, (tx) =>
      tx.delete(schools).where(eq(schools.id, schoolB)).returning(),
    );
    expect(deleted).toHaveLength(0);
  });
});
