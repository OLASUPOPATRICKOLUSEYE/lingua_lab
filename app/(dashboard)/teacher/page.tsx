import Link from "next/link";
import { ArrowRight, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Panel, PanelHeader } from "@/components/dashboard/Panel";
import { HeaderChip, PageHeader } from "@/components/dashboard/PageHeader";
import {
  ColorBookIcon,
  ColorClipboardIcon,
  ColorMicIcon,
  ColorQueueIcon,
  ColorSchoolIcon,
} from "@/components/icons/ColorIcons";
import { StatTile } from "@/components/dashboard/StatTile";
import {
  StatusBadge,
  formatSubmittedAt,
  scoreColorClass,
} from "@/utils/presentation/submission";
import { requireRole } from "@/utils/auth/dal";
import { getTeacherDashboardData } from "@/utils/dashboard/data";

interface TeacherConsolePageProps {
  searchParams?: Promise<{
    class?: string;
    activityId?: string;
    view?: string;
  }>;
}

function Score({ label, value }: { label: string; value: number | null }) {
  return (
    <span className="text-muted-foreground text-sm">
      {label}{" "}
      <span className={`font-medium ${scoreColorClass(value)}`}>
        {value ?? "—"}
      </span>
    </span>
  );
}

export default async function TeacherConsolePage({
  searchParams,
}: TeacherConsolePageProps) {
  const session = await requireRole(["teacher", "dept_head", "system_admin"]);
  const resolvedSearchParams = await searchParams;
  const classSlug = resolvedSearchParams?.class?.trim() || null;
  const activityId = resolvedSearchParams?.activityId?.trim() || null;
  const view = resolvedSearchParams?.view === "graded" ? "graded" : "waiting";
  const data = await getTeacherDashboardData(session, {
    classSlug,
    activityId,
    view,
  });
  const firstName = data.fullName?.split(/\s+/)[0] ?? null;
  const submissionCount = data.recentSubmissions.length;
  const hasQueueFilter =
    Boolean(data.activeQueueFilters.classSlug) ||
    Boolean(data.activeQueueFilters.activityId);
  const statusCounts = data.recentSubmissions.reduce(
    (acc, submission) => {
      acc[submission.status] = (acc[submission.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  const awaitingReview = statusCounts.pending_review ?? 0;
  // Pipeline states only. "Pending review" deliberately lives in the
  // "Waiting to review" tile instead: it is work waiting on a PERSON, whereas
  // these are takes still moving through normalization and grading. Listing it
  // in both places showed the same number twice under two different names.
  const queueSummary = [
    { label: "Processing", value: statusCounts.processing ?? 0 },
    { label: "Awaiting pipeline", value: statusCounts.pending ?? 0 },
    { label: "Failed", value: statusCounts.failed ?? 0 },
  ].filter((item) => item.value > 0);

  return (
    <section className="flex flex-col gap-4">
      <PageHeader
        kicker={`Welcome back${firstName ? `, ${firstName}` : ""} 👋`}
        title={
          hasQueueFilter
            ? data.activeQueueFilters.view === "graded"
              ? "Review graded submissions"
              : "Review targeted submissions"
            : data.activeQueueFilters.view === "graded"
              ? "Browse graded submissions"
              : "Review student speaking"
        }
        chip={
          <HeaderChip>
            <ColorQueueIcon className="size-4.5" />
            {submissionCount > 0
              ? data.activeQueueFilters.view === "graded"
                ? `${submissionCount} graded in view`
                : `${submissionCount} ready to review`
              : data.activeQueueFilters.view === "graded"
                ? "No graded takes here yet"
                : "All caught up"}
          </HeaderChip>
        }
        actions={
          hasQueueFilter ? (
            <div className="flex flex-wrap gap-2">
              {data.activeQueueFilters.className ? (
                <Badge variant="outline">{data.activeQueueFilters.className}</Badge>
              ) : null}
              {data.activeQueueFilters.activityTitle ? (
                <Badge variant="outline">{data.activeQueueFilters.activityTitle}</Badge>
              ) : null}
              <Badge variant="outline">
                {data.activeQueueFilters.view === "graded" ? "Graded" : "Waiting"}
              </Badge>
              <Button asChild variant="outline" size="sm">
                <Link href="/teacher">Clear filter</Link>
              </Button>
            </div>
          ) : undefined
        }
      />

      {/* The number that decides a teacher's next hour comes first. */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Waiting to review"
          value={awaitingReview}
          valueClassName={awaitingReview > 0 ? "text-primary" : undefined}
          hint={awaitingReview > 0 ? "Needs your grade" : "Nothing waiting"}
        />
        <StatTile
          label="Live missions"
          value={data.recentActivities.length}
          hint="Published to your classes"
        />
        <StatTile
          label="Students"
          value={data.studentTotal}
          hint="In your school"
        />
        <StatTile
          label="Student takes"
          value={data.submissionTotal}
          hint="Recorded so far"
        />
      </div>

      <Panel>
        <PanelHeader
          icon={<ColorQueueIcon className="size-5.5" />}
          title="Review queue"
          badge={
            hasQueueFilter
              ? `${submissionCount} in this view`
              : data.activeQueueFilters.view === "graded"
                ? `${submissionCount} graded`
                : `${submissionCount} open`
          }
        />

        {queueSummary.length > 0 ? (
          <div className="mb-5 flex flex-wrap gap-2">
            {queueSummary.map((item) => (
              <Badge key={item.label} variant="outline" className="rounded-lg px-3 py-1">
                {item.label}: {item.value}
              </Badge>
            ))}
          </div>
        ) : null}

        {submissionCount > 0 ? (
          <ul className="divide-y">
            {data.recentSubmissions.map((submission) => (
              <li
                key={submission.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 py-4 first:pt-0 last:pb-0"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-background/65">
                    <ColorMicIcon className="size-5" />
                  </div>
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium">
                        {submission.studentName}
                      </p>
                      <StatusBadge status={submission.status} />
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      {submission.className ? (
                        <span className="text-muted-foreground text-sm">
                          {submission.className}
                        </span>
                      ) : null}
                      {submission.activityTitle ? (
                        <span className="text-muted-foreground text-sm">
                          {submission.activityTitle}
                        </span>
                      ) : null}
                      <span className="text-muted-foreground text-sm">
                        {formatSubmittedAt(submission.submittedAt)}
                      </span>
                      <Score
                        label="Fluency"
                        value={submission.latestFluencyScore}
                      />
                      <Score
                        label="Pronunciation"
                        value={submission.latestPronunciationScore}
                      />
                    </div>
                  </div>
                </div>
                <Button asChild size="sm" variant="outline">
                  <Link
                    href={{
                      pathname: `/teacher/submissions/${submission.id}`,
                      query: {
                        ...(data.activeQueueFilters.classSlug
                          ? { class: data.activeQueueFilters.classSlug }
                          : {}),
                        ...(data.activeQueueFilters.activityId
                          ? { activityId: data.activeQueueFilters.activityId }
                          : {}),
                        view: data.activeQueueFilters.view,
                      },
                    }}
                  >
                    Review
                    <ChevronRight className="size-4" />
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed py-10 text-center">
            <p className="font-medium">
              {data.activeQueueFilters.view === "graded"
                ? "No graded takes in this view"
                : "No student takes to review"}
            </p>
            <p className="text-muted-foreground text-sm">
              {data.activeQueueFilters.view === "graded"
                ? "Graded submissions for this filter will appear here automatically."
                : "New recordings and review cases will appear here automatically."}
            </p>
          </div>
        )}
      </Panel>

      <Panel>
        <PanelHeader
          icon={<ColorSchoolIcon className="size-5.5" />}
          title="Processing pipeline"
        />
        {queueSummary.length > 0 ? (
          <dl className="divide-y">
            {queueSummary.map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
              >
                <dt className="text-muted-foreground text-sm">{item.label}</dt>
                <dd className="font-medium tabular-nums">{item.value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed py-10 text-center">
            <p className="font-medium">Pipeline is clear</p>
            <p className="text-muted-foreground text-sm">
              Nothing is normalizing, grading, or failed right now.
            </p>
          </div>
        )}
      </Panel>

      <Panel>
        <PanelHeader
          icon={<ColorBookIcon className="size-5.5" />}
          title="Passage studio"
          action={
            data.teacherClasses[0] ? (
              <Button asChild size="sm" variant="outline">
                <Link href={`/teacher/classes/${data.teacherClasses[0].slug}`}>
                  Open passage studio
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            ) : null
          }
        />
        {data.teacherClasses.length > 0 ? (
          <>
            <div className="grid gap-3 md:grid-cols-3">
              {data.teacherClasses.slice(0, 3).map((classroom) => (
                <Link
                  key={classroom.id}
                  href={`/teacher/classes/${classroom.slug}`}
                  className="rounded-xl border bg-background/60 p-4 transition-colors hover:bg-background"
                >
                  <p className="font-medium">{classroom.name}</p>
                  <p className="text-muted-foreground mt-2 text-sm">
                    {classroom.studentCount} students · {classroom.activeAssignmentCount} live missions
                  </p>
                </Link>
              ))}
            </div>
            {data.teacherClasses.length > 3 ? (
              <div className="mt-3">
                <Link
                  href="/teacher/classes"
                  className="text-sm font-medium text-primary hover:underline"
                >
                  View all classes
                </Link>
              </div>
            ) : null}
          </>
        ) : (
          <div className="mt-4 flex flex-col items-center gap-1 rounded-lg border border-dashed py-10 text-center">
            <p className="font-medium">No classes assigned to you yet</p>
            <p className="text-muted-foreground text-sm">
              An admin needs to assign you to a class before you can open the passage studio.
            </p>
          </div>
        )}
      </Panel>

      <Panel>
        <PanelHeader
          icon={<ColorClipboardIcon className="size-5.5" />}
          title="Published speaking missions"
          badge={`${data.recentActivities.length} live`}
        />
        {data.recentActivities.length > 0 ? (
          <ul className="divide-y">
            {data.recentActivities.map((activity) => (
              <li
                key={activity.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 py-4 first:pt-0 last:pb-0"
              >
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{activity.title}</p>
                    <span className="text-muted-foreground rounded-lg bg-muted px-2.5 py-1 text-xs">
                      {activity.targetLanguage}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-muted-foreground text-sm">
                      By {activity.teacherName}
                    </span>
                    <span className="text-muted-foreground text-sm">
                      {formatSubmittedAt(activity.createdAt)}
                    </span>
                    <span className="text-sm">
                      {activity.hasReferenceAudio ? (
                        <span className="text-emerald-600 dark:text-emerald-400">
                          Reference audio attached
                        </span>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400">
                          Text live, audio still missing
                        </span>
                      )}
                    </span>
                  </div>
                </div>
                {activity.canManage ? (
                  <div className="flex flex-wrap gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/teacher/activities/${activity.id}/preview`}>
                        Preview
                      </Link>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <Link
                        href={
                          data.teacherClasses[0]
                            ? `/teacher/classes/${data.teacherClasses[0].slug}?activityId=${activity.id}`
                            : `/teacher/activities/${activity.id}/preview`
                        }
                      >
                        Update in studio
                      </Link>
                    </Button>
                  </div>
                ) : (
                  <span className="text-muted-foreground text-sm">
                    Managed by {activity.teacherName}
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed py-10 text-center">
            <p className="font-medium">No live speaking missions yet</p>
            <p className="text-muted-foreground text-sm">
              Publish a passage from the studio and it will appear here for the whole school.
            </p>
          </div>
        )}
      </Panel>
    </section>
  );
}
