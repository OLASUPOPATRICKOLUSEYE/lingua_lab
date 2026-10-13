import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { StudentAssignment } from "@/utils/student/assignments";

export function StudentMissionCard({
  assignment,
  compact = false,
}: {
  assignment: StudentAssignment;
  compact?: boolean;
}) {
  const meta = [
    assignment.activity.targetLanguage,
    assignment.focusLabel,
    `${assignment.activity.timeLimitSeconds}s max`,
    assignment.activity.submissionModes.join(" or "),
  ];

  return (
    <Link
      href={`/student/assignments/${assignment.id}`}
      aria-label={`Open ${assignment.activity.passageTitle}`}
      className={
        compact
          ? "group bg-card hover:border-primary/40 flex h-full items-start justify-between gap-4 rounded-xl border p-4 transition-colors"
          : "group -mx-4 flex items-start justify-between gap-6 rounded-xl px-4 py-5 transition-colors hover:bg-muted/50"
      }
    >
      <div className="min-w-0">
        <p className="text-muted-foreground text-xs font-medium tracking-[0.16em] uppercase">
          {assignment.moodLabel}
        </p>
        <h2 className="mt-1.5 truncate text-lg font-semibold tracking-tight">
          {assignment.activity.passageTitle}
        </h2>
        <p className="text-muted-foreground mt-0.5 text-sm">
          {assignment.activity.teacherName}
        </p>
        {!compact ? (
          <p className="text-muted-foreground mt-2 line-clamp-2 max-w-xl text-sm leading-6">
            {assignment.summary}
          </p>
        ) : null}
        <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          {meta.map((item, i) => (
            <span key={item} className="inline-flex items-center gap-2">
              {i > 0 ? <span className="text-border" aria-hidden>·</span> : null}
              <span className="capitalize">{item}</span>
            </span>
          ))}
        </div>
      </div>

      <span className="text-muted-foreground group-hover:border-primary group-hover:text-primary mt-1 flex size-9 shrink-0 items-center justify-center rounded-full border transition-colors">
        <ArrowRight className="size-4" />
      </span>
    </Link>
  );
}
