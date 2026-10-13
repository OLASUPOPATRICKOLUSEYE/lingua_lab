"use client";

import { startTransition, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AssignableUser } from "@/utils/admin/class-data";

interface CreateClassFormProps {
  teachers: AssignableUser[];
}

export function CreateClassForm({ teachers }: CreateClassFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    setError(null);
    setPending(true);

    const formData = new FormData(form);
    const payload = {
      name: String(formData.get("name") ?? ""),
      teacherId: String(formData.get("teacherId") ?? ""),
    };

    const response = await fetch("/api/classes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    setPending(false);

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      setError(body?.error ?? "Failed to create class.");
      return;
    }

    const { class: created } = (await response.json()) as {
      class: { id: string };
    };
    form.reset();
    startTransition(() => {
      router.refresh();
      router.push(`/admin/classes/${created.id}`);
    });
  }

  if (teachers.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-4 text-center">
        <p className="text-muted-foreground text-sm">
          No teacher accounts exist yet —{" "}
          <Link href="/admin/teachers" className="text-primary font-medium hover:underline">
            create one
          </Link>{" "}
          before you can create a class.
        </p>
      </div>
    );
  }

  return (
    <form className="grid gap-4 sm:grid-cols-[2fr_2fr_auto] sm:items-end" onSubmit={onSubmit}>
      <div className="space-y-2">
        <Label htmlFor="name">Class name</Label>
        <Input id="name" name="name" placeholder="French 9B" required minLength={2} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="teacherId">Teacher</Label>
        <select
          id="teacherId"
          name="teacherId"
          required
          className="border-input bg-background text-foreground focus-visible:border-ring focus-visible:ring-ring/50 h-10 w-full rounded-xl border px-3 text-sm outline-none focus-visible:ring-[3px]"
          defaultValue=""
        >
          <option value="" disabled>
            Select a teacher
          </option>
          {teachers.map((teacher) => (
            <option key={teacher.id} value={teacher.id}>
              {teacher.fullName} ({teacher.email})
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create class"}
      </Button>
      {error ? (
        <p className="text-destructive text-sm sm:col-span-3">{error}</p>
      ) : null}
    </form>
  );
}
