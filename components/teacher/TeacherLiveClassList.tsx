"use client";

import { startTransition, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PROVIDER_LABELS } from "@/utils/live-sessions/providers";
import type { TeacherLiveSessionSummary } from "@/utils/live-sessions/data";
import {
  STATE_LABELS,
  formatSessionWindow,
  liveSessionState,
} from "@/utils/live-sessions/state";

interface TeacherLiveClassListProps {
  sessions: TeacherLiveSessionSummary[];
  canManage: boolean;
}

const STATE_VARIANTS = {
  live: "success",
  upcoming: "secondary",
  ended: "secondary",
  canceled: "destructive",
} as const;

export function TeacherLiveClassList({
  sessions,
  canManage,
}: TeacherLiveClassListProps) {
  const router = useRouter();
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onCancel(id: string): Promise<void> {
    setError(null);
    setCancelingId(id);

    const response = await fetch(`/api/live-sessions/${id}`, {
      method: "DELETE",
    });

    setCancelingId(null);

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      setError(body?.error ?? "Failed to cancel the live class.");
      return;
    }

    startTransition(() => {
      router.refresh();
    });
  }

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed py-10 text-center">
        <p className="font-medium">No live classes scheduled</p>
        <p className="text-muted-foreground text-sm">
          Schedule one above to give this class a Zoom or Google Meet session.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      <ul className="divide-y">
        {sessions.map((session) => {
          const state = liveSessionState(session);
          const canCancel =
            canManage && (state === "live" || state === "upcoming");

          return (
            <li
              key={session.id}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 py-4 first:pt-0 last:pb-0"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">
                    {session.title ?? `${PROVIDER_LABELS[session.provider]} class`}
                  </p>
                  <Badge variant={STATE_VARIANTS[state]}>
                    {STATE_LABELS[state]}
                  </Badge>
                </div>
                <p className="text-muted-foreground text-sm">
                  {formatSessionWindow(session)} · {PROVIDER_LABELS[session.provider]}
                </p>
                {state !== "upcoming" && state !== "canceled" ? (
                  <p className="text-muted-foreground text-sm">
                    {session.joinedCount} of {session.rosterCount} joined
                    {session.joinedCount > 0
                      ? ` · ${session.checkedInCount} checked in`
                      : ""}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {state !== "upcoming" && state !== "canceled" ? (
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/teacher/live-sessions/${session.id}`}>
                      Register
                    </Link>
                  </Button>
                ) : null}
                {state === "live" || state === "upcoming" ? (
                  <Button asChild size="sm" variant="outline">
                    <a
                      href={session.joinUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open link
                    </a>
                  </Button>
                ) : null}
                {canCancel ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={cancelingId === session.id}
                    onClick={() => onCancel(session.id)}
                  >
                    {cancelingId === session.id ? "Cancelling…" : "Cancel"}
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
