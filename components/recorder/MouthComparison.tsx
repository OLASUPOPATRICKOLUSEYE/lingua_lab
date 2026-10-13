"use client";

import { MouthReview } from "@/components/recorder/MouthReview";

/**
 * MouthComparison — the teacher's reference mouth video next to the student's
 * take, each in its own MouthReview (independent slow-mo / frame-step / zoom).
 * They are NOT frame-synced: mouth study is done by pausing each on the sound
 * being formed and comparing shape, which is more useful than forced sync
 * across two clips of different length. Stacks on narrow screens.
 *
 * Falls back to a single MouthReview of the student take when no reference
 * video is attached, so the caller can use this unconditionally for video.
 */
interface MouthComparisonProps {
  studentSrc: string;
  referenceVideoUrl?: string | null;
  studentLabel?: string;
  referenceLabel?: string;
}

export function MouthComparison({
  studentSrc,
  referenceVideoUrl,
  studentLabel = "Your take",
  referenceLabel = "Teacher model",
}: MouthComparisonProps) {
  if (!referenceVideoUrl) {
    return (
      <MouthReview
        src={studentSrc}
        label="Watch your mouth — slow it down or zoom in"
      />
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-lg border bg-background/60 p-3">
        <MouthReview src={referenceVideoUrl} label={referenceLabel} />
      </div>
      <div className="rounded-lg border bg-background/60 p-3">
        <MouthReview src={studentSrc} label={studentLabel} />
      </div>
    </div>
  );
}
