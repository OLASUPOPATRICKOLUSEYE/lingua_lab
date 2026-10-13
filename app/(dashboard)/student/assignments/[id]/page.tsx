import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/utils/auth/dal";
import { StudentAssignmentWorkspace } from "@/components/recorder/StudentAssignmentWorkspace";
import { getStudentAssignmentForStudent } from "@/utils/student/assignment-data";

interface AssignmentPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function AssignmentPage({ params }: AssignmentPageProps) {
  const session = await requireRole(["student"]);
  const { id } = await params;
  const assignment = await getStudentAssignmentForStudent(session, id);

  if (!assignment) {
    notFound();
  }

  const lengthLabel = `${Math.round(assignment.activity.timeLimitSeconds / 60)} min`;
  const meta = [
    { label: "Teacher", value: assignment.activity.teacherName },
    { label: "Length", value: lengthLabel },
    { label: "Mode", value: assignment.activity.submissionModes.join(" + ") },
    { label: "Focus", value: assignment.focusLabel },
  ];

  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-10">
      <header>
        <Link
          href="/student/assignments"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm transition-colors"
        >
          <ArrowLeft className="size-4" />
          All missions
        </Link>

        <p className="text-muted-foreground mt-8 text-xs font-medium tracking-[0.18em] uppercase">
          {assignment.moodLabel}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          {assignment.activity.passageTitle}
        </h1>
        <p className="text-muted-foreground mt-4 max-w-2xl text-[15px] leading-7">
          {assignment.summary}
        </p>

        <dl className="mt-8 flex flex-wrap gap-x-10 gap-y-4 border-t pt-6">
          {meta.map((item) => (
            <div key={item.label}>
              <dt className="text-muted-foreground text-xs tracking-wide uppercase">
                {item.label}
              </dt>
              <dd className="mt-1 text-sm font-medium capitalize">{item.value}</dd>
            </div>
          ))}
        </dl>
      </header>

      <StudentAssignmentWorkspace assignment={assignment} />
    </section>
  );
}
