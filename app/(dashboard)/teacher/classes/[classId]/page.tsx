import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Panel, PanelHeader } from "@/components/dashboard/Panel";
import { Button } from "@/components/ui/button";
import { HeaderChip, PageHeader } from "@/components/dashboard/PageHeader";
import {
  ColorBookIcon,
  ColorCalendarIcon,
  ColorClipboardIcon,
  ColorSparklesIcon,
} from "@/components/icons/ColorIcons";
import { ScheduleLiveClassForm } from "@/components/teacher/ScheduleLiveClassForm";
import { TeacherClassAssignmentList } from "@/components/teacher/TeacherClassAssignmentList";
import { TeacherLiveClassList } from "@/components/teacher/TeacherLiveClassList";
import { TeacherPassageStudio } from "@/components/teacher/TeacherPassageStudio";
import { requireRole } from "@/utils/auth/dal";
import { getClassLiveSessions } from "@/utils/live-sessions/data";
import { liveSessionProviderOptions } from "@/utils/live-sessions/providers";
import { getTeacherStudioActivity } from "@/utils/teacher/activity-data";
import {
  getTeacherClassAssignments,
  getTeacherClassBySlug,
} from "@/utils/teacher/class-data";

interface ClassPageProps {
  params: Promise<{
    classId: string;
  }>;
  searchParams?: Promise<{
    activityId?: string;
  }>;
}

export default async function ClassPage({ params, searchParams }: ClassPageProps) {
  const session = await requireRole(["teacher", "dept_head", "system_admin"]);
  const { classId } = await params;
  const resolvedSearchParams = await searchParams;
  const activityId = resolvedSearchParams?.activityId?.trim() || null;
  const classroom = await getTeacherClassBySlug(session, classId);
  if (!classroom) {
    notFound();
  }
  const [assignments, liveSessions] = await Promise.all([
    getTeacherClassAssignments(session, classroom.id),
    getClassLiveSessions(session, classroom.id),
  ]);
  const initialActivity = activityId
    ? await getTeacherStudioActivity(session, activityId)
    : null;

  return (
    <section className="flex flex-col gap-4">
      <PageHeader
        kicker="Teacher passage setup"
        title={initialActivity?.title ?? classroom.name}
        chip={
          <HeaderChip>
            <ColorSparklesIcon className="size-4.5" />
            {initialActivity ? "Managing live mission" : "Live publishing"}
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
            <Button asChild variant="outline">
              <Link href={`/teacher/classes/${classroom.slug}/gradebook`}>
                Gradebook
              </Link>
            </Button>
            {initialActivity ? (
              <Button asChild>
                <Link href={`/teacher/activities/${initialActivity.id}/preview`}>
                  Preview student mission
                </Link>
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="rounded-2xl border bg-card p-5">
        <div className="flex items-center gap-2">
          <ColorBookIcon className="size-5" />
          <p className="text-sm font-medium">Teacher-owned speaking setup</p>
        </div>
        <p className="text-muted-foreground mt-2 max-w-3xl text-sm leading-6">
          Bring in the passage text, shape the teacher note, preview the modeled reading,
          and rehearse a reference take. Publishing creates the live student practice
          activity, and attaching the recorded teacher audio makes that exact model
          available to students during listening and compare.
        </p>
        <p className="text-muted-foreground mt-3 text-sm">
          Target class: <span className="text-foreground font-medium">{classroom.name}</span> ·{" "}
          {classroom.studentCount} students · {classroom.activeAssignmentCount} live missions
        </p>
      </div>

      <Panel>
        <PanelHeader
          icon={<ColorCalendarIcon className="size-5.5" />}
          title="Live classes"
          badge={`${liveSessions.length} scheduled`}
        />
        {classroom.canManage ? (
          <div className="pb-4">
            <ScheduleLiveClassForm
              classId={classroom.id}
              providers={liveSessionProviderOptions()}
            />
          </div>
        ) : null}
        <TeacherLiveClassList
          sessions={liveSessions}
          canManage={classroom.canManage}
        />
      </Panel>

      <Panel>
        <PanelHeader
          icon={<ColorClipboardIcon className="size-5.5" />}
          title="Assigned missions"
          badge={`${assignments.length} total`}
        />
        {assignments.length > 0 ? (
          <TeacherClassAssignmentList
            assignments={assignments}
            classSlug={classroom.slug}
          />
        ) : (
          <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed py-10 text-center">
            <p className="font-medium">No class missions yet</p>
            <p className="text-muted-foreground text-sm">
              Publish a passage, then assign it to this class to start collecting takes.
            </p>
          </div>
        )}
      </Panel>

      <TeacherPassageStudio
        key={initialActivity?.id ?? "new-activity"}
        initialActivity={initialActivity}
        classTarget={{
          id: classroom.id,
          name: classroom.name,
          slug: classroom.slug,
        }}
      />
    </section>
  );
}
