import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((left: unknown, right: unknown) => ({ type: "eq", left, right })),
  and: vi.fn((...conditions: unknown[]) => ({ type: "and", conditions })),
  or: vi.fn((...conditions: unknown[]) => ({ type: "or", conditions })),
  desc: vi.fn((value: unknown) => ({ type: "desc", value })),
  sql: Object.assign(
    vi.fn(() => ({ type: "sql" })),
    { raw: vi.fn() },
  ),
}));

vi.mock("@lingua/db", () => ({
  activities: { id: "activity_id", teacherId: "teacher_id" },
  gradingResults: { submissionId: "submission_id", schoolId: "school_id", gradedAt: "graded_at" },
  submissionProcessingStates: { submissionId: "submission_id", processedPath: "processed_path", status: "status" },
  submissions: { id: "id", studentId: "student_id", activityId: "activity_id", rawStoragePath: "raw_storage_path", submittedAt: "submitted_at" },
  withClaims: vi.fn(),
}));

const verifySession = vi.fn();
vi.mock("@/utils/auth/dal", () => ({
  verifySession: () => verifySession(),
  toAuthClaims: vi.fn(() => ({ sub: "u", school_id: "school-1", role: "student" })),
}));

function params() {
  return { params: Promise.resolve({ id: "11111111-1111-4111-8111-000000000001" }) };
}

/**
 * withClaims fake: capture the filter passed to the FIRST `.where()` (the
 * submission scope) so we can assert student self-scoping, and drive the two
 * selects (submission row, latest grade).
 */
function installTx(submissionRow: unknown[], gradeRow: unknown[]) {
  const whereSpy = vi.fn();
  const limit = vi
    .fn()
    .mockResolvedValueOnce(submissionRow)
    .mockResolvedValueOnce(gradeRow);
  const tx = {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          leftJoin: () => ({
            where: (cond: unknown) => {
              whereSpy(cond);
              return { limit };
            },
          }),
        }),
        where: (cond: unknown) => {
          whereSpy(cond);
          return { orderBy: () => ({ limit }) };
        },
      }),
    }),
  };
  return { tx, whereSpy };
}

const SUBMISSION = {
  id: "11111111-1111-4111-8111-000000000001",
  activityId: "act-1",
  status: "graded",
  submittedAt: new Date("2026-07-06T10:00:00Z"),
  rawStoragePath: "raw/school-1/act-1/student-1/sub-1.webm",
  processedPath: "processed/school-1/act-1/student-1/sub-1.wav",
};

describe("GET /api/submissions/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("404s when the submission is not visible under the caller's scope", async () => {
    verifySession.mockResolvedValue({ id: "student-1", email: "s@x", schoolId: "school-1", role: "student" });
    const { GET } = await import("./route");
    const { withClaims } = await import("@lingua/db");
    const { tx } = installTx([], []);
    vi.mocked(withClaims).mockImplementation(async (_c, cb) => cb(tx as never));

    const response = await GET(new Request("http://localhost"), params());
    expect(response.status).toBe(404);
  });

  it("scopes a STUDENT to their own submissions (studentId filter present)", async () => {
    verifySession.mockResolvedValue({ id: "student-1", email: "s@x", schoolId: "school-1", role: "student" });
    const { GET } = await import("./route");
    const { withClaims } = await import("@lingua/db");
    const { tx, whereSpy } = installTx([SUBMISSION], []);
    vi.mocked(withClaims).mockImplementation(async (_c, cb) => cb(tx as never));

    await GET(new Request("http://localhost"), params());

    // The submission filter is an `and(...)` combining id AND studentId.
    const filter = whereSpy.mock.calls[0]![0] as { type: string; conditions?: unknown[] };
    expect(filter.type).toBe("and");
    expect(JSON.stringify(filter)).toContain("student_id");
  });

  it("scopes a TEACHER to their own activity ownership", async () => {
    verifySession.mockResolvedValue({ id: "teacher-1", email: "t@x", schoolId: "school-1", role: "teacher" });
    const { GET } = await import("./route");
    const { withClaims } = await import("@lingua/db");
    const { tx, whereSpy } = installTx([SUBMISSION], []);
    vi.mocked(withClaims).mockImplementation(async (_c, cb) => cb(tx as never));

    await GET(new Request("http://localhost"), params());

    const filter = whereSpy.mock.calls[0]![0] as { type: string };
    expect(filter.type).toBe("and");
    expect(JSON.stringify(filter)).toContain("teacher_id");
  });

  it("never leaks internal storage paths; exposes only media URLs", async () => {
    verifySession.mockResolvedValue({ id: "teacher-1", email: "t@x", schoolId: "school-1", role: "teacher" });
    const { GET } = await import("./route");
    const { withClaims } = await import("@lingua/db");
    const { tx } = installTx([SUBMISSION], []);
    vi.mocked(withClaims).mockImplementation(async (_c, cb) => cb(tx as never));

    const response = await GET(new Request("http://localhost"), params());
    const json = await response.json();
    const serialized = JSON.stringify(json);

    expect(response.status).toBe(200);
    expect(serialized).not.toContain("raw/school-1");
    expect(serialized).not.toContain("processed/school-1");
    expect(json.submission.rawStoragePath).toBeUndefined();
    expect(json.submission.processedPath).toBeUndefined();
    expect(json.submission.rawMediaUrl).toBe("/api/submissions/11111111-1111-4111-8111-000000000001/media?kind=raw");
    expect(json.submission.processedMediaUrl).toBe(
      "/api/submissions/11111111-1111-4111-8111-000000000001/media?kind=processed",
    );
  });
});
