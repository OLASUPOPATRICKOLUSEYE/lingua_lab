import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:crypto", () => ({
  randomUUID: vi.fn(() => "activity-1"),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((left: unknown, right: unknown) => ({ type: "eq", left, right })),
}));

vi.mock("@lingua/db", () => ({
  activities: { id: "id" },
  users: { id: "id", fullName: "full_name" },
  withClaims: vi.fn(),
}));

vi.mock("@/utils/auth/dal", () => ({
  requireRole: vi.fn(),
  toAuthClaims: vi.fn(() => ({
    sub: "teacher-1",
    school_id: "school-1",
    role: "teacher",
  })),
}));

const validBody = {
  passageTitle: "La gare du matin",
  targetLanguage: "French",
  passageText:
    "Ce matin, Amina arrive a la gare tres tot et attend son train.",
  coachNote: "Keep the phrases connected.",
};

function request(body: unknown): Request {
  return new Request("http://localhost/api/activities", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** Fake tx: users lookup (select→...→limit) then activities insert. */
function installTx(teacherRow: unknown[]) {
  const insertValues = vi.fn().mockResolvedValue(undefined);
  const insert = vi.fn(() => ({ values: insertValues }));
  const limit = vi.fn().mockResolvedValue(teacherRow);
  return { insert, insertValues, limit };
}

describe("POST /api/activities", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { requireRole } = await import("@/utils/auth/dal");
    vi.mocked(requireRole).mockResolvedValue({
      id: "teacher-1",
      email: "teacher@example.com",
      schoolId: "school-1",
      role: "teacher",
    });
  });

  it("rejects a short passage with 400 and never writes", async () => {
    const { POST } = await import("./route");
    const { withClaims } = await import("@lingua/db");

    const response = await POST(request({ ...validBody, passageText: "tiny" }));

    expect(response.status).toBe(400);
    expect(withClaims).not.toHaveBeenCalled();
  });

  // The picker now spans every language Whisper can transcribe, so the guard is
  // "is this a language we recognise", not "is it English or French".
  it("rejects a language outside the registry with 400", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      request({ ...validBody, targetLanguage: "Klingon" }),
    );
    expect(response.status).toBe(400);
  });

  it("accepts a low-resource language that the registry supports", async () => {
    const { POST } = await import("./route");
    installTx([
      { id: "school-1" },
    ]);
    const response = await POST(
      request({ ...validBody, targetLanguage: "Yoruba" }),
    );
    expect(response.status).not.toBe(400);
  });

  it("creates the activity owned by the caller and returns 201", async () => {
    const { POST } = await import("./route");
    const { withClaims } = await import("@lingua/db");

    const { insert, insertValues, limit } = installTx([
      { fullName: "Mme Moreau" },
    ]);
    vi.mocked(withClaims).mockImplementation(async (_claims, cb) => {
      const tx = {
        select: () => ({ from: () => ({ where: () => ({ limit }) }) }),
        insert,
      };
      return cb(tx as never);
    });

    const response = await POST(request(validBody));
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json).toEqual({
      ok: true,
      activity: { id: "activity-1", title: "La gare du matin" },
    });

    // Ownership + tenant come from the SESSION, never the request body.
    const inserted = insertValues.mock.calls[0]![0] as Record<string, unknown>;
    expect(inserted.teacherId).toBe("teacher-1");
    expect(inserted.schoolId).toBe("school-1");
    expect(inserted.teacherName).toBe("Mme Moreau");
    expect(inserted.targetLanguage).toBe("French");
  });

  it("falls back to the caller email when the user row has no name", async () => {
    const { POST } = await import("./route");
    const { withClaims } = await import("@lingua/db");

    const { insert, insertValues, limit } = installTx([]);
    vi.mocked(withClaims).mockImplementation(async (_claims, cb) => {
      const tx = {
        select: () => ({ from: () => ({ where: () => ({ limit }) }) }),
        insert,
      };
      return cb(tx as never);
    });

    await POST(request(validBody));
    const inserted = insertValues.mock.calls[0]![0] as Record<string, unknown>;
    expect(inserted.teacherName).toBe("teacher@example.com");
  });
});
