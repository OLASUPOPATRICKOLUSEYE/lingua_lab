import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((left: unknown, right: unknown) => ({ type: "eq", left, right })),
  and: vi.fn((...conditions: unknown[]) => ({ type: "and", conditions })),
}));

vi.mock("@lingua/db", () => ({
  classMemberships: { classId: "class_id", schoolId: "school_id", studentId: "student_id" },
  classes: { id: "id" },
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

const validBody = { studentId: "33333333-3333-3333-3333-333333333333" };

function request(body: unknown): Request {
  return new Request("http://localhost/api/classes/class-1/memberships", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function params(id = "class-1") {
  return { params: Promise.resolve({ id }) };
}

function installTx(classRows: unknown[], studentRows: unknown[]) {
  const limit = vi.fn();
  limit.mockResolvedValueOnce(classRows);
  limit.mockResolvedValueOnce(studentRows);
  const select = vi.fn(() => ({ from: () => ({ where: () => ({ limit }) }) }));
  const onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
  const insertValues = vi.fn((_values: Record<string, unknown>) => ({
    onConflictDoNothing,
  }));
  const insert = vi.fn(() => ({ values: insertValues }));
  return { select, insert, insertValues, onConflictDoNothing };
}

describe("POST /api/classes/[id]/memberships", () => {
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

  it("rejects a malformed studentId with 400", async () => {
    const { POST } = await import("./route");
    const response = await POST(request({ studentId: "nope" }), params());
    expect(response.status).toBe(400);
  });

  it("returns 404 when the class doesn't exist", async () => {
    const { POST } = await import("./route");
    const { withClaims } = await import("@lingua/db");

    const { select, insert } = installTx([], []);
    vi.mocked(withClaims).mockImplementation(async (_claims, cb) =>
      cb({ select, insert } as never),
    );

    const response = await POST(request(validBody), params());
    expect(response.status).toBe(404);
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects when the target user is not a student with 400", async () => {
    const { POST } = await import("./route");
    const { withClaims } = await import("@lingua/db");

    const { select, insert } = installTx([{ id: "class-1" }], []);
    vi.mocked(withClaims).mockImplementation(async (_claims, cb) =>
      cb({ select, insert } as never),
    );

    const response = await POST(request(validBody), params());
    expect(response.status).toBe(400);
    expect(insert).not.toHaveBeenCalled();
  });

  it("adds the student to the roster, scoped to the caller's school", async () => {
    const { POST } = await import("./route");
    const { withClaims } = await import("@lingua/db");

    const { select, insert, insertValues } = installTx(
      [{ id: "class-1" }],
      [{ id: validBody.studentId }],
    );
    vi.mocked(withClaims).mockImplementation(async (_claims, cb) =>
      cb({ select, insert } as never),
    );

    const response = await POST(request(validBody), params());
    expect(response.status).toBe(201);

    const inserted = insertValues.mock.calls[0]![0] as Record<string, unknown>;
    expect(inserted).toEqual({
      classId: "class-1",
      schoolId: "school-1",
      studentId: validBody.studentId,
    });
  });
});
