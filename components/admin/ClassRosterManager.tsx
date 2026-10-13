"use client";

import { startTransition, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { AssignableUser } from "@/utils/admin/class-data";

interface ClassRosterManagerProps {
  classId: string;
  roster: AssignableUser[];
  assignableStudents: AssignableUser[];
}

export function ClassRosterManager({
  classId,
  roster,
  assignableStudents,
}: ClassRosterManagerProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [addPending, setAddPending] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function onAddSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const studentId = String(formData.get("studentId") ?? "");
    if (!studentId) {
      return;
    }

    setError(null);
    setAddPending(true);

    const response = await fetch(`/api/classes/${classId}/memberships`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ studentId }),
    });

    setAddPending(false);

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      setError(body?.error ?? "Failed to add student.");
      return;
    }

    form.reset();
    startTransition(() => router.refresh());
  }

  async function onRemove(studentId: string): Promise<void> {
    setError(null);
    setRemovingId(studentId);

    const response = await fetch(
      `/api/classes/${classId}/memberships/${studentId}`,
      { method: "DELETE" },
    );

    setRemovingId(null);

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      setError(body?.error ?? "Failed to remove student.");
      return;
    }

    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-4">
      {roster.length > 0 ? (
        <ul className="divide-y">
          {roster.map((student) => (
            <li
              key={student.id}
              className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{student.fullName}</p>
                <p className="text-muted-foreground truncate text-sm">
                  {student.email}
                </p>
              </div>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={removingId === student.id}
                onClick={() => onRemove(student.id)}
              >
                {removingId === student.id ? "Removing…" : "Remove"}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-lg border border-dashed py-8 text-center">
          <p className="text-muted-foreground text-sm">
            No students on this roster yet.
          </p>
        </div>
      )}

      {assignableStudents.length > 0 ? (
        <form
          className="flex flex-wrap items-end gap-3 border-t pt-4"
          onSubmit={onAddSubmit}
        >
          <div className="space-y-2">
            <select
              name="studentId"
              required
              defaultValue=""
              className="border-input bg-background text-foreground focus-visible:border-ring focus-visible:ring-ring/50 h-10 min-w-56 rounded-xl border px-3 text-sm outline-none focus-visible:ring-[3px]"
            >
              <option value="" disabled>
                Select a student to add
              </option>
              {assignableStudents.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.fullName} ({student.email})
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="outline" size="sm" disabled={addPending}>
            {addPending ? "Adding…" : "Add to roster"}
          </Button>
        </form>
      ) : roster.length > 0 ? (
        <p className="text-muted-foreground border-t pt-4 text-sm">
          Every student in the school is already on this roster.
        </p>
      ) : (
        <p className="text-muted-foreground border-t pt-4 text-sm">
          No student accounts exist yet —{" "}
          <Link href="/admin/students" className="text-primary font-medium hover:underline">
            create one
          </Link>{" "}
          to add them here.
        </p>
      )}

      {error ? <p className="text-destructive text-sm">{error}</p> : null}
    </div>
  );
}
