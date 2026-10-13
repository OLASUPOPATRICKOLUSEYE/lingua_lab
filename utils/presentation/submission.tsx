import { Badge } from "@/components/ui/badge";
import type { PhonemeScore } from "@lingua/db";

/**
 * Presentation-layer mapping for submission lifecycle + score bands.
 *
 * Score bands ("strong"/"steady"/"needs work") are computed HERE, at the
 * presentation layer, from the raw 0-100 scores — never stored. Thresholds can
 * be retuned without re-grading (see .claude/rules/data-model.md).
 */

type StatusVariant = "default" | "secondary" | "success" | "warning" | "destructive";

const STATUS_META: Record<string, { label: string; variant: StatusVariant }> = {
  pending: { label: "Pending", variant: "secondary" },
  processing: { label: "Processing", variant: "warning" },
  pending_review: { label: "Teacher review", variant: "warning" },
  graded: { label: "Graded", variant: "success" },
  failed: { label: "Failed", variant: "destructive" },
};

export function statusMeta(status: string): { label: string; variant: StatusVariant } {
  return (
    STATUS_META[status] ?? {
      label: status.replace(/_/g, " "),
      variant: "secondary",
    }
  );
}

/** Renders a submission status as a colored badge. */
export function StatusBadge({ status }: { status: string }) {
  const meta = statusMeta(status);
  return (
    <Badge variant={meta.variant} className="capitalize">
      {meta.label}
    </Badge>
  );
}

/**
 * Whether a submission should be played back with a picture.
 *
 * Prefers the stored `submissions.media_type`, which is the only reliable
 * answer: MediaRecorder emits audio/webm and video/webm into the same ".webm"
 * container (and audio/mp4 and video/mp4 into ".mp4"), so the file extension
 * cannot distinguish them. Rows created before that column existed fall back to
 * the old extension heuristic — still ambiguous, but it preserves exactly the
 * behaviour those rows already had rather than silently reclassifying them.
 */
export function resolveSubmissionMediaType(
  mediaType: string | null,
  rawStoragePath: string,
): "audio" | "video" {
  if (mediaType === "video") return "video";
  if (mediaType === "audio") return "audio";
  return /\.(webm|mp4)$/i.test(rawStoragePath) ? "video" : "audio";
}

const SUBMITTED_AT_FORMAT = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/**
 * Deterministic, compact timestamp for submission rows across all consoles.
 *
 * Accepts a string or number as well as a Date, and returns a dash rather than
 * throwing. Intl throws RangeError on an invalid value, and because this runs
 * inside server-rendered lists a single bad timestamp took down the WHOLE page
 * — which is how a raw pg date string surfaced as a 500 on the gradebook. A
 * missing timestamp should cost one cell, not the screen.
 */
export function formatSubmittedAt(
  date: Date | string | number | null | undefined,
): string {
  if (date === null || date === undefined) return "—";
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return "—";
  return SUBMITTED_AT_FORMAT.format(value);
}

type ScoreBand = "strong" | "steady" | "needs-work";

/** Map a raw 0-100 score to a qualitative band. Presentation-only. */
export function scoreBand(score: number): ScoreBand {
  if (score >= 80) return "strong";
  if (score >= 60) return "steady";
  return "needs-work";
}

/** Tailwind text-color class for a raw score, following the band thresholds. */
export function scoreColorClass(score: number | null | undefined): string {
  if (score == null) return "text-muted-foreground";
  const band = scoreBand(score);
  if (band === "strong") return "text-emerald-600 dark:text-emerald-400";
  if (band === "steady") return "text-amber-600 dark:text-amber-400";
  return "text-destructive";
}

/**
 * Phoneme confidence bands (PRD addendum §6.1): >=0.8 strong, 0.3–0.8 weak,
 * <0.3 flagged. Computed here from the raw stored confidence so thresholds can
 * be retuned without re-grading. "flagged" and "weak" are what a learner should
 * work on; "strong" needs no attention.
 */
export type PhonemeBand = "strong" | "weak" | "flagged";

export function phonemeBand(confidence: number): PhonemeBand {
  if (confidence >= 0.8) return "strong";
  if (confidence >= 0.3) return "weak";
  return "flagged";
}

export const PHONEME_BAND_META: Record<
  PhonemeBand,
  { label: string; chip: string }
> = {
  strong: {
    label: "Clear",
    chip: "border-transparent bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  },
  weak: {
    label: "Work on it",
    chip: "border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-300",
  },
  flagged: {
    label: "Needs work",
    chip: "border-transparent bg-destructive/12 text-destructive",
  },
};

/** Distinct phonemes that need attention (weak or flagged), worst first. */
export function weakPhonemes(scores: PhonemeScore[]): PhonemeScore[] {
  const worstByPhoneme = new Map<string, PhonemeScore>();
  for (const score of scores) {
    if (phonemeBand(score.confidence) === "strong") continue;
    const existing = worstByPhoneme.get(score.phoneme);
    if (!existing || score.confidence < existing.confidence) {
      worstByPhoneme.set(score.phoneme, score);
    }
  }
  return [...worstByPhoneme.values()].sort(
    (a, b) => a.confidence - b.confidence,
  );
}
