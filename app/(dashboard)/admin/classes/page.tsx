import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Panel, PanelHeader } from "@/components/dashboard/Panel";
import { Button } from "@/components/ui/button";
import { HeaderChip, PageHeader } from "@/components/dashboard/PageHeader";
import { ColorSchoolIcon, ColorUsersIcon } from "@/components/icons/ColorIcons";
import { CreateClassForm } from "@/components/admin/CreateClassForm";
import { requireRole } from "@/utils/auth/dal";
import { getAdminClasses, getAssignableTeachers } from "@/utils/admin/class-data";

export default async function AdminClassesPage() {
  const session = await requireRole(["system_admin", "dept_head"]);
  const [classes, teachers] = await Promise.all([
    getAdminClasses(session),
    getAssignableTeachers(session),
  ]);

  return (
    <section className="flex flex-col gap-4">
      <PageHeader
        kicker="Classes"
        title="Manage classes"
        chip={
          <HeaderChip>
            <ColorSchoolIcon className="size-4.5" />
            {classes.length} {classes.length === 1 ? "class" : "classes"}
          </HeaderChip>
        }
        actions={
          <Button asChild variant="outline">
            <Link href="/admin">
              <ArrowLeft className="size-4" />
              Back to overview
            </Link>
          </Button>
        }
      />

      <Panel>
        <PanelHeader icon={<ColorUsersIcon className="size-5.5" />} title="Create a class" />
        <CreateClassForm teachers={teachers} />
      </Panel>

      <Panel>
        <PanelHeader icon={<ColorSchoolIcon className="size-5.5" />} title="All classes" />
        {classes.length > 0 ? (
          <ul className="divide-y">
            {classes.map((classroom) => (
              <li
                key={classroom.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 py-4 first:pt-0 last:pb-0"
              >
                <div className="min-w-0 space-y-1">
                  <p className="font-medium">{classroom.name}</p>
                  <p className="text-muted-foreground text-sm">
                    Taught by {classroom.teacherName} · {classroom.studentCount} students
                  </p>
                </div>
                <Button asChild size="sm" variant="outline">
                  <Link href={`/admin/classes/${classroom.id}`}>
                    Manage
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed py-10 text-center">
            <p className="font-medium">No classes yet</p>
            <p className="text-muted-foreground text-sm">
              Create one above to give a teacher somewhere to publish passages.
            </p>
          </div>
        )}
      </Panel>
    </section>
  );
}
