import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Panel, PanelHeader } from "@/components/dashboard/Panel";
import { Button } from "@/components/ui/button";
import { HeaderChip, PageHeader } from "@/components/dashboard/PageHeader";
import { ColorUsersIcon } from "@/components/icons/ColorIcons";
import { CreateUserForm } from "@/components/admin/CreateUserForm";
import { requireRole } from "@/utils/auth/dal";
import { getAssignableTeachers } from "@/utils/admin/class-data";

export default async function AdminTeachersPage() {
  const session = await requireRole(["system_admin", "dept_head"]);
  const teachers = await getAssignableTeachers(session);

  return (
    <section className="flex flex-col gap-4">
      <PageHeader
        kicker="Teachers"
        title="Manage teachers"
        chip={
          <HeaderChip>
            <ColorUsersIcon className="size-4.5" />
            {teachers.length} {teachers.length === 1 ? "teacher" : "teachers"}
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
        <PanelHeader icon={<ColorUsersIcon className="size-5.5" />} title="Create a teacher" />
        <CreateUserForm role="teacher" />
      </Panel>

      <Panel>
        <PanelHeader icon={<ColorUsersIcon className="size-5.5" />} title="All teachers" />
        {teachers.length > 0 ? (
          <ul className="divide-y">
            {teachers.map((teacher) => (
              <li key={teacher.id} className="flex items-center justify-between gap-3 py-4 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate font-medium">{teacher.fullName}</p>
                  <p className="text-muted-foreground truncate text-sm">{teacher.email}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed py-10 text-center">
            <p className="font-medium">No teacher accounts yet</p>
            <p className="text-muted-foreground text-sm">
              Create one above before you can assign a class to it.
            </p>
          </div>
        )}
      </Panel>
    </section>
  );
}
