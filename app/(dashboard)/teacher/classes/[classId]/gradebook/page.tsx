import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelHeader } from "@/components/dashboard/Panel";
import { HeaderChip, PageHeader } from "@/components/dashboard/PageHeader";
import { ColorClipboardIcon } from "@/components/icons/ColorIcons";
import { requireRole } from "@/utils/auth/dal";
import { getClassGradebook } from "@/utils/teacher/gradebook";
import { formatSubmittedAt, scoreColorClass } from "@/utils/presentation/submission";

export const dynamic = "force-dynamic";

interface GradebookPageProps {
  params: Promise<{ classId: string }>;
}

export default async function ClassGradebookPage({ params }: GradebookPageProps) {
  const session = await requireRole(["teacher", "dept_head", "system_admin"]);
  const { classId } = await params;
  const gradebook = await getClassGradebook(session, classId);

  if (!gradebook) {
    notFound();
  }

  const { rows } = gradebook;
  const notStarted = rows.filter((r) => r.takeCount === 0).length;
  const awaiting = rows.reduce((sum, r) => sum + r.awaitingReviewCount, 0);

  return (
    <section className="flex flex-col gap-4">
      <PageHeader
        kicker={gradebook.className}
        title="Gradebook"
        chip={
          <HeaderChip>
            <ColorClipboardIcon className="size-4.5" />
            {rows.length} {rows.length === 1 ? "student" : "students"}
            {awaiting > 0 ? ` · ${awaiting} to review` : ""}
          </HeaderChip>
        }
        actions={
          <Button asChild variant="outline">
            <Link href={`/teacher/classes/${gradebook.classSlug}`}>
              <ArrowLeft className="size-4" />
              Back to class
            </Link>
          </Button>
        }
      />

      <Panel>
        <PanelHeader
          icon={<ColorClipboardIcon className="size-5.5" />}
          title="Latest result per student"
          badge={notStarted > 0 ? `${notStarted} not started` : "everyone has started"}
        />

        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed py-10 text-center">
            <p className="font-medium">No students on this roster</p>
            <p className="text-muted-foreground text-sm">
              Add students to the class before expecting results here.
            </p>
          </div>
        ) : (
          // Wide table: scrolls inside its own container so the page never
          // scrolls sideways on a laptop.
          <div className="overflow-x-auto">
            <table className="w-full min-w-160 border-collapse text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left">
                  <th className="py-2 pr-4 font-medium">Student</th>
                  <th className="py-2 pr-4 text-right font-medium">Takes</th>
                  <th className="py-2 pr-4 text-right font-medium">Fluency</th>
                  <th className="py-2 pr-4 text-right font-medium">Pronunciation</th>
                  <th className="py-2 pr-4 font-medium">CEFR</th>
                  <th className="py-2 pr-4 font-medium">Last take</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.studentId} className="border-b last:border-0">
                    <td className="py-3 pr-4">
                      <p className="font-medium">{row.fullName}</p>
                      <p className="text-muted-foreground text-xs">{row.email}</p>
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums">
                      {row.takeCount}
                    </td>
                    <td
                      className={`py-3 pr-4 text-right font-semibold tabular-nums ${scoreColorClass(
                        row.latestFluencyScore,
                      )}`}
                    >
                      {row.latestFluencyScore ?? "—"}
                    </td>
                    <td
                      className={`py-3 pr-4 text-right font-semibold tabular-nums ${scoreColorClass(
                        row.latestPronunciationScore,
                      )}`}
                    >
                      {row.latestPronunciationScore ?? "—"}
                    </td>
                    <td className="py-3 pr-4">{row.latestCefrEstimate ?? "—"}</td>
                    <td className="text-muted-foreground py-3 pr-4">
                      {row.latestSubmittedAt
                        ? formatSubmittedAt(row.latestSubmittedAt)
                        : "—"}
                    </td>
                    <td className="py-3">
                      {row.takeCount === 0 ? (
                        <Badge variant="secondary">Not started</Badge>
                      ) : row.awaitingReviewCount > 0 ? (
                        <Badge variant="warning">
                          {row.awaitingReviewCount} to review
                        </Badge>
                      ) : (
                        <Badge variant="success">{row.gradedCount} graded</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </section>
  );
}
