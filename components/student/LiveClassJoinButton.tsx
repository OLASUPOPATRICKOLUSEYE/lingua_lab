"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface LiveClassJoinButtonProps {
  sessionId: string;
  joinUrl: string;
  providerLabel: string;
}

/**
 * Fire-and-forget attendance write.
 *
 * sendBeacon rather than await-ing a fetch, for two reasons: the click that
 * calls this is simultaneously opening the meeting in a new tab, and a student
 * must never wait on (or be blocked by) attendance bookkeeping to get into
 * class. A lost row is an acceptable failure; a missed class is not.
 */
function recordAttendance(sessionId: string, checkedIn: boolean): void {
  const url = `/api/live-sessions/${sessionId}/attendance`;
  const body = JSON.stringify({ checkedIn });

  try {
    const blob = new Blob([body], { type: "application/json" });
    if (navigator.sendBeacon?.(url, blob)) {
      return;
    }
  } catch {
    // Fall through to the fetch below.
  }

  void fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {
    // Deliberately swallowed — see the doc comment.
  });
}

export function LiveClassJoinButton({
  sessionId,
  joinUrl,
  providerLabel,
}: LiveClassJoinButtonProps) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Button size="sm" onClick={() => setConfirming(true)}>
        Join {providerLabel}
      </Button>
    );
  }

  // Both paths below are real anchors carrying the user's own click. Opening
  // the meeting from a callback AFTER an awaited request would leave the
  // gesture context and get swallowed by popup blockers.
  return (
    <div className="bg-muted/40 flex w-full flex-col gap-2 rounded-xl border p-3 sm:w-auto sm:min-w-64">
      <p className="text-sm font-medium">Checking in for this class?</p>
      <Button asChild size="sm">
        <a
          href={joinUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => recordAttendance(sessionId, true)}
        >
          I&apos;m here — join now
        </a>
      </Button>
      <div className="flex items-center justify-between gap-2">
        <a
          href={joinUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-2"
          onClick={() => recordAttendance(sessionId, false)}
        >
          Join without checking in
        </a>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="text-muted-foreground hover:text-foreground text-xs"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
