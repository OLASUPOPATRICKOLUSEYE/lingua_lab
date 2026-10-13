import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@lingua/db", () => ({
  activities: { id: "id" },
  submissions: { id: "id" },
  submissionProcessingStates: { submissionId: "submission_id" },
  withClaims: vi.fn(),
}));

vi.mock("next/dist/client/components/redirect-error", () => ({
  isRedirectError: vi.fn(() => false),
}));

vi.mock("@/utils/auth/dal", () => ({
  verifySession: vi.fn(),
  toAuthClaims: vi.fn(() => ({
    sub: "33333333-3333-3333-3333-333333333333",
    school_id: "11111111-1111-1111-1111-111111111111",
    role: "student",
  })),
}));

vi.mock("@/utils/storage/s3", () => ({
  writeChunkToLocalUpload: vi.fn(),
  assembleS3Upload: vi.fn(),
  removeLocalUpload: vi.fn(),
  removeLocalChunkUpload: vi.fn(),
}));

vi.mock("@/server/queues/normalization", () => ({
  enqueueNormalizationJob: vi.fn(),
}));

vi.mock("@/server/uploads/finalize-upload", () => ({
  finalizeUpload: vi.fn(),
}));

vi.mock("@/utils/student/assignment-data", () => ({
  getStudentAssignmentForStudent: vi.fn(),
  resolveAssignmentIdForSubmission: vi.fn(),
}));

const session = {
  id: "33333333-3333-3333-3333-333333333333",
  email: "student@example.com",
  schoolId: "11111111-1111-1111-1111-111111111111",
  role: "student" as const,
};

function makeRequest(formData: FormData): Request {
  return new Request("http://localhost/api/submissions/upload", {
    method: "POST",
    body: formData,
  });
}

function makeFormData(overrides: Partial<Record<string, string | File>> = {}): FormData {
  const formData = new FormData();
  formData.set("uploadId", "44444444-4444-4444-8444-444444444444");
  formData.set("activityId", "activity-1");
  formData.set("takeId", "55555555-5555-5555-8555-555555555555");
  formData.set("chunkIndex", "0");
  formData.set("totalChunks", "2");
  formData.set("fileName", "attempt.webm");
  formData.set("mimeType", "audio/webm");
  formData.set("durationMs", "12000");
  formData.set(
    "chunk",
    new File([Buffer.from("test-audio")], "attempt.webm", {
      type: "audio/webm",
    }),
  );

  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) {
      formData.set(key, value);
    }
  }

  return formData;
}

describe("POST /api/submissions/upload", () => {
  const originalAiServiceUrl = process.env.AI_SERVICE_URL;

  beforeEach(async () => {
    vi.resetModules();
    process.env.AI_SERVICE_URL = "";

    const { verifySession } = await import("@/utils/auth/dal");
    vi.mocked(verifySession).mockResolvedValue(session);

    const { getStudentAssignmentForStudent } = await import(
      "@/utils/student/assignment-data"
    );
    vi.mocked(getStudentAssignmentForStudent).mockResolvedValue({
      id: "31e13444-e963-50e8-b17d-f0f0c6c3a4fe",
    } as never);
  });

  afterEach(() => {
    process.env.AI_SERVICE_URL = originalAiServiceUrl;
    vi.clearAllMocks();
  });

  it("returns 202 for non-final chunks and writes the chunk", async () => {
    const { POST } = await import("./route");
    const { writeChunkToLocalUpload } = await import("@/utils/storage/s3");

    const response = await POST(makeRequest(makeFormData()));
    const json = await response.json();

    expect(response.status).toBe(202);
    expect(json).toEqual({
      ok: true,
      uploadId: "44444444-4444-4444-8444-444444444444",
      chunkIndex: 0,
      totalChunks: 2,
    });
    expect(writeChunkToLocalUpload).toHaveBeenCalledOnce();
  });

  it("cleans staged chunks when the activity is not assigned anymore", async () => {
    const { POST } = await import("./route");
    const { getStudentAssignmentForStudent } = await import(
      "@/utils/student/assignment-data"
    );
    const { writeChunkToLocalUpload, removeLocalChunkUpload } = await import(
      "@/utils/storage/s3"
    );

    vi.mocked(getStudentAssignmentForStudent).mockResolvedValue(null);

    const response = await POST(makeRequest(makeFormData()));
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json).toEqual({ error: "Unknown activity for this school." });
    expect(writeChunkToLocalUpload).not.toHaveBeenCalled();
    expect(removeLocalChunkUpload).toHaveBeenCalledWith(
      "44444444-4444-4444-8444-444444444444",
    );
  });

  it("returns 201 for the final chunk and reports manual review when AI is disabled", async () => {
    const { POST } = await import("./route");
    const { finalizeUpload } = await import("@/server/uploads/finalize-upload");

    vi.mocked(finalizeUpload).mockResolvedValue({
      submissionId: "66666666-6666-6666-6666-666666666666",
      rawStoragePath:
        "raw/11111111-1111-1111-1111-111111111111/31e13444-e963-50e8-b17d-f0f0c6c3a4fe/33333333-3333-3333-3333-333333333333/66666666-6666-6666-6666-666666666666.webm",
    });

    const response = await POST(
      makeRequest(
        makeFormData({
          chunkIndex: "1",
          totalChunks: "2",
        }),
      ),
    );
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json).toEqual({
      ok: true,
      submissionId: "66666666-6666-6666-6666-666666666666",
      status: "pending",
      manualReview: true,
    });
    expect(finalizeUpload).toHaveBeenCalledOnce();
    expect(finalizeUpload).toHaveBeenCalledWith(
      expect.objectContaining({ mediaType: "audio" }),
      expect.anything(),
    );
  });

  // The container extension cannot answer audio-vs-video (audio/webm and
  // video/webm are both ".webm"), so the MIME type must be what decides — and
  // it has to survive all the way to the submission row, or the teacher's
  // review has no way to know it should render a picture.
  it.each([
    ["video/webm;codecs=vp9,opus", "video"],
    ["video/mp4", "video"],
    ["audio/webm;codecs=opus", "audio"],
    ["audio/mp4", "audio"],
  ])("records %s as mediaType %s", async (mimeType, expectedMediaType) => {
    const { POST } = await import("./route");
    const { finalizeUpload } = await import("@/server/uploads/finalize-upload");

    vi.mocked(finalizeUpload).mockResolvedValue({
      submissionId: "66666666-6666-6666-6666-666666666666",
      rawStoragePath:
        "raw/11111111-1111-1111-1111-111111111111/31e13444-e963-50e8-b17d-f0f0c6c3a4fe/33333333-3333-3333-3333-333333333333/66666666-6666-6666-6666-666666666666.webm",
    });

    const response = await POST(
      makeRequest(
        makeFormData({ chunkIndex: "1", totalChunks: "2", mimeType }),
      ),
    );

    expect(response.status).toBe(201);
    expect(finalizeUpload).toHaveBeenCalledWith(
      expect.objectContaining({ mediaType: expectedMediaType }),
      expect.anything(),
    );
  });

  it("maps missing-chunk finalization errors to 400", async () => {
    const { POST } = await import("./route");
    const { finalizeUpload } = await import("@/server/uploads/finalize-upload");
    const { removeLocalChunkUpload } = await import("@/utils/storage/s3");

    vi.mocked(finalizeUpload).mockRejectedValue(
      new Error("Missing chunk 2 of 2."),
    );

    const response = await POST(
      makeRequest(
        makeFormData({
          chunkIndex: "1",
          totalChunks: "2",
        }),
      ),
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toEqual({
      error: "Missing chunk 2 of 2.",
    });
    expect(removeLocalChunkUpload).toHaveBeenCalledWith(
      "44444444-4444-4444-8444-444444444444",
    );
  });

  it("rejects a final chunk for an unknown activity with 404", async () => {
    const { POST } = await import("./route");
    const { getStudentAssignmentForStudent } = await import(
      "@/utils/student/assignment-data"
    );
    const { finalizeUpload } = await import("@/server/uploads/finalize-upload");

    vi.mocked(getStudentAssignmentForStudent).mockResolvedValue(null);

    const response = await POST(
      makeRequest(
        makeFormData({
          chunkIndex: "1",
          totalChunks: "2",
        }),
      ),
    );
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json).toEqual({ error: "Unknown activity for this school." });
    expect(finalizeUpload).not.toHaveBeenCalled();
  });

  it("rejects unsupported mime types before upload finalization", async () => {
    const { POST } = await import("./route");
    const { finalizeUpload } = await import("@/server/uploads/finalize-upload");

    const response = await POST(
      makeRequest(
        makeFormData({
          mimeType: "audio/flac",
          totalChunks: "1",
        }),
      ),
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toEqual({
      error: "Unsupported audio mime type: audio/flac",
    });
    expect(finalizeUpload).not.toHaveBeenCalled();
  });
});
