import type { Activity, ActivitySubmissionMode } from "@lingua/db";
import type { StudentAssignment } from "./assignments";

type ActivityAssignmentRow = Pick<
  Activity,
  | "id"
  | "title"
  | "prompt"
  | "targetLanguage"
  | "passageText"
  | "teacherName"
  | "teacherReferenceText"
  | "referenceAudioPath"
  | "referenceVideoPath"
  | "coachNote"
  | "submissionModes"
  | "timeLimitSeconds"
>;

function buildSummary(targetLanguage: string, teacherName: string): string {
  return `Read the passage in ${targetLanguage}, then compare your delivery with ${teacherName}'s model.`;
}

function buildFocusLabel(targetLanguage: string): string {
  return targetLanguage.toLowerCase() === "french"
    ? "Pronunciation and pacing"
    : "Fluency and expression";
}

function buildMoodLabel(targetLanguage: string): string {
  return `${targetLanguage} reading`;
}

export function mapActivityRowToStudentAssignment(
  row: ActivityAssignmentRow,
): StudentAssignment {
  return {
    id: row.id,
    title: row.title,
    summary: buildSummary(row.targetLanguage, row.teacherName),
    coachNote:
      row.coachNote ??
      "Keep your phrases connected, stay clear on endings, and do not rush.",
    moodLabel: buildMoodLabel(row.targetLanguage),
    focusLabel: buildFocusLabel(row.targetLanguage),
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
      teacherReferenceVideoUrl: row.referenceVideoPath
        ? `/api/activities/${row.id}/reference-media?kind=video`
        : null,
      submissionModes: row.submissionModes as ActivitySubmissionMode[],
      timeLimitSeconds: row.timeLimitSeconds as 30 | 60 | 90 | 120 | 300,
    },
  };
}
