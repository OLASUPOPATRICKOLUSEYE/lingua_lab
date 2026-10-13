import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Panel, PanelHeader } from "@/components/dashboard/Panel";
import { Button } from "@/components/ui/button";
import { HeaderChip, PageHeader } from "@/components/dashboard/PageHeader";
import { ColorUsersIcon } from "@/components/icons/ColorIcons";
import { CreateUserForm } from "@/components/admin/CreateUserForm";
import { requireRole } from "@/utils/auth/dal";
import { getDeptHeads } from "@/utils/admin/class-data";

export default async function AdminDeptHeadsPage() {
  // Only system_admin — matches /api/dept-heads, which restricts creation to
  // system_admin since dept_head is a peer-level admin role.
  const session = await requireRole(["system_admin"]);
  const deptHeads = await getDeptHeads(session);

  return (
    <section className="flex flex-col gap-4">
      <PageHeader
        kicker="Department heads"
        title="Manage department heads"
        chip={
          <HeaderChip>
            <ColorUsersIcon className="size-4.5" />
            {deptHeads.length} {deptHeads.length === 1 ? "department head" : "department heads"}
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
          icon={<ColorUsersIcon className="size-5.5" />}
          title="Create a department head"
        />
        <CreateUserForm role="dept_head" />
      </Panel>

      <Panel>
        <PanelHeader icon={<ColorUsersIcon className="size-5.5" />} title="All department heads" />
        {deptHeads.length > 0 ? (
          <ul className="divide-y">
            {deptHeads.map((deptHead) => (
              <li key={deptHead.id} className="flex items-center justify-between gap-3 py-4 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate font-medium">{deptHead.fullName}</p>
                  <p className="text-muted-foreground truncate text-sm">{deptHead.email}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed py-10 text-center">
            <p className="font-medium">No department head accounts yet</p>
            <p className="text-muted-foreground text-sm">
              Create one above to share school-operations access.
            </p>
          </div>
        )}
      </Panel>
    </section>
  );
}
