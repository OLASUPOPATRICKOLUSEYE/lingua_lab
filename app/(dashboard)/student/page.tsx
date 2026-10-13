import Link from "next/link";
import { ArrowRight, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel, PanelHeader } from "@/components/dashboard/Panel";
import { StatTile } from "@/components/dashboard/StatTile";
import {
  ColorMicIcon,
  ColorSparklesIcon,
} from "@/components/icons/ColorIcons";
import { HeaderChip, PageHeader } from "@/components/dashboard/PageHeader";
import {
  StatusBadge,
  formatSubmittedAt,
  scoreColorClass,
} from "@/utils/presentation/submission";
import { requireRole } from "@/utils/auth/dal";
import { getStudentDashboardData } from "@/utils/dashboard/data";
import { listStudentAssignments } from "@/utils/student/assignment-data";
import { StudentLiveClassPanel } from "@/components/student/StudentLiveClassPanel";
import { getStudentLiveSessions } from "@/utils/live-sessions/data";

/**
 * Student home: what needs doing now, then how it is going.
 *
 * This page used to be six equal panels — two of them charts and two of them
 * shortcuts to pages the sidebar already lists. Nothing said what to do next.
 * The order is now: one action, live class if there is one, the numbers, then
 * recent work.
 */
export default async function StudentHubPage() {
  const session = await requireRole(["student"]);
  const [data, assignments, liveSessions] = await Promise.all([
    getStudentDashboardData(session),
    listStudentAssignments(session),
    getStudentLiveSessions(session),
  ]);

  const firstName = data.fullName?.split(/\s+/)[0] ?? null;
  const nextAssignment = assignments[0] ?? null;
  const practicedThisWeek = data.dailyActivity.length;

  return (
    <section className="flex flex-col gap-4">
      <PageHeader
        kicker={`Welcome back${firstName ? `, ${firstName}` : ""} 👋`}
        title="Let's get you speaking!"
        chip={
          <HeaderChip>
            <ColorSparklesIcon className="size-4.5" />
            {data.submissionTotal} {data.submissionTotal === 1 ? "take" : "takes"}
          </HeaderChip>
        }
      />

      {/* The one thing to do. Given the whole product is "record a passage",
          this is the only primary action a student needs on landing. */}
      <Panel className="border-primary/25 bg-primary/[0.04]">
        {nextAssignment ? (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-muted-foreground text-[0.72rem] font-semibold tracking-[0.16em] uppercase">
                Next up
              </p>
              <p className="pt-1 text-xl font-semibold tracking-tight">
                {nextAssignment.title}
              </p>
              <p className="text-muted-foreground pt-1 text-sm leading-6">
                {nextAssignment.summary}
              </p>
            </div>
            <Button asChild size="lg">
              <Link href={`/student/assignments/${nextAssignment.id}`}>
                <Mic className="size-4" />
                Start practice
              </Link>
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-medium">No practice set yet</p>
              <p className="text-muted-foreground pt-1 text-sm">
                When your teacher publishes a passage it will appear here.
              </p>
            </div>
            <Button asChild variant="outline">
              <Link href="/student/assignments">
                Browse passages
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        )}
      </Panel>

      {/* Time-sensitive, so it sits directly under the action. */}
      <StudentLiveClassPanel sessions={liveSessions} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Takes sent"
          value={data.submissionTotal}
          hint={`${data.gradedResultTotal} graded`}
        />
        <StatTile
          label="Fluency"
          value={data.averageFluencyScore ?? "—"}
          valueClassName={scoreColorClass(data.averageFluencyScore)}
          hint="Average across graded takes"
        />
        <StatTile
          label="Pronunciation"
          value={data.averagePronunciationScore ?? "—"}
          valueClassName={scoreColorClass(data.averagePronunciationScore)}
          hint="Average across graded takes"
        />
        <StatTile
          label="Level"
          value={data.latestCefrEstimate ?? "—"}
          hint={
            practicedThisWeek > 0
              ? `Practised ${practicedThisWeek} ${practicedThisWeek === 1 ? "day" : "days"} this week`
              : "No practice yet this week"
          }
        />
      </div>

      <Panel>
        <PanelHeader
          icon={<ColorMicIcon className="size-5.5" />}
          title="Recent recordings"
          badge={`${data.submissionTotal} total`}
          action={
            data.submissionTotal > 0 ? (
              <Button asChild size="sm" variant="outline">
                <Link href="/student/recordings">
                  View all &amp; grades
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            ) : undefined
          }
        />

        {data.recentSubmissions.length > 0 ? (
          <ul className="divide-y">
            {data.recentSubmissions.map((submission) => (
              <li
                key={submission.id}
                className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="bg-primary/8 border-primary/15 flex size-9 shrink-0 items-center justify-center rounded-full border">
                    <ColorMicIcon className="size-4.5" />
                  </div>
                  <p className="truncate text-sm font-medium">
                    {formatSubmittedAt(submission.submittedAt)}
                  </p>
                </div>
                <StatusBadge status={submission.status} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed py-10 text-center">
            <p className="font-medium">Nothing recorded yet</p>
            <p className="text-muted-foreground text-sm">
              Your takes and scores will show up here.
            </p>
          </div>
        )}
      </Panel>
    </section>
  );
}
