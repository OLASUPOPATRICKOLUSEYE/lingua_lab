import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { StudentMissionCard } from "@/components/student/StudentMissionCard";
import { requireRole } from "@/utils/auth/dal";
import { listStudentAssignments } from "@/utils/student/assignment-data";

export default async function StudentAssignmentsPage() {
  const session = await requireRole(["student"]);
  const assignments = await listStudentAssignments(session);

  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-10">
      <header>
        <Link
          href="/student"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm transition-colors"
        >
          <ArrowLeft className="size-4" />
          Dashboard
        </Link>

        <div className="mt-8 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Choose a passage
            </h1>
            <p className="text-muted-foreground mt-2 text-[15px] leading-7">
              Pick one mission. Hear your teacher, then make one clean take.
            </p>
          </div>
          <p className="text-muted-foreground shrink-0 text-sm">
            {assignments.length} available
          </p>
        </div>
      </header>

      {assignments.length === 0 ? (
        <div className="border-t py-16 text-center">
          <p className="font-medium">No missions yet</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Your teacher hasn&apos;t published a speaking mission for your
            school yet — check back soon.
          </p>
        </div>
      ) : (
        <ul className="divide-y border-t border-b">
          {assignments.map((assignment) => (
            <li key={assignment.id}>
              <StudentMissionCard assignment={assignment} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
