"use client";

import Link from "next/link";
import { startTransition, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, CalendarDays, RotateCcw, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { TeacherClassAssignmentSummary } from "@/utils/teacher/class-data";
import {
  sortByTriage,
  type AssignmentTriage,
  type TriageLevel,
} from "@/utils/teacher/assignment-triage";
import { formatSubmittedAt } from "@/utils/presentation/submission";

interface TeacherClassAssignmentListProps {
  assignments: TeacherClassAssignmentSummary[];
  classSlug: string;
}

function dueStateMeta(dueAt: Date | null): {
  label: string;
  variant: "secondary" | "warning" | "destructive" | "success";
} {
  if (!dueAt) {
    return { label: "No due date", variant: "secondary" };
  }

  const msUntilDue = dueAt.getTime() - Date.now();
  if (msUntilDue < 0) {
    return { label: "Overdue", variant: "destructive" };
  }
  if (msUntilDue <= 48 * 60 * 60 * 1000) {
    return { label: "Due soon", variant: "warning" };
  }
  return { label: "On track", variant: "success" };
}

const TRIAGE_ACCENT: Record<TriageLevel, string> = {
  overdue: "border-l-4 border-l-destructive",
  "at-risk": "border-l-4 border-l-amber-500",
  behind: "border-l-4 border-l-amber-400/60",
  steady: "",
  archived: "opacity-70",
};

function CompletionBar({ triage }: { triage: AssignmentTriage }) {
  const percent = triage.completionPercent;
  const barColor =
    triage.level === "overdue"
      ? "bg-destructive"
      : triage.isLowCompletion
        ? "bg-amber-500"
        : "bg-emerald-500";

  return (
    <div className="min-w-40 flex-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Students submitted</span>
        <span className="tabular-nums font-medium">
          {percent === null ? "No students" : `${percent}%`}
        </span>
      </div>
      <div className="bg-foreground/10 mt-1 h-1.5 overflow-hidden rounded-full">
        <div
          className={`h-full rounded-full ${barColor}`}
          style={{ width: `${percent ?? 0}%` }}
        />
      </div>
    </div>
  );
}

function toDateTimeLocalValue(value: Date | null): string {
  if (!value) return "";

  const localDate = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

export function TeacherClassAssignmentList({
  assignments,
  classSlug,
}: TeacherClassAssignmentListProps) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const initialDueDates = useMemo(
    () =>
      Object.fromEntries(
        assignments.map((assignment) => [
          assignment.id,
          toDateTimeLocalValue(assignment.dueAt),
        ]),
      ),
    [assignments],
  );
  const [dueDates, setDueDates] =
    useState<Record<string, string>>(initialDueDates);
  const triaged = useMemo(() => sortByTriage(assignments), [assignments]);
  const attentionCount = useMemo(
    () => triaged.filter((entry) => entry.triage.reason !== null).length,
    [triaged],
  );

  async function updateAssignment(
    assignment: TeacherClassAssignmentSummary,
    payload: {
      dueAt?: string | null;
      status?: "assigned" | "archived";
    },
    successMessage: string,
  ) {
    setPendingId(assignment.id);
    setError(null);
    setMessage(null);

    const response = await fetch(
      `/api/activities/${assignment.activityId}/assignments/${assignment.id}`,
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );

    setPendingId(null);

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      setError(body?.error ?? "Could not update the class assignment.");
      return;
    }

    setMessage(successMessage);
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-4">
      {message ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {attentionCount > 0 ? (
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-800 dark:text-amber-200">
          <TriangleAlert className="size-4 shrink-0" />
          <span>
            {attentionCount} mission{attentionCount === 1 ? "" : "s"} need
            {attentionCount === 1 ? "s" : ""} attention — sorted by overdue risk
            and low completion first.
          </span>
        </div>
      ) : null}

      <ul className="space-y-3">
        {triaged.map(({ assignment, triage }) => {
          const isPending = pendingId === assignment.id;
          const dueState = dueStateMeta(assignment.dueAt);

          return (
            <li
              key={assignment.id}
              className={`flex flex-wrap items-start justify-between gap-x-4 gap-y-4 rounded-xl border bg-card p-4 ${TRIAGE_ACCENT[triage.level]}`}
            >
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{assignment.title}</p>
                  <span className="text-muted-foreground rounded-lg bg-muted px-2.5 py-1 text-xs">
                    {assignment.targetLanguage}
                  </span>
                  <Badge
                    variant={
                      assignment.status === "assigned" ? "success" : "secondary"
                    }
                  >
                    {assignment.status}
                  </Badge>
                  <Badge variant={dueState.variant}>{dueState.label}</Badge>
                </div>
                {triage.reason ? (
                  <p
                    className={`flex items-center gap-1.5 text-sm font-medium ${
                      triage.level === "overdue"
                        ? "text-destructive"
                        : "text-amber-700 dark:text-amber-300"
                    }`}
                  >
                    <TriangleAlert className="size-3.5" />
                    {triage.reason}
                  </p>
                ) : null}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span className="text-muted-foreground">
                    Assigned {formatSubmittedAt(assignment.assignedAt)}
                  </span>
                  <span className="text-muted-foreground">
                    {assignment.dueAt
                      ? `Due ${formatSubmittedAt(assignment.dueAt)}`
                      : "No due date"}
                  </span>
                  <span>
                    {assignment.submittedStudentCount}/
                    {assignment.enrolledStudentCount} students
                  </span>
                  <span>{assignment.openReviewCount} waiting in queue</span>
                  <span>{assignment.gradedSubmissionCount} graded</span>
                  <span>
                    {assignment.hasReferenceAudio
                      ? "Reference audio attached"
                      : "Reference audio missing"}
                  </span>
                </div>
                <div className="flex max-w-md pt-1">
                  <CompletionBar triage={triage} />
                </div>
              </div>

              <div className="w-full max-w-md space-y-3 rounded-xl border bg-background/60 p-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-xl border bg-background/80 p-3">
                    <p className="text-muted-foreground text-xs uppercase tracking-[0.16em]">
                      Waiting
                    </p>
                    <p className="pt-1 text-xl font-semibold">
                      {assignment.openReviewCount}
                    </p>
                    <p className="text-muted-foreground pt-1 text-xs">
                      Needs teacher attention
                    </p>
                  </div>
                  <div className="rounded-xl border bg-background/80 p-3">
                    <p className="text-muted-foreground text-xs uppercase tracking-[0.16em]">
                      Graded
                    </p>
                    <p className="pt-1 text-xl font-semibold">
                      {assignment.gradedSubmissionCount}
                    </p>
                    <p className="text-muted-foreground pt-1 text-xs">
                      Finished scoring
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <CalendarDays className="text-primary size-4" />
                  <label
                    htmlFor={`due-${assignment.id}`}
                    className="text-sm font-medium"
                  >
                    Due date
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  <input
                    id={`due-${assignment.id}`}
                    type="datetime-local"
                    value={dueDates[assignment.id] ?? ""}
                    onChange={(event) =>
                      setDueDates((current) => ({
                        ...current,
                        [assignment.id]: event.target.value,
                      }))
                    }
                    className="border-input bg-background text-foreground focus-visible:border-ring focus-visible:ring-ring/50 h-10 min-w-0 flex-1 rounded-xl border px-3 text-sm outline-none focus-visible:ring-[3px]"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isPending}
                    onClick={() =>
                      updateAssignment(
                        assignment,
                        {
                          dueAt: dueDates[assignment.id]
                            ? new Date(dueDates[assignment.id]).toISOString()
                            : null,
                        },
                        dueDates[assignment.id]
                          ? `Updated the due date for "${assignment.title}".`
                          : `Removed the due date for "${assignment.title}".`,
                      )
                    }
                  >
                    Save due date
                  </Button>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm">
                    <Link
                      href={`/teacher?class=${classSlug}&activityId=${assignment.activityId}&view=waiting`}
                    >
                      Waiting queue
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link
                      href={`/teacher?class=${classSlug}&activityId=${assignment.activityId}&view=graded`}
                    >
                      Graded takes
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/teacher/activities/${assignment.activityId}/preview`}>
                      Preview
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/teacher/classes/${classSlug}?activityId=${assignment.activityId}`}>
                      Edit
                    </Link>
                  </Button>
                  {assignment.status === "assigned" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={isPending}
                      onClick={() =>
                        updateAssignment(
                          assignment,
                          { status: "archived" },
                          `Archived "${assignment.title}" for this class.`,
                        )
                      }
                    >
                      <Archive className="size-4" />
                      Archive
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={isPending}
                      onClick={() =>
                        updateAssignment(
                          assignment,
                          { status: "assigned" },
                          `Restored "${assignment.title}" for this class.`,
                        )
                      }
                    >
                      <RotateCcw className="size-4" />
                      Restore
                    </Button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
