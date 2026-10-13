import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Panel, PanelHeader } from "@/components/dashboard/Panel";
import { Button } from "@/components/ui/button";
import { HeaderChip, PageHeader } from "@/components/dashboard/PageHeader";
import { ColorBookIcon, ColorSchoolIcon } from "@/components/icons/ColorIcons";
import { requireRole } from "@/utils/auth/dal";
import { getTeacherClasses } from "@/utils/teacher/class-data";

export default async function TeacherClassesPage() {
  const session = await requireRole(["teacher", "dept_head", "system_admin"]);
  const classes = await getTeacherClasses(session);

  return (
    <section className="flex flex-col gap-4">
      <PageHeader
        kicker="Classes"
        title="Your classes"
        chip={
          <HeaderChip>
            <ColorSchoolIcon className="size-4.5" />
            {classes.length} {classes.length === 1 ? "class" : "classes"}
          </HeaderChip>
        }
        actions={
          <Button asChild variant="outline">
            <Link href="/teacher">
              <ArrowLeft className="size-4" />
              Back to review
            </Link>
          </Button>
        }
      />

      <Panel>
        <PanelHeader icon={<ColorBookIcon className="size-5.5" />} title="All classes" />
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
                    {classroom.studentCount} students · {classroom.activeAssignmentCount} live
                    missions
                  </p>
                </div>
                <Button asChild size="sm" variant="outline">
                  <Link href={`/teacher/classes/${classroom.slug}`}>
                    Open passage studio
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed py-10 text-center">
            <p className="font-medium">No classes assigned to you yet</p>
            <p className="text-muted-foreground text-sm">
              An admin needs to assign you to a class before you can open the passage studio.
            </p>
          </div>
        )}
      </Panel>
    </section>
  );
}
