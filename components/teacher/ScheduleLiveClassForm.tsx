"use client";

import { startTransition, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { LiveSessionProviderOption } from "@/utils/live-sessions/providers";

interface ScheduleLiveClassFormProps {
  classId: string;
  providers: LiveSessionProviderOption[];
}

const DURATION_OPTIONS = [30, 45, 60, 90, 120];

/** `datetime-local` wants a local-time "YYYY-MM-DDTHH:mm" string. */
function defaultStartValue(): string {
  const next = new Date(Date.now() + 60 * 60 * 1000);
  next.setMinutes(next.getMinutes() < 30 ? 30 : 0, 0, 0);
  if (next.getMinutes() === 0) {
    next.setHours(next.getHours() + 1);
  }
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}T${pad(
    next.getHours(),
  )}:${pad(next.getMinutes())}`;
}

export function ScheduleLiveClassForm({
  classId,
  providers,
}: ScheduleLiveClassFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [provider, setProvider] = useState(providers[0]?.value ?? "zoom");
  const initialStart = useMemo(() => defaultStartValue(), []);

  const activeHint =
    providers.find((option) => option.value === provider)?.hint ?? "";

  async function onSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    setError(null);

    const formData = new FormData(form);
    const rawStart = String(formData.get("startsAt") ?? "");
    const startsAt = new Date(rawStart);

    if (Number.isNaN(startsAt.getTime())) {
      setError("Pick a valid start date and time.");
      return;
    }

    setPending(true);
    const response = await fetch("/api/live-sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        classId,
        provider: String(formData.get("provider") ?? ""),
        // In-person classes have no link. Send null, not "": the DB
        // constraint requires join_url IS NULL for that provider.
        joinUrl:
          provider === "in_person"
            ? null
            : String(formData.get("joinUrl") ?? ""),
        title: String(formData.get("title") ?? "") || null,
        // Sent as an absolute instant — the server never guesses a timezone.
        startsAt: startsAt.toISOString(),
        durationMinutes: Number(formData.get("durationMinutes") ?? 60),
      }),
    });

    setPending(false);

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      setError(body?.error ?? "Failed to schedule the live class.");
      return;
    }

    form.reset();
    setProvider(providers[0]?.value ?? "zoom");
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={onSubmit}>
      <div className="space-y-2">
        <Label htmlFor="live-title">Title (optional)</Label>
        <Input
          id="live-title"
          name="title"
          placeholder="Week 3 speaking practice"
          maxLength={120}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="live-provider">Platform</Label>
        <select
          id="live-provider"
          name="provider"
          value={provider}
          onChange={(event) => setProvider(event.target.value as typeof provider)}
          className="border-input bg-background text-foreground focus-visible:border-ring focus-visible:ring-ring/50 h-10 w-full rounded-xl border px-3 text-sm outline-none focus-visible:ring-[3px]"
        >
          {providers.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {provider === "in_person" ? (
        <div className="space-y-2 sm:col-span-2">
          <div className="rounded-xl border bg-background/60 p-4">
            <p className="text-sm font-medium">No meeting link needed</p>
            <p className="text-muted-foreground mt-1 text-sm leading-6">
              Students in the room check in from their own device. Nothing is
              streamed, so this works with no internet connection.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="live-join-url">Meeting link</Label>
          <Input
            id="live-join-url"
            name="joinUrl"
            type="url"
            inputMode="url"
            placeholder={activeHint}
            required
          />
          <p className="text-muted-foreground text-xs">
            Paste the invite link from your own {providers.find((o) => o.value === provider)?.label ?? "meeting"}{" "}
            account. Students open it in a new tab — LinguaLab never joins the call.
          </p>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="live-starts-at">Starts</Label>
        <Input
          id="live-starts-at"
          name="startsAt"
          type="datetime-local"
          defaultValue={initialStart}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="live-duration">Duration</Label>
        <select
          id="live-duration"
          name="durationMinutes"
          defaultValue={60}
          className="border-input bg-background text-foreground focus-visible:border-ring focus-visible:ring-ring/50 h-10 w-full rounded-xl border px-3 text-sm outline-none focus-visible:ring-[3px]"
        >
          {DURATION_OPTIONS.map((minutes) => (
            <option key={minutes} value={minutes}>
              {minutes} minutes
            </option>
          ))}
        </select>
      </div>

      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Scheduling…" : "Schedule live class"}
        </Button>
      </div>

      {error ? (
        <p className="text-destructive text-sm sm:col-span-2">{error}</p>
      ) : null}
    </form>
  );
}
