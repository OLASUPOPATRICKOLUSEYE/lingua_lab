import { beforeEach, describe, expect, it, vi } from "vitest";

const dbInsertValues = vi.fn();
const dbInsert = vi.fn(() => ({ values: dbInsertValues }));

vi.mock("@lingua/db", () => ({
  authCredentials: { userId: "userId" },
  users: { id: "id" },
  db: { insert: dbInsert },
  withClaims: vi.fn(),
}));

vi.mock("@node-rs/argon2", () => ({
  hash: vi.fn().mockResolvedValue("hashed-password"),
}));

vi.mock("@/utils/auth/dal", () => ({
  requireRole: vi.fn(),
  toAuthClaims: vi.fn(() => ({
    sub: "admin-1",
    school_id: "school-1",
    role: "system_admin",
  })),
}));

const validBody = {
  fullName: "New Teacher",
  email: "new.teacher@example.com",
  password: "correct-horse-battery",
};

function request(body: unknown): Request {
  return new Request("http://localhost/api/teachers", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function installUsersInsert(
  behavior: "success" | "duplicate" | "fail",
  id = "new-user-1",
) {
  const returning = vi.fn(async () => {
    if (behavior === "duplicate") throw new Error("unique constraint violated");
    if (behavior === "fail") throw new Error("connection reset");
    return [{ id }];
  });
  const values = vi.fn(() => ({ returning }));
  const insert = vi.fn(() => ({ values }));
  const del = vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) }));
  return { insert, delete: del };
}

describe("POST /api/teachers", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    dbInsertValues.mockResolvedValue(undefined);
    const { requireRole } = await import("@/utils/auth/dal");
    vi.mocked(requireRole).mockResolvedValue({
      id: "admin-1",
      email: "admin@example.com",
      schoolId: "school-1",
      role: "system_admin",
    });
  });

  it("rejects a short password with 400 and never touches the database", async () => {
    const { POST } = await import("./route");
    const { withClaims } = await import("@lingua/db");

    const response = await POST(request({ ...validBody, password: "short" }));

    expect(response.status).toBe(400);
    expect(withClaims).not.toHaveBeenCalled();
  });

  it("returns 400 when the email is already registered", async () => {
    const { POST } = await import("./route");
    const { withClaims } = await import("@lingua/db");

    const tx = installUsersInsert("duplicate");
    vi.mocked(withClaims).mockImplementation(async (_claims, cb) => cb(tx as never));

    const response = await POST(request(validBody));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe("A user with this email already exists.");
  });

  it("rolls back the users row when credential creation fails", async () => {
    const { POST } = await import("./route");
    const { withClaims } = await import("@lingua/db");

    const tx = installUsersInsert("success", "new-user-1");
    vi.mocked(withClaims).mockImplementation(async (_claims, cb) => cb(tx as never));
    dbInsertValues.mockRejectedValueOnce(new Error("connection reset"));

    const response = await POST(request(validBody));

    expect(response.status).toBe(400);
    expect(tx.delete).toHaveBeenCalled();
  });

  it("creates the users row and credentials, returns 201", async () => {
    const { POST } = await import("./route");
    const { withClaims } = await import("@lingua/db");
    const { hash } = await import("@node-rs/argon2");

    const tx = installUsersInsert("success", "new-user-1");
    vi.mocked(withClaims).mockImplementation(async (_claims, cb) => cb(tx as never));

    const response = await POST(request(validBody));
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json).toEqual({
      ok: true,
      teacher: { id: "new-user-1", fullName: "New Teacher", email: "new.teacher@example.com" },
    });

    expect(hash).toHaveBeenCalledWith(validBody.password);
    expect(dbInsertValues).toHaveBeenCalledWith({
      userId: "new-user-1",
      passwordHash: "hashed-password",
    });
  });
});
