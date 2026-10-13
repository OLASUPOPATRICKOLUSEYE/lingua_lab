import { createHash } from "node:crypto";
import { activities, withClaims } from "@lingua/db";
import { eq } from "drizzle-orm";
import {
  STUDENT_ASSIGNMENTS,
  type StudentAssignment,
} from "../../utils/student/assignments";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function normalizeActivityId(activityId: string): string {
  if (UUID_RE.test(activityId)) {
    return activityId;
  }

  const digest = createHash("sha1")
    .update(`lingualab:activity:${activityId}`)
    .digest();
  const bytes = Uint8Array.from(digest.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Buffer.from(bytes).toString("hex");

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

export function getStudentAssignmentByActivityId(
  activityId: string,
): StudentAssignment | null {
  const normalized = normalizeActivityId(activityId);

  return (
    STUDENT_ASSIGNMENTS.find(
      (assignment) => normalizeActivityId(assignment.activity.id) === normalized,
    ) ?? null
  );
}

export async function getActivityReferenceById(input: {
  activityId: string;
  schoolId: string;
}): Promise<StudentAssignment | null> {
  const normalized = normalizeActivityId(input.activityId);
  const seeded = getStudentAssignmentByActivityId(normalized);
  if (seeded) {
    return seeded;
  }

  const rows = await withClaims(
    {
      sub: input.schoolId,
      school_id: input.schoolId,
      role: "system_admin",
    },
    (tx) =>
      tx
        .select()
        .from(activities)
        .where(eq(activities.id, normalized))
        .limit(1),
  );

  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    title: row.title,
    summary: `Read the passage in ${row.targetLanguage}, then compare your delivery with ${row.teacherName}'s model.`,
    coachNote:
      row.coachNote ??
      "Keep your phrases connected, stay clear on endings, and do not rush.",
    moodLabel: `${row.targetLanguage} reading`,
    focusLabel:
      row.targetLanguage.toLowerCase() === "french"
        ? "Pronunciation and pacing"
        : "Fluency and expression",
    activity: {
      id: row.id,
      prompt: row.prompt,
      targetLanguage: row.targetLanguage,
      passageTitle: row.title,
      passageText: row.passageText,
      teacherName: row.teacherName,
      teacherReferenceText: row.teacherReferenceText,
      teacherReferenceAudioUrl: row.referenceAudioPath
        ? `/api/activities/${row.id}/reference-media`
        : null,
      submissionModes: row.submissionModes,
      timeLimitSeconds: row.timeLimitSeconds as 30 | 60 | 90 | 120 | 300,
    },
  };
}
