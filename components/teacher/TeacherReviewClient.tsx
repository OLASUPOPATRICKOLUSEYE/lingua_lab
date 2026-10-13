"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface TeacherReviewClientProps {
  submissionId: string;
  regradeState: "available" | "missing_processed_audio" | "ai_disabled";
  initialFluencyScore: number | null;
  initialPronunciationScore: number | null;
  initialCefrEstimate: "A1" | "A2" | "B1" | "B2" | "C1" | "C2" | null;
}

export function TeacherReviewClient({
  submissionId,
  regradeState,
  initialFluencyScore,
  initialPronunciationScore,
  initialCefrEstimate,
}: TeacherReviewClientProps) {
  const router = useRouter();
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const [overrideMessage, setOverrideMessage] = useState<string | null>(null);
  const [overridePending, setOverridePending] = useState(false);
  const [regradeError, setRegradeError] = useState<string | null>(null);
  const [regradeMessage, setRegradeMessage] = useState<string | null>(null);
  const [regradePending, setRegradePending] = useState(false);

  async function onOverrideSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    setOverrideError(null);
    setOverrideMessage(null);
    setOverridePending(true);

    const formData = new FormData(form);
    const payload = {
      fluencyScore: Number(formData.get("fluencyScore")),
      pronunciationScore: Number(formData.get("pronunciationScore")),
      cefrEstimate: String(formData.get("cefrEstimate")),
      justification: String(formData.get("justification")),
    };

    const response = await fetch(`/api/grading/${submissionId}/override`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    setOverridePending(false);

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      setOverrideError(body?.error ?? "Failed to save manual grade.");
      return;
    }

    form.reset();
    setOverrideMessage("Manual grade saved. The latest result panel will refresh.");
    startTransition(() => router.refresh());
  }

  async function onRegradeClick(): Promise<void> {
    setRegradeError(null);
    setRegradeMessage(null);
    setRegradePending(true);

    const response = await fetch(`/api/grading/${submissionId}/regrade`, {
      method: "POST",
    });

    setRegradePending(false);

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      setRegradeError(body?.error ?? "Failed to enqueue re-grade.");
      return;
    }

    setRegradeMessage("Re-grade queued. Refreshing the submission timeline now.");
    startTransition(() => router.refresh());
  }

  const canRegrade = regradeState === "available";
  const regradeHint =
    regradeState === "ai_disabled"
      ? "Re-grade is unavailable in manual-review deployments because AI scoring is turned off."
      : regradeState === "missing_processed_audio"
        ? "Re-grade becomes available after processed audio has been generated for this submission."
        : "Re-enqueues the processed WAV through the same AI queue as normal grading.";
  const regradeTone =
    regradeState === "available"
      ? "success"
      : regradeState === "missing_processed_audio"
        ? "warning"
        : "secondary";

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border bg-background/70 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">Manual override</p>
            <Badge variant="outline">Append-only</Badge>
          </div>
          <p className="text-muted-foreground mt-2 text-sm leading-6">
            Save a teacher-reviewed result without mutating the original submission or older grading rows.
          </p>
        </div>
        <div className="rounded-xl border bg-background/70 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">Re-grade</p>
            <Badge variant={regradeTone}>
              {regradeState === "available"
                ? "Available"
                : regradeState === "missing_processed_audio"
                  ? "Waiting"
                  : "Disabled"}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-2 text-sm leading-6">
            {regradeHint}
          </p>
        </div>
      </div>

      <form className="space-y-5" onSubmit={onOverrideSubmit}>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 border-border bg-muted/50 rounded-2xl border p-4">
            <Label htmlFor="fluencyScore">Fluency score</Label>
            <Input
              id="fluencyScore"
              name="fluencyScore"
              type="number"
              min={0}
              max={100}
              defaultValue={initialFluencyScore ?? ""}
              required
            />
          </div>
          <div className="space-y-2 border-border bg-muted/50 rounded-2xl border p-4">
            <Label htmlFor="pronunciationScore">Pronunciation score</Label>
            <Input
              id="pronunciationScore"
              name="pronunciationScore"
              type="number"
              min={0}
              max={100}
              defaultValue={initialPronunciationScore ?? ""}
              required
            />
          </div>
        </div>
        <div className="space-y-2 border-border bg-muted/50 rounded-2xl border p-4">
          <Label htmlFor="cefrEstimate">CEFR estimate</Label>
          <select
            id="cefrEstimate"
            name="cefrEstimate"
            required
            className="border-input bg-background text-foreground focus-visible:border-ring focus-visible:ring-ring/50 h-10 w-full rounded-xl border px-3 text-sm outline-none focus-visible:ring-[3px]"
            defaultValue={initialCefrEstimate ?? "B1"}
          >
            {["A1", "A2", "B1", "B2", "C1", "C2"].map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2 border-border bg-muted/50 rounded-2xl border p-4">
          <Label htmlFor="justification">Justification</Label>
          <Textarea
            id="justification"
            name="justification"
            required
            placeholder="Explain why this manual grade overrides the latest result."
          />
        </div>
        {overrideError ? (
          <p className="text-destructive text-sm">{overrideError}</p>
        ) : null}
        {overrideMessage ? (
          <p className="text-sm text-emerald-700" aria-live="polite">
            {overrideMessage}
          </p>
        ) : null}
        <Button type="submit" disabled={overridePending}>
          {overridePending ? "Saving..." : "Save Manual Grade"}
        </Button>
      </form>

      <div className="space-y-3 border-border bg-muted/50 rounded-2xl border p-4">
        <div>
          <p className="font-medium">Re-grade</p>
          <p className="text-muted-foreground text-sm">
            {regradeHint}
          </p>
        </div>
        {regradeError ? <p className="text-destructive text-sm">{regradeError}</p> : null}
        {regradeMessage ? (
          <p className="text-sm text-emerald-700" aria-live="polite">
            {regradeMessage}
          </p>
        ) : null}
        <Button
          type="button"
          variant="outline"
          disabled={!canRegrade || regradePending}
          onClick={onRegradeClick}
        >
          {regradePending ? "Queueing..." : "Request Re-grade"}
        </Button>
      </div>
    </div>
  );
}
