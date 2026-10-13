import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:crypto", () => ({
  randomUUID: vi.fn(() => "class-1"),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((left: unknown, right: unknown) => ({ type: "eq", left, right })),
  and: vi.fn((...conditions: unknown[]) => ({ type: "and", conditions })),
}));

vi.mock("@lingua/db", () => ({
  classes: { id: "id", slug: "slug" },
  users: { id: "id", role: "role" },
  withClaims: vi.fn(),
}));

vi.mock("@/utils/auth/dal", () => ({
  requireRole: vi.fn(),
  toAuthClaims: vi.fn(() => ({
    sub: "admin-1",
    school_id: "school-1",
    role: "system_admin",
  })),
}));

const validBody = { name: "French 9B", teacherId: "22222222-2222-2222-2222-222222222222" };

function request(body: unknown): Request {
  return new Request("http://localhost/api/classes", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function installTx(teacherRows: unknown[], collisionSequence: unknown[][]) {
  const limit = vi.fn();
  limit.mockResolvedValueOnce(teacherRows);
  for (const rows of collisionSequence) {
    limit.mockResolvedValueOnce(rows);
  }
  const select = vi.fn(() => ({ from: () => ({ where: () => ({ limit }) }) }));
  const insertValues = vi.fn().mockResolvedValue(undefined);
  const insert = vi.fn(() => ({ values: insertValues }));
  return { select, insert, insertValues, limit };
}

describe("POST /api/classes", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { requireRole } = await import("@/utils/auth/dal");
    vi.mocked(requireRole).mockResolvedValue({
      id: "admin-1",
      email: "admin@example.com",
      schoolId: "school-1",
      role: "system_admin",
    });
  });

  it("rejects a name that's too short with 400 and never writes", async () => {
    const { POST } = await import("./route");
    const { withClaims } = await import("@lingua/db");

    const response = await POST(request({ ...validBody, name: "A" }));

    expect(response.status).toBe(400);
    expect(withClaims).not.toHaveBeenCalled();
  });

  it("rejects a malformed teacherId with 400", async () => {
    const { POST } = await import("./route");
    const response = await POST(request({ ...validBody, teacherId: "not-a-uuid" }));
    expect(response.status).toBe(400);
  });

  it("rejects when the teacher does not exist with 400", async () => {
    const { POST } = await import("./route");
    const { withClaims } = await import("@lingua/db");

    const { select, insert } = installTx([], []);
    vi.mocked(withClaims).mockImplementation(async (_claims, cb) =>
      cb({ select, insert } as never),
    );

    const response = await POST(request(validBody));
    expect(response.status).toBe(400);
    expect(insert).not.toHaveBeenCalled();
  });

  it("creates the class scoped to the caller's school and returns 201", async () => {
    const { POST } = await import("./route");
    const { withClaims } = await import("@lingua/db");

    const { select, insert, insertValues } = installTx(
      [{ id: "teacher-1" }],
      [[]],
    );
    vi.mocked(withClaims).mockImplementation(async (_claims, cb) =>
      cb({ select, insert } as never),
    );

    const response = await POST(request(validBody));
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json).toEqual({
      ok: true,
      class: { id: "class-1", name: "French 9B", slug: "french-9b" },
    });

    const inserted = insertValues.mock.calls[0]![0] as Record<string, unknown>;
    expect(inserted.schoolId).toBe("school-1");
    expect(inserted.teacherId).toBe(validBody.teacherId);
  });

  it("dedupes the slug when the base slug is already taken", async () => {
    const { POST } = await import("./route");
    const { withClaims } = await import("@lingua/db");

    // First collision check finds a match, second finds none.
    const { select, insert, insertValues } = installTx(
      [{ id: "teacher-1" }],
      [[{ id: "existing-class" }], []],
    );
    vi.mocked(withClaims).mockImplementation(async (_claims, cb) =>
      cb({ select, insert } as never),
    );

    await POST(request(validBody));
    const inserted = insertValues.mock.calls[0]![0] as Record<string, unknown>;
    expect(inserted.slug).toBe("french-9b-2");
  });
});
