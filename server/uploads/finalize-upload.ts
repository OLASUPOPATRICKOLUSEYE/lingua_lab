import { randomUUID } from "node:crypto";
import { buildStoragePath } from "../../packages/db/src/lib/storage-paths";

export interface UploadSession {
  id: string;
  schoolId: string;
}

export interface FinalizeUploadInput {
  session: UploadSession;
  activityId: string;
  // The specific assignment this submission is made against, resolved at the
  // route once and frozen on the row. Null when no assigned row covers it.
  assignmentId: string | null;
  extension: string;
  /** "audio" | "video" — the extension cannot carry this (see the schema). */
  mediaType: string;
  uploadId: string;
  totalChunks: number;
}

export interface FinalizeUploadDeps {
  assembleLocalUpload: (input: {
    uploadId: string;
    totalChunks: number;
    destinationRelativePath: string;
  }) => Promise<unknown>;
  insertSubmission: (input: {
    submissionId: string;
    schoolId: string;
    studentId: string;
    activityId: string;
    assignmentId: string | null;
    rawStoragePath: string;
    mediaType: string;
  }) => Promise<void>;
  enqueueNormalizationJob: (input: {
    submissionId: string;
    schoolId: string;
    studentId: string;
    activityId: string;
    rawStoragePath: string;
  }) => Promise<void>;
  markSubmissionFailed: (submissionId: string) => Promise<void>;
  removeLocalUpload: (relativePath: string) => Promise<void>;
  createSubmissionId?: () => string;
}

export interface FinalizeUploadResult {
  submissionId: string;
  rawStoragePath: string;
}

export async function finalizeUpload(
  input: FinalizeUploadInput,
  deps: FinalizeUploadDeps,
): Promise<FinalizeUploadResult> {
  const submissionId = deps.createSubmissionId?.() ?? randomUUID();
  const rawStoragePath = buildStoragePath({
    bucket: "raw",
    schoolId: input.session.schoolId,
    courseId: input.activityId,
    studentId: input.session.id,
    submissionId,
    ext: input.extension,
  });

  try {
    await deps.assembleLocalUpload({
      uploadId: input.uploadId,
      totalChunks: input.totalChunks,
      destinationRelativePath: rawStoragePath,
    });

    await deps.insertSubmission({
      submissionId,
      schoolId: input.session.schoolId,
      studentId: input.session.id,
      activityId: input.activityId,
      assignmentId: input.assignmentId,
      rawStoragePath,
      mediaType: input.mediaType,
    });
  } catch (error) {
    await deps.removeLocalUpload(rawStoragePath).catch(() => {});
    throw error;
  }

  try {
    await deps.enqueueNormalizationJob({
      submissionId,
      schoolId: input.session.schoolId,
      studentId: input.session.id,
      activityId: input.activityId,
      rawStoragePath,
    });
  } catch (error) {
    await deps.markSubmissionFailed(submissionId).catch(() => {});
    throw error;
  }

  return {
    submissionId,
    rawStoragePath,
  };
}
