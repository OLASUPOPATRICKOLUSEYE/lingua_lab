import type { TeacherClassAssignmentSummary } from "@/utils/teacher/class-data";

/**
 * Triage model for the class monitoring surface. Turns an assignment's due
 * date and completion into a single priority so the list can be sorted and
 * highlighted by the SAME computation (no drift between order and emphasis).
 *
 * "Completion" is measured over people: enrolled students who have submitted
 * at least one take, out of everyone enrolled.
 */

const DUE_SOON_MS = 48 * 60 * 60 * 1000;
const LOW_COMPLETION_THRESHOLD = 0.6;

export type TriageLevel = "overdue" | "at-risk" | "behind" | "steady" | "archived";

export interface AssignmentTriage {
  level: TriageLevel;
  /** Higher sorts first. Archived is forced to the bottom. */
  rank: number;
  /** Fraction of enrolled students who have submitted, 0–1, or null if empty. */
  completionRatio: number | null;
  completionPercent: number | null;
  isOverdue: boolean;
  isDueSoon: boolean;
  isLowCompletion: boolean;
  /** One short reason for the emphasis, for the "why" line. */
  reason: string | null;
}

const LEVEL_RANK: Record<TriageLevel, number> = {
  overdue: 400,
  "at-risk": 300,
  behind: 200,
  steady: 100,
  archived: 0,
};

export function completionRatio(
  assignment: Pick<
    TeacherClassAssignmentSummary,
    "enrolledStudentCount" | "submittedStudentCount"
  >,
): number | null {
  if (assignment.enrolledStudentCount <= 0) return null;
  return Math.min(
    1,
    assignment.submittedStudentCount / assignment.enrolledStudentCount,
  );
}

export function triageAssignment(
  assignment: TeacherClassAssignmentSummary,
  now: Date = new Date(),
): AssignmentTriage {
  const ratio = completionRatio(assignment);
  const percent = ratio === null ? null : Math.round(ratio * 100);
  const isLowCompletion = ratio !== null && ratio < LOW_COMPLETION_THRESHOLD;

  if (assignment.status === "archived") {
    return {
      level: "archived",
      rank: LEVEL_RANK.archived,
      completionRatio: ratio,
      completionPercent: percent,
      isOverdue: false,
      isDueSoon: false,
      isLowCompletion,
      reason: null,
    };
  }

  const msUntilDue =
    assignment.dueAt === null ? null : assignment.dueAt.getTime() - now.getTime();
  const isOverdue = msUntilDue !== null && msUntilDue < 0;
  const isDueSoon =
    msUntilDue !== null && msUntilDue >= 0 && msUntilDue <= DUE_SOON_MS;

  let level: TriageLevel = "steady";
  let reason: string | null = null;

  if (isOverdue && (ratio === null || ratio < 1)) {
    level = "overdue";
    reason =
      percent === null
        ? "Past due"
        : `Past due · ${percent}% submitted`;
  } else if (isDueSoon && isLowCompletion) {
    level = "at-risk";
    reason = `Due soon · only ${percent}% submitted`;
  } else if (isLowCompletion) {
    level = "behind";
    reason = `${percent}% submitted`;
  }

  // Rank within a level nudges by pressure so the worst offenders float to the
  // top of their band: lower completion first, then sooner/more-overdue due
  // date. Both nudges are capped well under the 100-point band gap so a nudge
  // can never lift an assignment into a higher triage level.
  let rank = LEVEL_RANK[level];
  if (ratio !== null) {
    rank += Math.round((1 - ratio) * 40);
  }
  if (msUntilDue !== null && level !== "steady") {
    const pressure = (DUE_SOON_MS - msUntilDue) / DUE_SOON_MS; // >1 when overdue
    rank += Math.max(0, Math.min(20, Math.round(pressure * 20)));
  }

  return {
    level,
    rank,
    completionRatio: ratio,
    completionPercent: percent,
    isOverdue,
    isDueSoon,
    isLowCompletion,
    reason,
  };
}

export interface TriagedAssignment {
  assignment: TeacherClassAssignmentSummary;
  triage: AssignmentTriage;
}

/** Sort assignments by triage rank (highest pressure first), stable on ties. */
export function sortByTriage(
  assignments: TeacherClassAssignmentSummary[],
  now: Date = new Date(),
): TriagedAssignment[] {
  return assignments
    .map((assignment) => ({ assignment, triage: triageAssignment(assignment, now) }))
    .sort((a, b) => {
      if (b.triage.rank !== a.triage.rank) return b.triage.rank - a.triage.rank;
      // Tie-break: sooner due date first (nulls last), then newest assigned.
      const aDue = a.assignment.dueAt?.getTime() ?? Number.POSITIVE_INFINITY;
      const bDue = b.assignment.dueAt?.getTime() ?? Number.POSITIVE_INFINITY;
      if (aDue !== bDue) return aDue - bDue;
      return b.assignment.assignedAt.getTime() - a.assignment.assignedAt.getTime();
    });
}
