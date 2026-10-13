import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  submissions: {
    id: "id",
    schoolId: "school_id",
    studentId: "student_id",
    activityId: "activity_id",
    assignmentId: "assignment_id",
  },
  submissionProcessingStates: {
    submissionId: "submission_id",
    schoolId: "school_id",
    processedPath: "processed_path",
  },
  withClaims: vi.fn(),
}));

vi.mock("@/server/queues/grading", () => ({
  enqueueGradingJob: vi.fn(),
}));

vi.mock("@/utils/auth/dal", () => ({
  requireRole: vi.fn(),
  toAuthClaims: vi.fn(() => ({
    sub: "teacher-1",
    school_id: "school-1",
    role: "teacher",
  })),
}));

describe("POST /api/grading/[submissionId]/regrade", () => {
  const originalAiServiceUrl = process.env.AI_SERVICE_URL;

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.AI_SERVICE_URL = "http://ai.internal";

    const { requireRole } = await import("@/utils/auth/dal");
    vi.mocked(requireRole).mockResolvedValue({
      id: "teacher-1",
      email: "teacher@example.com",
      schoolId: "school-1",
      role: "teacher",
    });
  });

  afterEach(() => {
    process.env.AI_SERVICE_URL = originalAiServiceUrl;
  });

  it("does not mark the submission processing when enqueue fails", async () => {
    const { POST } = await import("./route");
    const { withClaims } = await import("@lingua/db");
    const { enqueueGradingJob } = await import("@/server/queues/grading");

    const update = vi.fn();
    vi.mocked(withClaims).mockImplementationOnce(async (_claims, callback) => {
      const tx = {
        select: () => ({
          from: () => ({
            innerJoin: () => ({
              innerJoin: () => ({
                where: () => ({
                  limit: async () => [
                    {
                      id: "11111111-1111-4111-8111-000000000001",
                      schoolId: "school-1",
                      studentId: "student-1",
                      activityId: "activity-1",
                      processedPath: "processed/file.wav",
                    },
                  ],
                }),
              }),
            }),
          }),
        }),
        update,
      };

      return callback(tx as never);
    });
    vi.mocked(enqueueGradingJob).mockRejectedValue(new Error("redis down"));

    await expect(
      POST(new Request("http://localhost/api/grading/submission-1/regrade", { method: "POST" }), {
        params: Promise.resolve({ submissionId: "11111111-1111-4111-8111-000000000001" }),
      }),
    ).rejects.toThrow("redis down");

    expect(withClaims).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
  });

  it("marks the submission processing only after enqueue succeeds", async () => {
    const { POST } = await import("./route");
    const { withClaims } = await import("@lingua/db");
    const { enqueueGradingJob } = await import("@/server/queues/grading");

    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const updateSet = vi.fn(() => ({ where: updateWhere }));
    const update = vi.fn(() => ({ set: updateSet }));

    vi.mocked(withClaims)
      .mockImplementationOnce(async (_claims, callback) => {
        const tx = {
          select: () => ({
            from: () => ({
              innerJoin: () => ({
                innerJoin: () => ({
                  where: () => ({
                    limit: async () => [
                      {
                        id: "11111111-1111-4111-8111-000000000001",
                        schoolId: "school-1",
                        studentId: "student-1",
                        activityId: "activity-1",
                        processedPath: "processed/file.wav",
                      },
                    ],
                  }),
                }),
              }),
            }),
          }),
        };

        return callback(tx as never);
      })
      .mockImplementationOnce(async (_claims, callback) => {
        const tx = { update };
        return callback(tx as never);
      });
    vi.mocked(enqueueGradingJob).mockResolvedValue(undefined);

    const response = await POST(
      new Request("http://localhost/api/grading/submission-1/regrade", { method: "POST" }),
      {
        params: Promise.resolve({ submissionId: "11111111-1111-4111-8111-000000000001" }),
      },
    );
    const json = await response.json();

    expect(response.status).toBe(202);
    expect(json).toEqual({ ok: true, status: "processing" });
    expect(enqueueGradingJob).toHaveBeenCalledWith({
      submissionId: "11111111-1111-4111-8111-000000000001",
      schoolId: "school-1",
      studentId: "student-1",
      activityId: "activity-1",
      processedPath: "processed/file.wav",
    });
    expect(update).toHaveBeenCalledOnce();
    expect(updateSet).toHaveBeenCalledWith({ status: "processing" });
    expect(updateWhere).toHaveBeenCalledOnce();
  });
});
