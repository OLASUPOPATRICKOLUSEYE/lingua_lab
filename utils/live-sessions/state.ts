import type { LiveSessionProvider } from "@/utils/live-sessions/providers";

/**
 * Shared shape + time-state derivation for live classes. Deliberately NOT
 * server-only: the student panel re-derives state on a timer in the browser so
 * a waiting student sees "Join" appear without a manual refresh (there is no
 * Socket.io layer yet — see .claude/rules/realtime.md).
 */
export interface LiveSessionSummary {
  id: string;
  classId: string;
  className: string;
  classSlug: string;
  hostName: string;
  provider: LiveSessionProvider;
  joinUrl: string;
  title: string | null;
  startsAt: Date;
  endsAt: Date;
  canceledAt: Date | null;
}

export type LiveSessionState = "canceled" | "live" | "upcoming" | "ended";

/**
 * How long before the scheduled start the join link opens. Presentation-layer
 * only (see the `live_sessions` schema comment) — retuning this needs no
 * migration, no backfill, and no job flipping rows.
 */
export const JOIN_WINDOW_BEFORE_MS = 10 * 60 * 1000;

export function liveSessionState(
  session: Pick<LiveSessionSummary, "startsAt" | "endsAt" | "canceledAt">,
  now: Date = new Date(),
): LiveSessionState {
  if (session.canceledAt) return "canceled";
  if (now.getTime() >= session.endsAt.getTime()) return "ended";
  if (now.getTime() >= session.startsAt.getTime() - JOIN_WINDOW_BEFORE_MS) {
    return "live";
  }
  return "upcoming";
}

export function isJoinable(state: LiveSessionState): boolean {
  return state === "live";
}

/**
 * The timetable's timezone, pinned explicitly.
 *
 * Intl defaults to whatever zone the RUNTIME is in — Node on a server is
 * usually UTC, a student's laptop is not — so leaving it unset made the server
 * render "1:15 AM" and the browser "9:15 AM" for the same session, which React
 * reports as a hydration mismatch and then re-renders the whole tree over.
 *
 * Pinning it also fixes a subtler problem: a class starts at a wall-clock time
 * the school agreed on, so a student whose device is set to another timezone
 * should still see the real class time, not their own local translation of it.
 *
 * NEXT_PUBLIC_ so the browser bundle reads the same value the server did —
 * a server-only env var here would reintroduce the mismatch.
 */
const SESSION_TIME_ZONE =
  process.env.NEXT_PUBLIC_SCHOOL_TIMEZONE?.trim() || "Africa/Lagos";

const SESSION_DAY_FORMAT = new Intl.DateTimeFormat("en", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: SESSION_TIME_ZONE,
});

const SESSION_TIME_FORMAT = new Intl.DateTimeFormat("en", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: SESSION_TIME_ZONE,
});

/** e.g. "Mon, Sep 1 · 10:00 AM – 11:00 AM" */
export function formatSessionWindow(
  session: Pick<LiveSessionSummary, "startsAt" | "endsAt">,
): string {
  return `${SESSION_DAY_FORMAT.format(session.startsAt)} · ${SESSION_TIME_FORMAT.format(
    session.startsAt,
  )} – ${SESSION_TIME_FORMAT.format(session.endsAt)}`;
}

export const STATE_LABELS: Record<LiveSessionState, string> = {
  live: "Live now",
  upcoming: "Upcoming",
  ended: "Ended",
  canceled: "Cancelled",
};
