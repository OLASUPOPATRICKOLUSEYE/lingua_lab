"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { AssignableUser } from "@/utils/admin/class-data";

interface ReassignTeacherFormProps {
  classId: string;
  currentTeacherId: string;
  teachers: AssignableUser[];
}

export function ReassignTeacherForm({
  classId,
  currentTeacherId,
  teachers,
}: ReassignTeacherFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const teacherId = String(formData.get("teacherId") ?? "");
    if (teacherId === currentTeacherId) {
      return;
    }

    setError(null);
    setPending(true);

    const response = await fetch(`/api/classes/${classId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ teacherId }),
    });

    setPending(false);

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      setError(body?.error ?? "Failed to reassign teacher.");
      return;
    }

    startTransition(() => router.refresh());
  }

  return (
    <form className="flex flex-wrap items-end gap-3" onSubmit={onSubmit}>
      <div className="space-y-2">
        <select
          name="teacherId"
          defaultValue={currentTeacherId}
          className="border-input bg-background text-foreground focus-visible:border-ring focus-visible:ring-ring/50 h-10 rounded-xl border px-3 text-sm outline-none focus-visible:ring-[3px]"
        >
          {teachers.map((teacher) => (
            <option key={teacher.id} value={teacher.id}>
              {teacher.fullName} ({teacher.email})
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Reassign teacher"}
      </Button>
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
    </form>
  );
}
