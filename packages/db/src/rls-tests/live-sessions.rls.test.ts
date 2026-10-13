import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { type AuthClaims, withClaims } from "../client";
import { classes, liveSessions, schools, users } from "../schema";
import { adminDb } from "./support";

const schoolA = randomUUID();
const schoolB = randomUUID();
const teacherA = randomUUID();
const teacherB = randomUUID();
const classA = randomUUID();
const classB = randomUUID();
const sessionRowA = randomUUID();
const sessionRowB = randomUUID();

const claimsA: AuthClaims = { sub: teacherA, school_id: schoolA, role: "teacher" };

const startsAt = new Date("2026-09-01T10:00:00Z");
const endsAt = new Date("2026-09-01T11:00:00Z");

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
    { id: schoolA, name: "Live School A", slug: `live-a-${schoolA.slice(0, 8)}` },
    { id: schoolB, name: "Live School B", slug: `live-b-${schoolB.slice(0, 8)}` },
  ]);
  await adminDb.insert(users).values([
    { id: teacherA, schoolId: schoolA, role: "teacher", fullName: "Live Alice", email: `live-alice-${teacherA.slice(0, 8)}@a.test` },
    { id: teacherB, schoolId: schoolB, role: "teacher", fullName: "Live Bob", email: `live-bob-${teacherB.slice(0, 8)}@b.test` },
  ]);
  await adminDb.insert(classes).values([
    { id: classA, schoolId: schoolA, teacherId: teacherA, name: "Live 9A", slug: `live-9a-${classA.slice(0, 8)}` },
    { id: classB, schoolId: schoolB, teacherId: teacherB, name: "Live 9B", slug: `live-9b-${classB.slice(0, 8)}` },
  ]);
  await adminDb.insert(liveSessions).values([
    { id: sessionRowA, schoolId: schoolA, classId: classA, provider: "zoom", joinUrl: "https://us02web.zoom.us/j/1111111111", startsAt, endsAt },
    { id: sessionRowB, schoolId: schoolB, classId: classB, provider: "google_meet", joinUrl: "https://meet.google.com/abc-defg-hij", startsAt, endsAt },
  ]);
});

afterAll(async () => {
  await adminDb.delete(liveSessions).where(eq(liveSessions.id, sessionRowA));
  await adminDb.delete(liveSessions).where(eq(liveSessions.id, sessionRowB));
  await adminDb.delete(classes).where(eq(classes.id, classA));
  await adminDb.delete(classes).where(eq(classes.id, classB));
  await adminDb.delete(users).where(eq(users.id, teacherA));
  await adminDb.delete(users).where(eq(users.id, teacherB));
  await adminDb.delete(schools).where(eq(schools.id, schoolA));
  await adminDb.delete(schools).where(eq(schools.id, schoolB));
});

describe("live_sessions RLS — cross-tenant isolation through Drizzle", () => {
  it("blocks cross-tenant READ", async () => {
    const rows = await withClaims(claimsA, (tx) =>
      tx.select().from(liveSessions).where(eq(liveSessions.id, sessionRowB)),
    );
    expect(rows).toHaveLength(0);
  });

  it("allows same-tenant READ", async () => {
    const rows = await withClaims(claimsA, (tx) =>
      tx.select().from(liveSessions).where(eq(liveSessions.id, sessionRowA)),
    );
    expect(rows).toHaveLength(1);
  });

  it("blocks cross-tenant WRITE", async () => {
    const error = await withClaims(claimsA, (tx) =>
      tx.insert(liveSessions).values({
        id: randomUUID(),
        schoolId: schoolB,
        classId: classB,
        provider: "zoom",
        joinUrl: "https://us02web.zoom.us/j/9999999999",
        startsAt,
        endsAt,
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
        .update(liveSessions)
        .set({ joinUrl: "https://us02web.zoom.us/j/0000000000" })
        .where(eq(liveSessions.id, sessionRowB))
        .returning(),
    );
    expect(updated).toHaveLength(0);

    const deleted = await withClaims(claimsA, (tx) =>
      tx.delete(liveSessions).where(eq(liveSessions.id, sessionRowB)).returning(),
    );
    expect(deleted).toHaveLength(0);
  });
});

describe("live_sessions constraints", () => {
  it("rejects an end time at or before the start time", async () => {
    const error = await adminDb
      .insert(liveSessions)
      .values({
        id: randomUUID(),
        schoolId: schoolA,
        classId: classA,
        provider: "zoom",
        joinUrl: "https://us02web.zoom.us/j/2222222222",
        startsAt: endsAt,
        endsAt: startsAt,
      })
      .then(
        () => null,
        (e: unknown) => e,
      );

    expect(collectErrorText(error)).toMatch(/live_sessions_time_order_check/i);
  });

  it("rejects a non-https join URL at the database level", async () => {
    const error = await adminDb
      .insert(liveSessions)
      .values({
        id: randomUUID(),
        schoolId: schoolA,
        classId: classA,
        provider: "zoom",
        joinUrl: "http://us02web.zoom.us/j/3333333333",
        startsAt,
        endsAt,
      })
      .then(
        () => null,
        (e: unknown) => e,
      );

    expect(collectErrorText(error)).toMatch(/live_sessions_join_url_check/i);
  });

  it("rejects an unknown provider", async () => {
    const error = await adminDb
      .insert(liveSessions)
      .values({
        id: randomUUID(),
        schoolId: schoolA,
        classId: classA,
        provider: "teams",
        joinUrl: "https://teams.microsoft.com/l/meetup-join/x",
        startsAt,
        endsAt,
      })
      .then(
        () => null,
        (e: unknown) => e,
      );

    expect(collectErrorText(error)).toMatch(/live_sessions_provider_check/i);
  });
});
