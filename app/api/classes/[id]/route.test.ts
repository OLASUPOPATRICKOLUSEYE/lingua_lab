import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((left: unknown, right: unknown) => ({ type: "eq", left, right })),
  and: vi.fn((...conditions: unknown[]) => ({ type: "and", conditions })),
}));

vi.mock("@lingua/db", () => ({
  classes: { id: "id", name: "name", teacherId: "teacher_id" },
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

function request(body: unknown): Request {
  return new Request("http://localhost/api/classes/class-1", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

function params(id = "class-1") {
  return { params: Promise.resolve({ id }) };
}

describe("PATCH /api/classes/[id]", () => {
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

  it("rejects an empty payload with 400 and never writes", async () => {
    const { PATCH } = await import("./route");
    const { withClaims } = await import("@lingua/db");

    const response = await PATCH(request({}), params());

    expect(response.status).toBe(400);
    expect(withClaims).not.toHaveBeenCalled();
  });

  it("rejects reassignment to a non-teacher user with 400", async () => {
    const { PATCH } = await import("./route");
    const { withClaims } = await import("@lingua/db");

    const limit = vi.fn().mockResolvedValue([]);
    const select = vi.fn(() => ({ from: () => ({ where: () => ({ limit }) }) }));
    const update = vi.fn();
    vi.mocked(withClaims).mockImplementation(async (_claims, cb) =>
      cb({ select, update } as never),
    );

    const response = await PATCH(
      request({ teacherId: "22222222-2222-2222-2222-222222222222" }),
      params(),
    );

    expect(response.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it("returns 404 when the class doesn't exist", async () => {
    const { PATCH } = await import("./route");
    const { withClaims } = await import("@lingua/db");

    const returning = vi.fn().mockResolvedValue([]);
    const update = vi.fn(() => ({ set: () => ({ where: () => ({ returning }) }) }));
    vi.mocked(withClaims).mockImplementation(async (_claims, cb) =>
      cb({ update } as never),
    );

    const response = await PATCH(request({ name: "Renamed" }), params());
    expect(response.status).toBe(404);
  });

  it("renames the class and returns the updated row", async () => {
    const { PATCH } = await import("./route");
    const { withClaims } = await import("@lingua/db");

    const returning = vi
      .fn()
      .mockResolvedValue([{ id: "class-1", name: "Renamed", teacherId: "teacher-1" }]);
    const update = vi.fn(() => ({ set: () => ({ where: () => ({ returning }) }) }));
    vi.mocked(withClaims).mockImplementation(async (_claims, cb) =>
      cb({ update } as never),
    );

    const response = await PATCH(request({ name: "Renamed" }), params());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      ok: true,
      class: { id: "class-1", name: "Renamed", teacherId: "teacher-1" },
    });
  });
});
