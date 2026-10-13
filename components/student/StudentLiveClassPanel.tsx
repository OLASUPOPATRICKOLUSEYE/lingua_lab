"use client";

import { useSyncExternalStore } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelHeader } from "@/components/dashboard/Panel";
import { LiveClassJoinButton } from "@/components/student/LiveClassJoinButton";
import { ColorCalendarIcon } from "@/components/icons/ColorIcons";
import { PROVIDER_LABELS } from "@/utils/live-sessions/providers";
import {
  type LiveSessionSummary,
  STATE_LABELS,
  formatSessionWindow,
  liveSessionState,
} from "@/utils/live-sessions/state";

interface StudentLiveClassPanelProps {
  sessions: LiveSessionSummary[];
}

const TICK_MS = 30_000;

function subscribeToClock(onChange: () => void): () => void {
  const timer = setInterval(onChange, TICK_MS);
  return () => clearInterval(timer);
}

/**
 * Quantized to the tick so the snapshot is stable between ticks — returning a
 * fresh `Date.now()` on every call would re-render forever.
 */
function getClockSnapshot(): number {
  return Math.floor(Date.now() / TICK_MS);
}

/** No clock on the server; render the time-neutral shape instead. */
function getServerClockSnapshot(): number | null {
  return null;
}

export function StudentLiveClassPanel({ sessions }: StudentLiveClassPanelProps) {
  // Re-renders on a slow tick so a session flips to "Join" at its start time
  // without the student reloading. There is no Socket.io push layer yet
  // (.claude/rules/realtime.md), so this is a deliberate local clock, not a
  // poll against the server. useSyncExternalStore (rather than an effect) also
  // makes the first client render match SSR by construction.
  const tick = useSyncExternalStore(
    subscribeToClock,
    getClockSnapshot,
    getServerClockSnapshot,
  );
  const now = tick === null ? null : new Date();

  if (sessions.length === 0) {
    return null;
  }

  return (
    <Panel>
      <PanelHeader
        icon={<ColorCalendarIcon className="size-5.5" />}
        title="Live classes"
      />
      <ul className="divide-y">
        {sessions.map((session) => {
          // Before hydration `now` is null — render the server-safe "upcoming"
          // shape rather than a time that would mismatch during hydration.
          const state = now ? liveSessionState(session, now) : "upcoming";
          const joinable = state === "live";

          return (
            <li
              key={session.id}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 py-4 first:pt-0 last:pb-0"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">
                    {session.title ?? session.className}
                  </p>
                  <Badge variant={joinable ? "success" : state === "canceled" ? "destructive" : "secondary"}>
                    {STATE_LABELS[state]}
                  </Badge>
                </div>
                <p className="text-muted-foreground text-sm">
                  {formatSessionWindow(session)} · {session.className} ·{" "}
                  {PROVIDER_LABELS[session.provider]}
                </p>
              </div>

              {state === "canceled" ? (
                <p className="text-muted-foreground text-sm">
                  Cancelled by {session.hostName}
                </p>
              ) : joinable ? (
                <LiveClassJoinButton
                  sessionId={session.id}
                  joinUrl={session.joinUrl}
                  providerLabel={PROVIDER_LABELS[session.provider]}
                />
              ) : (
                <Button size="sm" disabled>
                  Join opens shortly before start
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
