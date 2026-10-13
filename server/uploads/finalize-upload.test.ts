import { describe, expect, it, vi } from "vitest";
import { finalizeUpload, type UploadSession } from "./finalize-upload";

const session: UploadSession = {
  id: "33333333-3333-3333-3333-333333333333",
  schoolId: "11111111-1111-1111-1111-111111111111",
};

describe("finalizeUpload", () => {
  it("assembles, inserts, and enqueues the normalization job", async () => {
    const assembleLocalUpload = vi.fn().mockResolvedValue(undefined);
    const insertSubmission = vi.fn().mockResolvedValue(undefined);
    const enqueueNormalizationJob = vi.fn().mockResolvedValue(undefined);
    const markSubmissionFailed = vi.fn().mockResolvedValue(undefined);
    const removeLocalUpload = vi.fn().mockResolvedValue(undefined);

    const result = await finalizeUpload(
      {
        session,
        activityId: "22222222-2222-2222-2222-222222222222",
        assignmentId: "66666666-6666-6666-6666-666666666666",
        extension: "webm",
        mediaType: "video",
        uploadId: "44444444-4444-4444-4444-444444444444",
        totalChunks: 3,
      },
      {
        assembleLocalUpload,
        insertSubmission,
        enqueueNormalizationJob,
        markSubmissionFailed,
        removeLocalUpload,
        createSubmissionId: () => "55555555-5555-5555-5555-555555555555",
      },
    );

    expect(result).toEqual({
      submissionId: "55555555-5555-5555-5555-555555555555",
      rawStoragePath:
        "raw/11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222/33333333-3333-3333-3333-333333333333/55555555-5555-5555-5555-555555555555.webm",
    });
    expect(assembleLocalUpload).toHaveBeenCalledWith({
      uploadId: "44444444-4444-4444-4444-444444444444",
      totalChunks: 3,
      destinationRelativePath: result.rawStoragePath,
    });
    expect(insertSubmission).toHaveBeenCalledWith({
      submissionId: result.submissionId,
      schoolId: session.schoolId,
      studentId: session.id,
      activityId: "22222222-2222-2222-2222-222222222222",
      assignmentId: "66666666-6666-6666-6666-666666666666",
      rawStoragePath: result.rawStoragePath,
      mediaType: "video",
    });
    expect(enqueueNormalizationJob).toHaveBeenCalledWith({
      submissionId: result.submissionId,
      schoolId: session.schoolId,
      studentId: session.id,
      activityId: "22222222-2222-2222-2222-222222222222",
      rawStoragePath: result.rawStoragePath,
    });
    expect(markSubmissionFailed).not.toHaveBeenCalled();
    expect(removeLocalUpload).not.toHaveBeenCalled();
  });

  it("removes the assembled file when assembly or insert fails", async () => {
    const removeLocalUpload = vi.fn().mockResolvedValue(undefined);

    await expect(
      finalizeUpload(
        {
          session,
          activityId: "22222222-2222-2222-2222-222222222222",
          assignmentId: null,
          extension: "webm",
          mediaType: "video",
          uploadId: "44444444-4444-4444-4444-444444444444",
          totalChunks: 3,
        },
        {
          assembleLocalUpload: vi
            .fn()
            .mockRejectedValue(new Error("Missing chunk 2 of 3.")),
          insertSubmission: vi.fn(),
          enqueueNormalizationJob: vi.fn(),
          markSubmissionFailed: vi.fn(),
          removeLocalUpload,
          createSubmissionId: () => "55555555-5555-5555-5555-555555555555",
        },
      ),
    ).rejects.toThrow("Missing chunk 2 of 3.");

    expect(removeLocalUpload).toHaveBeenCalledWith(
      "raw/11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222/33333333-3333-3333-3333-333333333333/55555555-5555-5555-5555-555555555555.webm",
    );
  });

  it("marks the submission failed when queue enqueue fails", async () => {
    const markSubmissionFailed = vi.fn().mockResolvedValue(undefined);
    const removeLocalUpload = vi.fn().mockResolvedValue(undefined);

    await expect(
      finalizeUpload(
        {
          session,
          activityId: "22222222-2222-2222-2222-222222222222",
          assignmentId: "66666666-6666-6666-6666-666666666666",
          extension: "webm",
          mediaType: "video",
          uploadId: "44444444-4444-4444-4444-444444444444",
          totalChunks: 3,
        },
        {
          assembleLocalUpload: vi.fn().mockResolvedValue(undefined),
          insertSubmission: vi.fn().mockResolvedValue(undefined),
          enqueueNormalizationJob: vi
            .fn()
            .mockRejectedValue(new Error("redis unavailable")),
          markSubmissionFailed,
          removeLocalUpload,
          createSubmissionId: () => "55555555-5555-5555-5555-555555555555",
        },
      ),
    ).rejects.toThrow("redis unavailable");

    expect(markSubmissionFailed).toHaveBeenCalledWith(
      "55555555-5555-5555-5555-555555555555",
    );
    expect(removeLocalUpload).not.toHaveBeenCalled();
  });
});
