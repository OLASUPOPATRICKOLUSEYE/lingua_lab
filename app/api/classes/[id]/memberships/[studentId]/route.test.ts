import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((left: unknown, right: unknown) => ({ type: "eq", left, right })),
  and: vi.fn((...conditions: unknown[]) => ({ type: "and", conditions })),
}));

vi.mock("@lingua/db", () => ({
  classMemberships: { classId: "class_id", studentId: "student_id" },
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

function params(id = "class-1", studentId = "student-1") {
  return { params: Promise.resolve({ id, studentId }) };
}

describe("DELETE /api/classes/[id]/memberships/[studentId]", () => {
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

  it("returns 404 when the student isn't on the roster", async () => {
    const { DELETE } = await import("./route");
    const { withClaims } = await import("@lingua/db");

    const returning = vi.fn().mockResolvedValue([]);
    const del = vi.fn(() => ({ where: () => ({ returning }) }));
    vi.mocked(withClaims).mockImplementation(async (_claims, cb) =>
      cb({ delete: del } as never),
    );

    const response = await DELETE(new Request("http://localhost"), params());
    expect(response.status).toBe(404);
  });

  it("removes the membership and returns ok", async () => {
    const { DELETE } = await import("./route");
    const { withClaims } = await import("@lingua/db");

    const returning = vi.fn().mockResolvedValue([{ studentId: "student-1" }]);
    const del = vi.fn(() => ({ where: () => ({ returning }) }));
    vi.mocked(withClaims).mockImplementation(async (_claims, cb) =>
      cb({ delete: del } as never),
    );

    const response = await DELETE(new Request("http://localhost"), params());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true });
  });
});
