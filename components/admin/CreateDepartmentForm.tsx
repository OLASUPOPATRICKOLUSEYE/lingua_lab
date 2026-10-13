"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AssignableUser } from "@/utils/admin/class-data";

interface CreateDepartmentFormProps {
  deptHeads: AssignableUser[];
}

export function CreateDepartmentForm({ deptHeads }: CreateDepartmentFormProps) {
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
      headId: String(formData.get("headId") ?? "") || null,
    };

    const response = await fetch("/api/departments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    setPending(false);

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      setError(body?.error ?? "Failed to create department.");
      return;
    }

    form.reset();
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <form className="grid gap-4 sm:grid-cols-[2fr_2fr_auto] sm:items-end" onSubmit={onSubmit}>
      <div className="space-y-2">
        <Label htmlFor="name">Department name</Label>
        <Input
          id="name"
          name="name"
          placeholder="Modern Languages"
          required
          minLength={2}
          maxLength={120}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="headId">Department head (optional)</Label>
        <select
          id="headId"
          name="headId"
          className="border-input bg-background text-foreground focus-visible:border-ring focus-visible:ring-ring/50 h-10 w-full rounded-xl border px-3 text-sm outline-none focus-visible:ring-[3px]"
          defaultValue=""
        >
          <option value="">No head assigned yet</option>
          {deptHeads.map((head) => (
            <option key={head.id} value={head.id}>
              {head.fullName} ({head.email})
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create department"}
      </Button>
      {error ? (
        <p className="text-destructive text-sm sm:col-span-3">{error}</p>
      ) : null}
    </form>
  );
}
