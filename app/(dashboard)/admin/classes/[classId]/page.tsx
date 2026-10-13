import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Panel, PanelHeader } from "@/components/dashboard/Panel";
import { Button } from "@/components/ui/button";
import { HeaderChip, PageHeader } from "@/components/dashboard/PageHeader";
import { ColorSchoolIcon, ColorUsersIcon } from "@/components/icons/ColorIcons";
import { ReassignTeacherForm } from "@/components/admin/ReassignTeacherForm";
import { ClassRosterManager } from "@/components/admin/ClassRosterManager";
import { requireRole } from "@/utils/auth/dal";
import {
  getAdminClassDetail,
  getAssignableStudents,
  getAssignableTeachers,
} from "@/utils/admin/class-data";

interface AdminClassPageProps {
  params: Promise<{ classId: string }>;
}

export default async function AdminClassPage({ params }: AdminClassPageProps) {
  const session = await requireRole(["system_admin", "dept_head"]);
  const { classId } = await params;

  const classDetail = await getAdminClassDetail(session, classId);
  if (!classDetail) {
    notFound();
  }

  const [teachers, assignableStudents] = await Promise.all([
    getAssignableTeachers(session),
    getAssignableStudents(session, classId),
  ]);

  return (
    <section className="flex flex-col gap-4">
      <PageHeader
        kicker="Class settings"
        title={classDetail.name}
        chip={
          <HeaderChip>
            <ColorSchoolIcon className="size-4.5" />
            {classDetail.studentCount}{" "}
            {classDetail.studentCount === 1 ? "student" : "students"}
          </HeaderChip>
        }
        actions={
          <Button asChild variant="outline">
            <Link href="/admin/classes">
              <ArrowLeft className="size-4" />
              Back to classes
            </Link>
          </Button>
        }
      />

      <Panel>
        <PanelHeader icon={<ColorUsersIcon className="size-5.5" />} title="Teacher" />
        <p className="text-muted-foreground mb-4 text-sm">
          Currently taught by{" "}
          <span className="text-foreground font-medium">{classDetail.teacherName}</span>.
        </p>
        <ReassignTeacherForm
          classId={classDetail.id}
          currentTeacherId={classDetail.teacherId}
          teachers={teachers}
        />
      </Panel>

      <Panel>
        <PanelHeader
          icon={<ColorSchoolIcon className="size-5.5" />}
          title="Roster"
          badge={`${classDetail.roster.length} students`}
        />
        <ClassRosterManager
          classId={classDetail.id}
          roster={classDetail.roster}
          assignableStudents={assignableStudents}
        />
      </Panel>
    </section>
  );
}
