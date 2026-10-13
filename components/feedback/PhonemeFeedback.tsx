import type { PhonemeScore } from "@lingua/db";
import {
  PHONEME_BAND_META,
  phonemeBand,
  weakPhonemes,
} from "@/utils/presentation/submission";

/**
 * Shared pronunciation feedback: shows the specific sounds a learner should
 * work on, worst first, from the raw phoneme confidences. Bands are computed
 * at the presentation layer (§6.1). Renders nothing useful if the grade has no
 * phoneme scores (Manual/CPU-lite tier) — callers gate on that.
 */
export function PhonemeFeedback({
  scores,
  limit = 8,
}: {
  scores: PhonemeScore[];
  limit?: number;
}) {
  const weak = weakPhonemes(scores);

  if (weak.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Every sound came through clearly — nice work.
      </p>
    );
  }

  const shown = weak.slice(0, limit);
  const remaining = weak.length - shown.length;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {shown.map((score, index) => {
        const band = phonemeBand(score.confidence);
        return (
          <span
            key={`${score.phoneme}-${index}`}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm ${PHONEME_BAND_META[band].chip}`}
            title={`${PHONEME_BAND_META[band].label} · ${Math.round(score.confidence * 100)}% confidence`}
          >
            <span className="font-medium">{score.phoneme}</span>
            <span className="tabular-nums opacity-70">
              {Math.round(score.confidence * 100)}%
            </span>
          </span>
        );
      })}
      {remaining > 0 ? (
        <span className="text-muted-foreground text-sm">+{remaining} more</span>
      ) : null}
    </div>
  );
}
