import { beforeEach, describe, expect, it, vi } from "vitest";

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
    studentId: "student_id",
    activityId: "activity_id",
    rawStoragePath: "raw_storage_path",
    assignmentId: "assignment_id",
  },
  submissionProcessingStates: {
    submissionId: "submission_id",
    processedPath: "processed_path",
  },
  withClaims: vi.fn(),
}));

vi.mock("@/utils/auth/dal", () => ({
  verifySession: vi.fn(),
  toAuthClaims: vi.fn(() => ({
    sub: "student-1",
    school_id: "school-1",
    role: "student",
  })),
}));

vi.mock("@/utils/storage/s3", () => ({
  getPresignedDownloadUrl: vi.fn(),
  // These cases assert the OBJECT-STORE behaviour (presigned redirect), which
  // is what every real deployment runs. The local-filesystem branch is covered
  // by utils/storage/storage-local.test.ts.
  isLocalStorage: vi.fn(() => false),
}));

vi.mock("@/utils/storage/serve-local-media", () => ({
  serveLocalMedia: vi.fn(),
}));

const FAKE_PRESIGNED_URL =
  "https://s3.example.com/bucket/path?X-Amz-Signature=fake&X-Amz-Expires=3600";

describe("GET /api/submissions/[id]/media", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("restricts student requests to their own submission", async () => {
    const { GET } = await import("./route");
    const { getPresignedDownloadUrl } = await import("@/utils/storage/s3");
    const { verifySession } = await import("@/utils/auth/dal");
    const { withClaims } = await import("@lingua/db");

    vi.mocked(verifySession).mockResolvedValue({
      id: "student-1",
      email: "student@example.com",
      schoolId: "school-1",
      role: "student",
    });
    vi.mocked(getPresignedDownloadUrl).mockResolvedValue(FAKE_PRESIGNED_URL);

    let capturedFilter: unknown;
    vi.mocked(withClaims).mockImplementation(async (_claims, callback) => {
      const tx = {
        select: () => ({
          from: () => ({
            innerJoin: () => ({
              leftJoin: () => ({
                where: (filter: unknown) => {
                  capturedFilter = filter;
                  return {
                    limit: async () => [
                      {
                        rawStoragePath: "raw/school-1/course-1/student-1/submission-1.webm",
                        processedPath:
                          "processed/school-1/course-1/student-1/submission-1.wav",
                      },
                    ],
                  };
                },
              }),
            }),
          }),
        }),
      };

      return callback(tx as never);
    });

    const response = await GET(new Request("http://localhost/api/submissions/1/media?kind=raw"), {
      params: Promise.resolve({ id: "11111111-1111-4111-8111-000000000001" }),
    });

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(FAKE_PRESIGNED_URL);
    // ?kind=raw → presigned URL is generated for the raw storage path.
    expect(getPresignedDownloadUrl).toHaveBeenCalledWith(
      "raw/school-1/course-1/student-1/submission-1.webm",
      3600,
    );
    expect(capturedFilter).toEqual({
      type: "and",
      conditions: [
        { type: "eq", left: "id", right: "11111111-1111-4111-8111-000000000001" },
        { type: "eq", left: "student_id", right: "student-1" },
      ],
    });
  });

  it("scopes teacher review access to teacher-owned activities", async () => {
    const { GET } = await import("./route");
    const { getPresignedDownloadUrl } = await import("@/utils/storage/s3");
    const { verifySession } = await import("@/utils/auth/dal");
    const { withClaims } = await import("@lingua/db");

    vi.mocked(verifySession).mockResolvedValue({
      id: "teacher-1",
      email: "teacher@example.com",
      schoolId: "school-1",
      role: "teacher",
    });
    vi.mocked(getPresignedDownloadUrl).mockResolvedValue(FAKE_PRESIGNED_URL);

    let capturedFilter: unknown;
    vi.mocked(withClaims).mockImplementation(async (_claims, callback) => {
      const tx = {
        select: () => ({
          from: () => ({
            innerJoin: () => ({
              leftJoin: () => ({
                where: (filter: unknown) => {
                  capturedFilter = filter;
                  return {
                    limit: async () => [
                      {
                        rawStoragePath: "raw/school-1/course-1/student-2/submission-2.webm",
                        processedPath:
                          "processed/school-1/course-1/student-2/submission-2.wav",
                      },
                    ],
                  };
                },
              }),
            }),
          }),
        }),
      };

      return callback(tx as never);
    });

    const response = await GET(new Request("http://localhost/api/submissions/2/media"), {
      params: Promise.resolve({ id: "11111111-1111-4111-8111-000000000002" }),
    });

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(FAKE_PRESIGNED_URL);
    // No ?kind param defaults to "processed" → presigned URL is generated for the processed path.
    expect(getPresignedDownloadUrl).toHaveBeenCalledWith(
      "processed/school-1/course-1/student-2/submission-2.wav",
      3600,
    );
    expect(capturedFilter).toEqual({
      type: "and",
      conditions: [
        { type: "eq", left: "id", right: "11111111-1111-4111-8111-000000000002" },
        {
          type: "or",
          conditions: [
            { type: "eq", left: "teacher_id", right: "teacher-1" },
            expect.objectContaining({ type: "sql" }),
          ],
        },
      ],
    });
  });

  // Dev without an object store: there is no presigned URL to redirect to, so
  // the route must serve the bytes itself. Getting this wrong is invisible in
  // production and breaks every media surface locally.
  it("streams the file instead of redirecting when storage is local", async () => {
    const { GET } = await import("./route");
    const { isLocalStorage, getPresignedDownloadUrl } = await import(
      "@/utils/storage/s3"
    );
    const { serveLocalMedia } = await import("@/utils/storage/serve-local-media");
    const { verifySession } = await import("@/utils/auth/dal");
    const { withClaims } = await import("@lingua/db");

    vi.mocked(isLocalStorage).mockReturnValue(true);
    vi.mocked(serveLocalMedia).mockResolvedValue(
      new Response("bytes", { status: 200 }) as never,
    );
    vi.mocked(verifySession).mockResolvedValue({
      id: "student-1",
      schoolId: "school-1",
      role: "student",
    } as never);
    vi.mocked(withClaims).mockImplementation(async (_claims, callback) => {
      const tx = {
        select: () => ({
          from: () => ({
            innerJoin: () => ({
              leftJoin: () => ({
                where: () => ({
                  limit: () => [
                    {
                      rawStoragePath: "raw/school-1/course-1/student-1/sub-1.webm",
                      processedPath: null,
                    },
                  ],
                }),
              }),
            }),
          }),
        }),
      };
      return callback(tx as never);
    });

    const response = await GET(
      new Request("http://localhost/api/submissions/sub-1/media?kind=raw"),
      { params: Promise.resolve({ id: "11111111-1111-4111-8111-000000000001" }) },
    );

    expect(response.status).toBe(200);
    expect(serveLocalMedia).toHaveBeenCalledWith(
      "raw/school-1/course-1/student-1/sub-1.webm",
      expect.anything(),
    );
    expect(getPresignedDownloadUrl).not.toHaveBeenCalled();
  });
});
