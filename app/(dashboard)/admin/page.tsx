import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Panel, PanelHeader } from "@/components/dashboard/Panel";
import { HeaderChip, PageHeader } from "@/components/dashboard/PageHeader";
import {
  ColorBuildingIcon,
  ColorDatabaseIcon,
  ColorUsersIcon,
} from "@/components/icons/ColorIcons";
import { StatTile } from "@/components/dashboard/StatTile";
import { requireRole } from "@/utils/auth/dal";
import { getAdminDashboardData } from "@/utils/dashboard/data";

export default async function AdminConsolePage() {
  const session = await requireRole(["system_admin", "dept_head"]);
  const data = await getAdminDashboardData(session);
  const firstName = data.fullName?.split(/\s+/)[0] ?? null;
  const processedPct =
    data.submissionTotal > 0
      ? Math.round((data.processedMediaTotal / data.submissionTotal) * 100)
      : 0;

  return (
    <section className="flex flex-col gap-4">
      <PageHeader
        kicker={`Welcome back${firstName ? `, ${firstName}` : ""} 👋`}
        title="Operations overview"
        chip={
          <HeaderChip className="capitalize">
            <ColorBuildingIcon className="size-4.5" />
            {session.role.replace("_", " ")}
          </HeaderChip>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Users"
          value={data.userTotal}
          hint="Active user records"
        />
        <StatTile
          label="Student takes"
          value={data.submissionTotal}
          hint={`${data.gradedSubmissionTotal} graded`}
        />
        <StatTile
          label="Active flow"
          value={data.activeSubmissionTotal}
          hint="Pending / processing / review"
        />
        <StatTile
          label="Grading runs"
          value={data.gradingRunTotal}
          hint="Across all submissions"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Panel>
          <PanelHeader
            icon={<ColorUsersIcon className="size-5.5" />}
            title="People"
            badge={`${data.userTotal} users`}
          />
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              {
                label: "Teachers",
                value: data.teacherTotal,
                note: "Review and authoring",
                href: "/admin/teachers",
              },
              {
                label: "Students",
                value: data.studentTotal,
                note: "Practice and submissions",
                href: "/admin/students",
              },
              {
                label: "Admins",
                value: data.adminTotal,
                note: "School operations",
                href: session.role === "system_admin" ? "/admin/dept-heads" : null,
              },
            ].map((row) => {
              const content = (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-muted-foreground text-[0.72rem] font-semibold tracking-[0.16em] uppercase">
                      {row.label}
                    </p>
                    {row.href ? (
                      <ArrowRight className="text-muted-foreground group-hover:text-foreground size-4 transition group-hover:translate-x-0.5" />
                    ) : null}
                  </div>
                  <p className="pt-2 text-2xl font-semibold tracking-tight tabular-nums">
                    {row.value}
                  </p>
                  <p className="text-muted-foreground pt-2 text-sm leading-5">{row.note}</p>
                </>
              );

              return row.href ? (
                <Link
                  key={row.label}
                  href={row.href}
                  className="group hover:border-primary/40 hover:bg-background rounded-xl border bg-background/60 p-4 transition-colors"
                >
                  {content}
                </Link>
              ) : (
                <div key={row.label} className="rounded-xl border bg-background/60 p-4">
                  {content}
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            icon={<ColorDatabaseIcon className="size-5.5" />}
            title="Media pipeline"
            badge={`${processedPct}% processed`}
          />
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-3xl font-semibold tracking-tight tabular-nums">
                {data.processedMediaTotal}
                <span className="text-muted-foreground text-lg font-normal">
                  {" "}
                  / {data.submissionTotal}
                </span>
              </p>
              <p className="text-muted-foreground text-sm">
                Student takes with a processed media artifact
              </p>
            </div>
            <div className="bg-foreground/10 h-2 overflow-hidden rounded-full">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${processedPct}%` }}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border bg-background/60 p-3">
                <p className="text-muted-foreground text-[0.72rem] font-semibold tracking-[0.16em] uppercase">
                  Pending flow
                </p>
                <p className="pt-2 text-lg font-semibold tabular-nums">
                  {data.activeSubmissionTotal}
                </p>
              </div>
              <div className="rounded-xl border bg-background/60 p-3">
                <p className="text-muted-foreground text-[0.72rem] font-semibold tracking-[0.16em] uppercase">
                  Graded
                </p>
                <p className="pt-2 text-lg font-semibold tabular-nums">
                  {data.gradedSubmissionTotal}
                </p>
              </div>
              <div className="rounded-xl border bg-background/60 p-3">
                <p className="text-muted-foreground text-[0.72rem] font-semibold tracking-[0.16em] uppercase">
                  Runs
                </p>
                <p className="pt-2 text-lg font-semibold tabular-nums">
                  {data.gradingRunTotal}
                </p>
              </div>
            </div>
          </div>
        </Panel>
      </div>
    </section>
  );
}
