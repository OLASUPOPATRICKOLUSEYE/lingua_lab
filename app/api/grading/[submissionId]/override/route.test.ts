import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:crypto", () => ({
  randomUUID: vi.fn(() => "grade-1"),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((left: unknown, right: unknown) => ({ type: "eq", left, right })),
  and: vi.fn((...conditions: unknown[]) => ({ type: "and", conditions })),
  or: vi.fn((...conditions: unknown[]) => ({ type: "or", conditions })),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      type: "sql",
      strings: [...strings],
      values,
    }),
    { raw: (value: unknown) => ({ type: "sql.raw", value }) },
  ),
}));

vi.mock("@lingua/db", () => ({
  activities: {
    id: "activity_id",
    teacherId: "teacher_id",
  },
  gradingResults: {
    id: "id",
  },
  submissions: {
    id: "id",
    activityId: "activity_id",
    schoolId: "school_id",
    assignmentId: "assignment_id",
  },
  submissionProcessingStates: {
    submissionId: "submission_id",
    schoolId: "school_id",
  },
  withClaims: vi.fn(),
}));

vi.mock("@/server/grading/manual-review", () => ({
  getNextManualModelVersion: vi.fn(),
}));

vi.mock("@/utils/auth/dal", () => ({
  requireRole: vi.fn(),
  toAuthClaims: vi.fn(() => ({
    sub: "teacher-1",
    school_id: "school-1",
    role: "teacher",
  })),
}));

describe("POST /api/grading/[submissionId]/override", () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    const { requireRole } = await import("@/utils/auth/dal");
    const { getNextManualModelVersion } = await import("@/server/grading/manual-review");

    vi.mocked(requireRole).mockResolvedValue({
      id: "teacher-1",
      email: "teacher@example.com",
      schoolId: "school-1",
      role: "teacher",
    });
    vi.mocked(getNextManualModelVersion).mockResolvedValue("manual-v2");
  });

  it("rejects invalid payloads", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/grading/submission-1/override", {
        method: "POST",
        body: JSON.stringify({
          fluencyScore: 101,
          pronunciationScore: 50,
          cefrEstimate: "B1",
          justification: "too short",
        }),
      }),
      { params: Promise.resolve({ submissionId: "submission-1" }) },
    );

    expect(response.status).toBe(400);
  });

  it("appends a grading result and marks processing state graded", async () => {
    const { POST } = await import("./route");
    const { withClaims } = await import("@lingua/db");

    const insertValues = vi.fn().mockResolvedValue(undefined);
    const insert = vi.fn(() => ({ values: insertValues }));
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const updateSet = vi.fn(() => ({ where: updateWhere }));
    const update = vi.fn(() => ({ set: updateSet }));
    const limit = vi.fn().mockResolvedValue([
      {
        id: "submission-1",
        schoolId: "school-1",
      },
    ]);

    vi.mocked(withClaims).mockImplementation(async (_claims, callback) => {
      const tx = {
        select: () => ({
          from: () => ({
            innerJoin: () => ({
              where: () => ({
                limit,
              }),
            }),
            where: () => ({
              orderBy: () => ({
                limit,
              }),
              limit,
            }),
          }),
        }),
        insert,
        update,
      };

      return callback(tx as never);
    });

    const response = await POST(
      new Request("http://localhost/api/grading/submission-1/override", {
        method: "POST",
        body: JSON.stringify({
          fluencyScore: 84,
          pronunciationScore: 79,
          cefrEstimate: "B2",
          justification: "Teacher reviewed against the rubric and confirmed the corrected score.",
        }),
      }),
      { params: Promise.resolve({ submissionId: "submission-1" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true, modelVersion: "manual-v2" });
    expect(insertValues).toHaveBeenCalledWith({
      id: "grade-1",
      schoolId: "school-1",
      submissionId: "submission-1",
      transcript: null,
      phonemeScores: null,
      wordTimestamps: null,
      wpm: null,
      wer: null,
      fluencyScore: 84,
      pronunciationScore: 79,
      cefrEstimate: "B2",
      modelVersion: "manual-v2",
      overrideJustification:
        "Teacher reviewed against the rubric and confirmed the corrected score.",
      reviewedBy: "teacher-1",
    });
    expect(updateSet).toHaveBeenCalledWith({ status: "graded" });
    expect(updateWhere).toHaveBeenCalledOnce();
  });
});
