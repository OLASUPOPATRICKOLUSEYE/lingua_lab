import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((left: unknown, right: unknown) => ({ type: "eq", left, right })),
  and: vi.fn((...conditions: unknown[]) => ({ type: "and", conditions })),
}));

vi.mock("@lingua/db", () => ({
  activities: { id: "id", teacherId: "teacher_id" },
  activityAssignments: { id: "id", activityId: "activity_id", status: "status", dueAt: "due_at", archivedAt: "archived_at" },
  classes: { id: "id", teacherId: "teacher_id", name: "name", slug: "slug" },
  withClaims: vi.fn(),
}));

vi.mock("@/utils/auth/dal", () => ({
  requireRole: vi.fn(),
  toAuthClaims: vi.fn(() => ({ sub: "teacher-1", school_id: "school-1", role: "teacher" })),
}));

const TEACHER = {
  id: "teacher-1",
  email: "teacher@example.com",
  schoolId: "school-1",
  role: "teacher" as const,
};

function params() {
  return {
    params: Promise.resolve({ id: "activity-1", assignmentId: "assignment-1" }),
  };
}

function patch(body: unknown): Request {
  return new Request("http://localhost", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

/** Fake tx: activity lookup, assignment lookup, then update...returning. */
function installTx(selectQueue: unknown[][], updateReturn: unknown[]) {
  const limit = vi.fn();
  for (const r of selectQueue) limit.mockResolvedValueOnce(r);
  limit.mockResolvedValue([]);
  const returning = vi.fn().mockResolvedValue(updateReturn);
  const setSpy = vi.fn((_values: Record<string, unknown>) => ({
    where: () => ({ returning }),
  }));
  const update = vi.fn(() => ({ set: setSpy }));
  const tx = {
    select: () => ({
      from: () => ({
        where: () => ({ limit }),
        innerJoin: () => ({ where: () => ({ limit }) }),
      }),
    }),
    update,
  };
  return { tx, update, setSpy, returning };
}

describe("PATCH /api/activities/[id]/assignments/[assignmentId]", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { requireRole } = await import("@/utils/auth/dal");
    vi.mocked(requireRole).mockResolvedValue(TEACHER);
  });

  it("rejects an invalid status enum with 400", async () => {
    const { PATCH } = await import("./route");
    const { withClaims } = await import("@lingua/db");
    const response = await PATCH(patch({ status: "deleted" }), params());
    expect(response.status).toBe(400);
    expect(withClaims).not.toHaveBeenCalled();
  });

  it("rejects a malformed dueAt with 400", async () => {
    const { PATCH } = await import("./route");
    const response = await PATCH(patch({ dueAt: "not-a-date" }), params());
    expect(response.status).toBe(400);
  });

  it("404s when the activity is not owned by the caller", async () => {
    const { PATCH } = await import("./route");
    const { withClaims } = await import("@lingua/db");
    const { tx } = installTx([[]], []); // activity lookup empty
    vi.mocked(withClaims).mockImplementation(async (_c, cb) => cb(tx as never));

    const response = await PATCH(patch({ status: "archived" }), params());
    const json = await response.json();
    expect(response.status).toBe(404);
    expect(json).toEqual({ error: "Activity not found." });
  });

  it("404s when the assignment is not found within the owned activity", async () => {
    const { PATCH } = await import("./route");
    const { withClaims } = await import("@lingua/db");
    const { tx } = installTx([[{ id: "activity-1" }], []], []);
    vi.mocked(withClaims).mockImplementation(async (_c, cb) => cb(tx as never));

    const response = await PATCH(patch({ status: "archived" }), params());
    const json = await response.json();
    expect(response.status).toBe(404);
    expect(json).toEqual({ error: "Assignment not found." });
  });

  it("archives: sets archivedAt alongside status so the CHECK stays consistent", async () => {
    const { PATCH } = await import("./route");
    const { withClaims } = await import("@lingua/db");
    const { tx, setSpy } = installTx(
      [
        [{ id: "activity-1" }],
        [{ id: "assignment-1", activityId: "activity-1", classId: "class-1", className: "9B", classSlug: "9b" }],
      ],
      [{ id: "assignment-1", status: "archived", dueAt: null }],
    );
    vi.mocked(withClaims).mockImplementation(async (_c, cb) => cb(tx as never));

    const response = await PATCH(patch({ status: "archived" }), params());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.assignment.status).toBe("archived");
    const setArg = setSpy.mock.calls[0]![0] as Record<string, unknown>;
    expect(setArg.status).toBe("archived");
    expect(setArg.archivedAt).toBeInstanceOf(Date);
  });

  it("restores: clears archivedAt when status returns to assigned", async () => {
    const { PATCH } = await import("./route");
    const { withClaims } = await import("@lingua/db");
    const { tx, setSpy } = installTx(
      [
        [{ id: "activity-1" }],
        [{ id: "assignment-1", activityId: "activity-1", classId: "class-1", className: "9B", classSlug: "9b" }],
      ],
      [{ id: "assignment-1", status: "assigned", dueAt: null }],
    );
    vi.mocked(withClaims).mockImplementation(async (_c, cb) => cb(tx as never));

    await PATCH(patch({ status: "assigned" }), params());
    const setArg = setSpy.mock.calls[0]![0] as Record<string, unknown>;
    expect(setArg.status).toBe("assigned");
    expect(setArg.archivedAt).toBeNull();
  });

  it("due-date-only update leaves archivedAt untouched (undefined)", async () => {
    const { PATCH } = await import("./route");
    const { withClaims } = await import("@lingua/db");
    const { tx, setSpy } = installTx(
      [
        [{ id: "activity-1" }],
        [{ id: "assignment-1", activityId: "activity-1", classId: "class-1", className: "9B", classSlug: "9b" }],
      ],
      [{ id: "assignment-1", status: "assigned", dueAt: "2026-07-10T00:00:00.000Z" }],
    );
    vi.mocked(withClaims).mockImplementation(async (_c, cb) => cb(tx as never));

    await PATCH(patch({ dueAt: "2026-07-10T00:00:00.000Z" }), params());
    const setArg = setSpy.mock.calls[0]![0] as Record<string, unknown>;
    expect(setArg.status).toBeUndefined();
    expect(setArg.archivedAt).toBeUndefined();
    expect(setArg.dueAt).toBeInstanceOf(Date);
  });
});
