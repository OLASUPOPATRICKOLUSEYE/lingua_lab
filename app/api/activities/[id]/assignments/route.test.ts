import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:crypto", () => ({
  randomUUID: vi.fn(() => "assignment-new"),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((left: unknown, right: unknown) => ({ type: "eq", left, right })),
  and: vi.fn((...conditions: unknown[]) => ({ type: "and", conditions })),
  asc: vi.fn((value: unknown) => ({ type: "asc", value })),
}));

vi.mock("@lingua/db", () => ({
  activities: { id: "id", teacherId: "teacher_id", schoolId: "school_id", title: "title" },
  activityAssignments: { id: "id", activityId: "activity_id", classId: "class_id" },
  classes: { id: "id", teacherId: "teacher_id", schoolId: "school_id", name: "name", slug: "slug" },
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
  return { params: Promise.resolve({ id: "activity-1" }) };
}

function post(body: unknown): Request {
  return new Request("http://localhost", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/**
 * Install a fake tx whose sequential `.select()...limit()` calls resolve to the
 * queued results in order (activity lookup, class lookup, existing assignment).
 * Insert/update chains are recorded via the returned spies.
 */
function installTx(selectQueue: unknown[][]) {
  const limit = vi.fn();
  for (const result of selectQueue) limit.mockResolvedValueOnce(result);
  limit.mockResolvedValue([]);
  const insertValues = vi.fn().mockResolvedValue(undefined);
  const updateWhere = vi.fn().mockResolvedValue(undefined);
  const insert = vi.fn(() => ({ values: insertValues }));
  const update = vi.fn(() => ({ set: () => ({ where: updateWhere }) }));

  const tx = {
    select: () => ({
      from: () => ({
        where: () => ({ limit }),
        innerJoin: () => ({ where: () => ({ orderBy: vi.fn().mockResolvedValue([]) }) }),
      }),
    }),
    insert,
    update,
  };
  return { tx, insert, insertValues, update, updateWhere };
}

// Postgres/internal ids in this repo are validated by UUID SHAPE only, not
// strict RFC variant/version bits, because seeded/dev fixture ids like
// `cccc...` are valid UUID column values but fail Zod's `.uuid()`.
const validBody = { classId: "11111111-1111-1111-1111-111111111111" };

describe("POST /api/activities/[id]/assignments", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { requireRole } = await import("@/utils/auth/dal");
    vi.mocked(requireRole).mockResolvedValue(TEACHER);
  });

  it("rejects a non-uuid classId with 400", async () => {
    const { POST } = await import("./route");
    const { withClaims } = await import("@lingua/db");
    const response = await POST(post({ classId: "not-a-uuid" }), params());
    expect(response.status).toBe(400);
    expect(withClaims).not.toHaveBeenCalled();
  });

  it("404s when the activity is not owned by / visible to the caller", async () => {
    const { POST } = await import("./route");
    const { withClaims } = await import("@lingua/db");
    const { tx } = installTx([[]]); // activity lookup empty
    vi.mocked(withClaims).mockImplementation(async (_c, cb) => cb(tx as never));

    const response = await POST(post(validBody), params());
    const json = await response.json();
    expect(response.status).toBe(404);
    expect(json).toEqual({ error: "Activity not found." });
  });

  it("404s when the target class is not owned by / visible to the caller", async () => {
    const { POST } = await import("./route");
    const { withClaims } = await import("@lingua/db");
    const { tx, insert } = installTx([
      [{ id: "activity-1", schoolId: "school-1", title: "Passage" }],
      [], // class lookup empty
    ]);
    vi.mocked(withClaims).mockImplementation(async (_c, cb) => cb(tx as never));

    const response = await POST(post(validBody), params());
    const json = await response.json();
    expect(response.status).toBe(404);
    expect(json).toEqual({ error: "Class not found." });
    expect(insert).not.toHaveBeenCalled();
  });

  it("400s when activity and class belong to different schools", async () => {
    const { POST } = await import("./route");
    const { withClaims } = await import("@lingua/db");
    const { tx } = installTx([
      [{ id: "activity-1", schoolId: "school-1", title: "Passage" }],
      [{ id: "class-1", schoolId: "school-2", name: "9B", slug: "9b" }],
    ]);
    vi.mocked(withClaims).mockImplementation(async (_c, cb) => cb(tx as never));

    const response = await POST(post(validBody), params());
    expect(response.status).toBe(400);
  });

  it("inserts a new assignment when none exists and returns it", async () => {
    const { POST } = await import("./route");
    const { withClaims } = await import("@lingua/db");
    const { tx, insert, insertValues, update } = installTx([
      [{ id: "activity-1", schoolId: "school-1", title: "Passage" }],
      [{ id: "class-1", schoolId: "school-1", name: "9B", slug: "9b" }],
      [], // no existing assignment
    ]);
    vi.mocked(withClaims).mockImplementation(async (_c, cb) => cb(tx as never));

    const response = await POST(post(validBody), params());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.assignment.id).toBe("assignment-new");
    expect(json.assignment.classSlug).toBe("9b");
    expect(insert).toHaveBeenCalledOnce();
    expect(update).not.toHaveBeenCalled();
    const inserted = insertValues.mock.calls[0]![0] as Record<string, unknown>;
    expect(inserted.assignedBy).toBe("teacher-1");
    expect(inserted.status).toBe("assigned");
  });

  it("re-activates (updates) an existing assignment instead of inserting", async () => {
    const { POST } = await import("./route");
    const { withClaims } = await import("@lingua/db");
    const { tx, insert, update, updateWhere } = installTx([
      [{ id: "activity-1", schoolId: "school-1", title: "Passage" }],
      [{ id: "class-1", schoolId: "school-1", name: "9B", slug: "9b" }],
      [{ id: "assignment-existing" }],
    ]);
    vi.mocked(withClaims).mockImplementation(async (_c, cb) => cb(tx as never));

    const response = await POST(post(validBody), params());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.assignment.id).toBe("assignment-existing");
    expect(update).toHaveBeenCalledOnce();
    expect(updateWhere).toHaveBeenCalledOnce();
    expect(insert).not.toHaveBeenCalled();
  });
});
