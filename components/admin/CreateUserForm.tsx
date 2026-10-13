"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface CreateUserFormProps {
  role: "teacher" | "student" | "dept_head";
}

const COPY = {
  teacher: {
    endpoint: "/api/teachers",
    responseKey: "teacher" as const,
    noun: "teacher",
    namePlaceholder: "Mme Moreau",
    emailPlaceholder: "teacher@school.org",
  },
  student: {
    endpoint: "/api/students",
    responseKey: "student" as const,
    noun: "student",
    namePlaceholder: "Amina Diallo",
    emailPlaceholder: "student@school.org",
  },
  dept_head: {
    endpoint: "/api/dept-heads",
    responseKey: "deptHead" as const,
    noun: "department head",
    namePlaceholder: "Mr. Adeyemi",
    emailPlaceholder: "depthead@school.org",
  },
};

export function CreateUserForm({ role }: CreateUserFormProps) {
  const copy = COPY[role];
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    setError(null);
    setMessage(null);
    setPending(true);

    const formData = new FormData(form);
    const payload = {
      fullName: String(formData.get("fullName") ?? ""),
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
    };

    const response = await fetch(copy.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    setPending(false);

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      setError(body?.error ?? `Failed to create ${copy.noun}.`);
      return;
    }

    const json = (await response.json()) as Record<
      "teacher" | "student" | "deptHead",
      { fullName: string; email: string }
    >;
    const createdUser = json[copy.responseKey];
    form.reset();
    setMessage(
      `${createdUser.fullName} can now sign in with ${createdUser.email} and the password you set.`,
    );
    startTransition(() => router.refresh());
  }

  return (
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={onSubmit}>
      <div className="space-y-2">
        <Label htmlFor="fullName">Full name</Label>
        <Input
          id="fullName"
          name="fullName"
          placeholder={copy.namePlaceholder}
          required
          minLength={2}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder={copy.emailPlaceholder}
          required
        />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="password">Temporary password</Label>
        <Input
          id="password"
          name="password"
          type="text"
          placeholder="At least 8 characters"
          required
          minLength={8}
        />
        <p className="text-muted-foreground text-xs">
          Shown here as plain text so you can hand it to the {copy.noun} directly —
          there&apos;s no invite-email flow yet. They can change it after signing in.
        </p>
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : `Create ${copy.noun}`}
        </Button>
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
        {message ? (
          <p className="text-sm text-emerald-600 dark:text-emerald-400">{message}</p>
        ) : null}
      </div>
    </form>
  );
}
