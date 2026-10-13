const ITEMS = [
  "English & French scoring",
  "Pronunciation confidence",
  "Fluency · WPM · CEFR",
  "Teacher gradebook",
  "Classroom orchestration",
  "Append-only grading history",
  "Tenant isolation (RLS)",
  "Chunked, resumable uploads",
  "Manual · CPU · GPU tiers",
];

/**
 * GitHub LogoSuite marquee pattern: the track is rendered twice back to back
 * and scrolls exactly one track + one gap per 30s loop, so the seam is
 * invisible. Pauses on hover/focus; edges fade via mask-image. Pure CSS —
 * see `.lp-marquee` in globals.css.
 */
export function FeatureMarquee() {
  const track = (hidden: boolean) => (
    <div className="lp-marquee-group" aria-hidden={hidden || undefined}>
      {ITEMS.map((item) => (
        <span
          key={item}
          className="text-sm font-medium tracking-wide whitespace-nowrap text-white/45"
        >
          {item}
        </span>
      ))}
    </div>
  );

  return (
    <div className="lp-marquee" aria-label="Platform capabilities">
      {track(false)}
      {track(true)}
    </div>
  );
}
