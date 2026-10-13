import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelHeader } from "@/components/dashboard/Panel";
import { HeaderChip, PageHeader } from "@/components/dashboard/PageHeader";
import { ColorCalendarIcon, ColorUsersIcon } from "@/components/icons/ColorIcons";
import { requireRole } from "@/utils/auth/dal";
import { getLiveSessionAttendance } from "@/utils/live-sessions/data";

interface LiveSessionRegisterPageProps {
  params: Promise<{ id: string }>;
}

const JOINED_AT_FORMAT = new Intl.DateTimeFormat("en", {
  hour: "numeric",
  minute: "2-digit",
});

export default async function LiveSessionRegisterPage({
  params,
}: LiveSessionRegisterPageProps) {
  const session = await requireRole(["teacher", "dept_head", "system_admin"]);
  const { id } = await params;
  const register = await getLiveSessionAttendance(session, id);

  if (!register) {
    notFound();
  }

  const { attended, absent } = register;
  const rosterCount = attended.length + absent.length;

  return (
    <section className="flex flex-col gap-4">
      <PageHeader
        kicker="Live class"
        title="Attendance register"
        chip={
          <HeaderChip>
            <ColorUsersIcon className="size-4.5" />
            {attended.length} of {rosterCount} joined
          </HeaderChip>
        }
        actions={
          <Button asChild variant="outline">
            <Link href="/teacher/classes">
              <ArrowLeft className="size-4" />
              Back to classes
            </Link>
          </Button>
        }
      />

      <Panel>
        <PanelHeader
          icon={<ColorCalendarIcon className="size-5.5" />}
          title="Joined"
          badge={`${attended.length}`}
        />
        {attended.length > 0 ? (
          <ul className="divide-y">
            {attended.map((student) => (
              <li
                key={student.studentId}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0"
              >
                <p className="min-w-0 truncate font-medium">{student.fullName}</p>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-sm tabular-nums">
                    {JOINED_AT_FORMAT.format(student.joinedAt)}
                  </span>
                  <Badge variant={student.checkedIn ? "success" : "secondary"}>
                    {student.checkedIn ? "Checked in" : "Joined only"}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed py-10 text-center">
            <p className="font-medium">Nobody joined from LinguaLab</p>
            <p className="text-muted-foreground text-sm">
              Students who opened the meeting directly from the provider link
              cannot be recorded here.
            </p>
          </div>
        )}
      </Panel>

      <Panel>
        <PanelHeader
          icon={<ColorUsersIcon className="size-5.5" />}
          title="No record"
          badge={`${absent.length}`}
        />
        {absent.length > 0 ? (
          <ul className="divide-y">
            {absent.map((student) => (
              <li
                key={student.studentId}
                className="py-3 first:pt-0 last:pb-0"
              >
                <p className="truncate font-medium">{student.fullName}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">
            Everyone on the roster has a join record.
          </p>
        )}
      </Panel>

      <p className="text-muted-foreground text-sm">
        This register records who opened the meeting from LinguaLab. It is not
        proof of presence for the whole class — a student who joins and leaves
        still appears here, and one who joins from a calendar invite instead of
        this app does not appear at all.
      </p>
    </section>
  );
}
