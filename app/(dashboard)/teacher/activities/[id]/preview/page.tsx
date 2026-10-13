import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, BookOpenText, Clock3, Mic, Sparkles } from "lucide-react";
import { TeacherReadAlong } from "@/components/recorder/TeacherReadAlong";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HeaderChip, PageHeader } from "@/components/dashboard/PageHeader";
import {
  ColorClockIcon,
  ColorClipboardIcon,
  ColorMicIcon,
  ColorSchoolIcon,
  ColorSparklesIcon,
} from "@/components/icons/ColorIcons";
import { requireRole } from "@/utils/auth/dal";
import {
  getTeacherActivityAssignments,
  getTeacherPreviewAssignment,
} from "@/utils/teacher/activity-data";
import { getTeacherClasses } from "@/utils/teacher/class-data";
import { Panel, PanelHeader } from "@/components/dashboard/Panel";
import { formatSubmittedAt } from "@/utils/presentation/submission";

interface TeacherActivityPreviewPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function TeacherActivityPreviewPage({
  params,
}: TeacherActivityPreviewPageProps) {
  const session = await requireRole(["teacher", "dept_head", "system_admin"]);
  const { id } = await params;
  const [assignment, teacherClasses, assignmentTargets] = await Promise.all([
    getTeacherPreviewAssignment(session, id),
    getTeacherClasses(session),
    getTeacherActivityAssignments(session, id),
  ]);

  if (!assignment) {
    notFound();
  }

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <PageHeader
        kicker="Teacher preview"
        title={assignment.activity.passageTitle}
        chip={
          <HeaderChip>
            <ColorSparklesIcon className="size-4.5" />
            Student mission view
          </HeaderChip>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/teacher">
                <ArrowLeft className="size-4" />
                Back to review
              </Link>
            </Button>
            <Button asChild>
              <Link
                href={
                  teacherClasses[0]
                    ? `/teacher/classes/${teacherClasses[0].slug}?activityId=${assignment.id}`
                    : "/teacher"
                }
              >
                Edit in studio
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        }
      />

      <div className="overflow-hidden rounded-2xl border bg-card">
        <div className="bg-[radial-gradient(circle_at_top_left,rgba(251,146,60,0.18),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(125,211,252,0.18),transparent_34%)] p-5 sm:p-6">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border bg-background/75 px-3 py-1 text-xs font-semibold tracking-[0.16em] uppercase">
              <ColorSparklesIcon className="size-4" />
              {assignment.moodLabel}
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
              {assignment.activity.passageTitle}
            </h1>
            <p className="text-muted-foreground mt-3 text-sm leading-6">
              {assignment.summary}
            </p>
          </div>
        </div>

        <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4">
          <div className="flex items-center gap-3 rounded-xl border bg-background/70 px-3 py-3">
            <ColorSchoolIcon className="size-4.5" />
            <div>
              <p className="text-muted-foreground text-[11px] uppercase">Teacher</p>
              <p className="text-sm font-medium">{assignment.activity.teacherName}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border bg-background/70 px-3 py-3">
            <ColorClockIcon className="size-4.5" />
            <div>
              <p className="text-muted-foreground text-[11px] uppercase">Length</p>
              <p className="text-sm font-medium">{assignment.activity.timeLimitSeconds}s max</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border bg-background/70 px-3 py-3">
            <ColorMicIcon className="size-4.5" />
            <div>
              <p className="text-muted-foreground text-[11px] uppercase">Mode</p>
              <p className="text-sm font-medium capitalize">
                {assignment.activity.submissionModes.join(" + ")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border bg-background/70 px-3 py-3">
            <Sparkles className="text-primary size-4" />
            <div>
              <p className="text-muted-foreground text-[11px] uppercase">Focus</p>
              <p className="text-sm font-medium">{assignment.focusLabel}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_320px]">
        <div className="space-y-4">
          <div className="rounded-2xl border bg-card p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="inline-flex items-center gap-2 rounded-full border bg-background/70 px-3 py-1.5">
                <BookOpenText className="text-primary size-4" />
                Passage
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border bg-background/70 px-3 py-1.5">
                <Clock3 className="text-primary size-4" />
                {assignment.activity.timeLimitSeconds}s max
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border bg-background/70 px-3 py-1.5">
                <Mic className="text-primary size-4" />
                {assignment.activity.submissionModes.join(" or ")}
              </span>
            </div>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight">
              This is what the student sees first
            </h2>
            <p className="text-muted-foreground mt-2 text-sm leading-6">
              Passage, teacher model, and practice focus are shown before the recording step starts.
            </p>
            <div className="mt-5 rounded-2xl border bg-background/70 p-4 sm:p-5">
              <p className="text-foreground text-[15px] leading-8">
                {assignment.activity.passageText}
              </p>
            </div>
          </div>

          <TeacherReadAlong
            teacherName={assignment.activity.teacherName}
            language={assignment.activity.targetLanguage}
            passageText={assignment.activity.teacherReferenceText}
            referenceAudioUrl={assignment.activity.teacherReferenceAudioUrl}
          />
        </div>

        <div className="space-y-4">
          <Panel className="p-5">
            <PanelHeader
              icon={<Sparkles className="text-primary size-4.5" />}
              title="Student focus"
            />
            <p className="text-muted-foreground -mt-1 text-sm leading-7">
              {assignment.coachNote}
            </p>
            <div className="mt-5 space-y-3 text-sm">
              <div className="rounded-xl border bg-background/70 p-3">Read the passage once.</div>
              <div className="rounded-xl border bg-background/70 p-3">Play the teacher model once.</div>
              <div className="rounded-xl border bg-background/70 p-3">Make one clear take.</div>
            </div>
            <p className="text-muted-foreground mt-5 text-sm leading-6">
              Recording and upload are intentionally disabled in this teacher preview. Use the student console to test the full learner flow.
            </p>
          </Panel>

          <Panel className="p-5">
            <PanelHeader
              icon={<ColorClipboardIcon className="size-5.5" />}
              title="Live delivery"
              badge={`${assignmentTargets.length} class${assignmentTargets.length === 1 ? "" : "es"}`}
            />
            <div className="-mt-1 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <div className="rounded-xl border bg-background/70 p-3">
                <p className="text-muted-foreground text-[11px] font-semibold uppercase">
                  Reference audio
                </p>
                <p className="mt-1 text-sm font-medium">
                  {assignment.activity.teacherReferenceAudioUrl
                    ? "Attached and live"
                    : "Guided browser voice fallback"}
                </p>
              </div>
              <div className="rounded-xl border bg-background/70 p-3">
                <p className="text-muted-foreground text-[11px] font-semibold uppercase">
                  Next edit path
                </p>
                <p className="mt-1 text-sm font-medium">
                  {teacherClasses[0] ? teacherClasses[0].name : "Teacher studio"}
                </p>
              </div>
            </div>
            {assignmentTargets.length > 0 ? (
              <div className="mt-4 space-y-3">
                {assignmentTargets.map((target) => (
                  <div
                    key={target.id}
                    className="flex items-start justify-between gap-3 rounded-xl border bg-background/70 p-3"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{target.className}</p>
                      <p className="text-muted-foreground mt-1 text-sm">
                        {target.dueAt
                          ? `Due ${formatSubmittedAt(target.dueAt)}`
                          : "No due date"}
                      </p>
                    </div>
                    <Badge variant={target.status === "assigned" ? "success" : "secondary"}>
                      {target.status}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed bg-background/60 p-4 text-sm">
                This mission is published, but it has not been assigned to a class yet.
              </div>
            )}
          </Panel>
        </div>
      </div>
    </section>
  );
}
