# Spike: WhisperX as a replacement for Wav2Vec2 + MFA — **NO-GO**

**Date:** 2026-07-05 · **Time-box:** half a day (AGENTS.md Critical Risks) ·
**Question:** can WhisperX replace the specified Wav2Vec2-large + Montreal
Forced Aligner pronunciation pipeline behind `/score/pronunciation`?

## Verdict

**No — build the specified Wav2Vec2 + MFA pipeline.** WhisperX cannot produce
the per-**phoneme** confidence array that `grading_results.phoneme_scores`
(PRD addendum §6.1) requires, and its alignment precision at phone
granularity is materially worse than MFA's. The `/score/pronunciation`
contract is unchanged; nothing in the AI service was refactored (per
`.claude/rules/ai-pipeline.md`, this spike does not touch the endpoint
contract).

## Findings

1. **Granularity is character-level, not phoneme-level.** WhisperX's
   alignment output is character `Segment`s (`start`, `end`, `score` from the
   wav2vec2 CTC emission), aggregated up to words (`mean(char_score)`).
   Characters ≠ phonemes ("th", "eau", silent letters), so char scores cannot
   honestly populate `phoneme_scores[]`, and bands computed from them would
   be fabricated precision. MFA aligns against a real phone set via
   pronunciation dictionaries — exactly the shape we store.

2. **Alignment precision at tight tolerance favors MFA.** Published TIMIT
   comparisons (2026 MFA state-of-alignment paper) put WhisperX at ~52.7%
   word-boundary accuracy at 20ms tolerance, well behind MFA. Word-level
   timestamps for karaoke-style highlighting tolerate that; per-phone GOP
   scoring does not — bad phone boundaries poison the Wav2Vec2 posteriors we
   score against.

3. **What WhisperX is good at, we already have.** Its pipeline is
   faster-whisper (transcription) + VAD + wav2vec2 alignment. Our service
   already runs faster-whisper and silero-vad, and `word_timestamps` already
   flow into `grading_results` (migration 0003). Adopting WhisperX would
   restructure working code to gain a capability (word alignment) we
   effectively have, while still leaving the phoneme layer unbuilt.

4. **Project health (for the record):** actively maintained (v3.8.6,
   2026-05-25), BSD-2-Clause, default alignment models for en/fr/de/es/it —
   no licensing or abandonment reason to avoid it. The rejection is purely
   capability fit.

## Consequences / next steps (Weeks 11–12 work)

- Implement `/score/pronunciation` on the specified stack: MFA pretrained
  EN/FR acoustic models + dictionaries (`mfa model download`, addendum §6.6)
  for phone alignment; Wav2Vec2-large posteriors over aligned phones → raw
  0.0–1.0 confidence per phoneme (GOP-style). Store raw values only; bands
  stay at the presentation layer.
- Keep faster-whisper + silero-vad exactly as wired for transcription /
  word timestamps / VAD gating.
- Revisit WhisperX only if we later want to *improve word-timestamp quality*
  for the read-along UI — that would be an internal implementation detail,
  not a contract change.

## Sources

- https://github.com/m-bain/whisperx (v3.8.6, license, alignment languages)
- https://deepwiki.com/m-bain/whisperX/3.3-forced-alignment-system (char-level
  Segment/score output structure)
- https://arxiv.org/pdf/2606.18466 (MFA vs. alignment tools, TIMIT tolerance
  numbers)
- https://arxiv.org/html/2303.00747v2 (WhisperX paper)
