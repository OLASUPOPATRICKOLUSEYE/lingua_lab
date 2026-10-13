/**
 * Canonical storage-path generation. NEVER build a storage path string inline
 * (data-model.md, AGENTS.md rule #3). Paths contain only UUIDs and a known
 * extension — no filenames, timestamps, or user-generated strings ever.
 *
 * Format: {bucket}/{school_id}/{course_id}/{student_id}/{submission_id}.{ext}
 */

export type StorageBucket = "raw" | "processed" | "exports" | "reference";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXT_RE = /^[a-z0-9]+$/;

export interface StoragePathParts {
  bucket: StorageBucket;
  schoolId: string;
  courseId: string;
  studentId: string;
  submissionId: string;
  ext: string; // e.g. "webm", "wav" — no leading dot
}

function assertUuid(value: string, field: string): void {
  if (!UUID_RE.test(value)) {
    throw new Error(`storage path ${field} must be a UUID, got: ${value}`);
  }
}

export function buildStoragePath(parts: StoragePathParts): string {
  assertUuid(parts.schoolId, "schoolId");
  assertUuid(parts.courseId, "courseId");
  assertUuid(parts.studentId, "studentId");
  assertUuid(parts.submissionId, "submissionId");
  const ext = parts.ext.replace(/^\./, "").toLowerCase();
  if (!EXT_RE.test(ext)) {
    throw new Error(`storage path ext must be alphanumeric, got: ${parts.ext}`);
  }
  return `${parts.bucket}/${parts.schoolId}/${parts.courseId}/${parts.studentId}/${parts.submissionId}.${ext}`;
}

export type ProcessedStoragePathParts = Omit<StoragePathParts, "bucket" | "ext">;

export function buildProcessedStoragePath(
  parts: ProcessedStoragePathParts,
): string {
  return buildStoragePath({
    ...parts,
    bucket: "processed",
    ext: "wav",
  });
}
