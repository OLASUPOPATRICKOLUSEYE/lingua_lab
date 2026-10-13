// Imported from the `/schema` subpath, NOT the `@lingua/db` barrel: the barrel
// re-exports client.ts, which builds a pg Pool at module scope and throws
// without DATABASE_URL. This module stays free of that so it can be reached
// from anywhere without dragging a database connection along.
import {
  LIVE_SESSION_PROVIDERS,
  type LiveSessionProvider,
} from "@lingua/db/schema";

export { LIVE_SESSION_PROVIDERS };
export type { LiveSessionProvider };

export interface LiveSessionProviderOption {
  value: LiveSessionProvider;
  label: string;
  hint: string;
}

export const PROVIDER_LABELS: Record<LiveSessionProvider, string> = {
  zoom: "Zoom",
  google_meet: "Google Meet",
  in_person: "In Person",
};

export const PROVIDER_URL_HINTS: Record<LiveSessionProvider, string> = {
  zoom: "https://us02web.zoom.us/j/1234567890",
  google_meet: "https://meet.google.com/abc-defg-hij",
  // In-person classes have no meeting URL — the UI should hide the join-URL
  // field entirely when this provider is selected.
  in_person: "",
};

/** Provider choices for the scheduling UI. */
export function liveSessionProviderOptions(): LiveSessionProviderOption[] {
  return LIVE_SESSION_PROVIDERS.map((value) => ({
    value,
    label: PROVIDER_LABELS[value],
    hint: PROVIDER_URL_HINTS[value],
  }));
}

/**
 * Host allowlist per provider. This is a security boundary, not a convenience
 * check: the join URL is teacher-supplied and rendered as a link students are
 * told to click. Without an allowlist, anyone who can schedule a class can
 * point a whole roster at an arbitrary site — a phishing primitive handed out
 * with the school's own branding around it.
 *
 * Matching is on `URL.hostname` (never the raw string), so credential tricks
 * like `https://meet.google.com@evil.example/` resolve to their real host
 * (`evil.example`) and are rejected.
 */
const PROVIDER_HOSTS: Record<LiveSessionProvider, (hostname: string) => boolean> = {
  // Zoom hands out per-datacenter subdomains (us02web.zoom.us, eu01web.zoom.us…)
  // as well as bare zoom.us links.
  zoom: (hostname) => hostname === "zoom.us" || hostname.endsWith(".zoom.us"),
  google_meet: (hostname) => hostname === "meet.google.com",
  // In-person sessions have no URL. No hostname is ever valid here, so
  // isValidJoinUrl("in_person", anyUrl) always returns false. The API route
  // and scheduling UI MUST gate on provider === "in_person" and skip URL
  // validation entirely — otherwise in_person submissions will always fail the
  // superRefine check in payloadSchema (app/api/live-sessions/route.ts:34).
  // That guard is not yet in place: route.ts line 26 requires joinUrl.min(1)
  // unconditionally, and line 34 calls isValidJoinUrl without a provider check.
  // See the flagged gap in the audit report — this needs a follow-up fix before
  // the in_person scheduling flow is wired to the UI.
  in_person: () => false,
};

export function isLiveSessionProvider(
  value: string,
): value is LiveSessionProvider {
  return (LIVE_SESSION_PROVIDERS as readonly string[]).includes(value);
}

/**
 * True only for an https URL whose hostname is on the given provider's
 * allowlist. Anything unparseable, non-https, or off-host is rejected.
 */
export function isValidJoinUrl(
  provider: LiveSessionProvider,
  rawUrl: string,
): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:") {
    return false;
  }

  return PROVIDER_HOSTS[provider](parsed.hostname.toLowerCase());
}

export function joinUrlError(provider: LiveSessionProvider): string {
  return provider === "zoom"
    ? "Enter a valid https Zoom link (zoom.us)."
    : "Enter a valid https Google Meet link (meet.google.com).";
}
