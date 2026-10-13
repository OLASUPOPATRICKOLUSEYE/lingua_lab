import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Panel, PanelHeader } from "@/components/dashboard/Panel";
import { Button } from "@/components/ui/button";
import { HeaderChip, PageHeader } from "@/components/dashboard/PageHeader";
import { ColorBuildingIcon } from "@/components/icons/ColorIcons";
import { CreateDepartmentForm } from "@/components/admin/CreateDepartmentForm";
import { requireRole } from "@/utils/auth/dal";
import { getDeptHeads } from "@/utils/admin/class-data";
import { getAdminDepartments } from "@/utils/admin/department-data";

export default async function AdminDepartmentsPage() {
  const session = await requireRole(["system_admin", "dept_head"]);
  const [departments, deptHeads] = await Promise.all([
    getAdminDepartments(session),
    getDeptHeads(session),
  ]);

  return (
    <section className="flex flex-col gap-4">
      <PageHeader
        kicker="Departments"
        title="Manage departments"
        chip={
          <HeaderChip>
            <ColorBuildingIcon className="size-4.5" />
            {departments.length}{" "}
            {departments.length === 1 ? "department" : "departments"}
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
        <PanelHeader
          icon={<ColorBuildingIcon className="size-5.5" />}
          title="Create a department"
        />
        <CreateDepartmentForm deptHeads={deptHeads} />
      </Panel>

      <Panel>
        <PanelHeader
          icon={<ColorBuildingIcon className="size-5.5" />}
          title="All departments"
        />
        {departments.length > 0 ? (
          <ul className="divide-y">
            {departments.map((department) => (
              <li
                key={department.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 py-4 first:pt-0 last:pb-0"
              >
                <div className="min-w-0 space-y-1">
                  <p className="font-medium">{department.name}</p>
                  <p className="text-muted-foreground text-sm">
                    {department.headName
                      ? `Led by ${department.headName}`
                      : "No head assigned yet"}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed py-10 text-center">
            <p className="font-medium">No departments yet</p>
            <p className="text-muted-foreground text-sm">
              Create one above to group your school&apos;s teaching areas.
            </p>
          </div>
        )}
      </Panel>
    </section>
  );
}
