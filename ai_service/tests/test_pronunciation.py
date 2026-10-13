from __future__ import annotations

import unittest

from ai_service.app.pronunciation import (
    PhonemeInterval,
    build_align_command,
    build_normalized_vocab,
    normalize_phone_label,
    parse_textgrid_phones,
    resolve_mfa_models,
    score_intervals,
)
from ai_service.app.service import _pronunciation_score_from_phonemes
from pathlib import Path

SAMPLE_TEXTGRID = """File type = "ooTextFile"
Object class = "TextGrid"

xmin = 0.0
xmax = 1.2
tiers? <exists>
size = 2
item []:
    item [1]:
        class = "IntervalTier"
        name = "words"
        xmin = 0.0
        xmax = 1.2
        intervals: size = 1
        intervals [1]:
            xmin = 0.0
            xmax = 1.2
            text = "chat"
    item [2]:
        class = "IntervalTier"
        name = "phones"
        xmin = 0.0
        xmax = 1.2
        intervals: size = 4
        intervals [1]:
            xmin = 0.0
            xmax = 0.1
            text = ""
        intervals [2]:
            xmin = 0.1
            xmax = 0.35
            text = "ʃ"
        intervals [3]:
            xmin = 0.35
            xmax = 0.8
            text = "ɛ̃"
        intervals [4]:
            xmin = 0.8
            xmax = 1.2
            text = "sil"
"""


class TextGridParsingTests(unittest.TestCase):
    def test_parses_phone_tier_only_and_skips_silences(self) -> None:
        intervals = parse_textgrid_phones(SAMPLE_TEXTGRID)
        self.assertEqual(
            intervals,
            [
                PhonemeInterval(label="ʃ", start_ms=100, end_ms=350),
                PhonemeInterval(label="ɛ̃", start_ms=350, end_ms=800),
            ],
        )

    def test_words_tier_is_ignored(self) -> None:
        labels = [interval.label for interval in parse_textgrid_phones(SAMPLE_TEXTGRID)]
        self.assertNotIn("chat", labels)


class LabelNormalizationTests(unittest.TestCase):
    def test_strips_stress_and_length_but_keeps_nasality(self) -> None:
        self.assertEqual(normalize_phone_label("ˈaː"), "a")
        self.assertEqual(normalize_phone_label("t͡ʃ"), "tʃ")
        # French nasal vowels stay distinct from their oral counterparts.
        self.assertEqual(normalize_phone_label("ɛ̃"), "ɛ̃")
        self.assertNotEqual(normalize_phone_label("ɛ̃"), normalize_phone_label("ɛ"))

    def test_fold_diacritics_is_a_second_chance_only(self) -> None:
        self.assertEqual(normalize_phone_label("ɛ̃", fold_diacritics=True), "ɛ")

    def test_normalized_vocab_prefers_exact_over_folded(self) -> None:
        vocab = build_normalized_vocab({"ɛ": 1, "ɛ̃": 2})
        self.assertEqual(vocab["ɛ̃"], 2)
        self.assertEqual(vocab["ɛ"], 1)


class ScoreIntervalsTests(unittest.TestCase):
    def setUp(self) -> None:
        # Vocab: a=0, b=1, blank=2. Frames at 20ms hop.
        self.vocab = build_normalized_vocab({"a": 0, "b": 1, "<pad>": 2})

    def test_means_posterior_over_the_interval_frames(self) -> None:
        frame_probs = [
            [0.9, 0.05, 0.05],  # 0–20ms
            [0.7, 0.2, 0.1],  # 20–40ms
            [0.1, 0.8, 0.1],  # 40–60ms
            [0.2, 0.6, 0.2],  # 60–80ms
        ]
        intervals = [
            PhonemeInterval(label="a", start_ms=0, end_ms=40),
            PhonemeInterval(label="b", start_ms=40, end_ms=80),
        ]

        scores = score_intervals(intervals, frame_probs, 20.0, self.vocab)

        self.assertEqual(len(scores), 2)
        self.assertAlmostEqual(scores[0]["confidence"], 0.8)
        self.assertAlmostEqual(scores[1]["confidence"], 0.7)
        self.assertEqual(scores[0]["expected"], "a")
        self.assertEqual(scores[0]["timestamp_ms"], 0)
        self.assertEqual(scores[1]["timestamp_ms"], 40)

    def test_unknown_label_composes_per_character_or_is_skipped(self) -> None:
        frame_probs = [[0.6, 0.3, 0.1]]
        composed = score_intervals(
            [PhonemeInterval(label="ab", start_ms=0, end_ms=20)],
            frame_probs,
            20.0,
            self.vocab,
        )
        self.assertEqual(len(composed), 1)
        self.assertAlmostEqual(composed[0]["confidence"], 0.6)

        skipped = score_intervals(
            [PhonemeInterval(label="zz", start_ms=0, end_ms=20)],
            frame_probs,
            20.0,
            self.vocab,
        )
        self.assertEqual(skipped, [])

    def test_empty_frames_or_zero_hop_returns_nothing(self) -> None:
        intervals = [PhonemeInterval(label="a", start_ms=0, end_ms=20)]
        self.assertEqual(score_intervals(intervals, [], 20.0, self.vocab), [])
        self.assertEqual(
            score_intervals(intervals, [[0.5, 0.4, 0.1]], 0.0, self.vocab), []
        )

    def test_confidence_is_clamped_to_unit_range(self) -> None:
        frame_probs = [[1.2, 0.0, 0.0]]
        scores = score_intervals(
            [PhonemeInterval(label="a", start_ms=0, end_ms=20)],
            frame_probs,
            20.0,
            self.vocab,
        )
        self.assertEqual(scores[0]["confidence"], 1.0)


class MfaWiringTests(unittest.TestCase):
    def test_language_mapping_is_en_fr_only(self) -> None:
        self.assertEqual(resolve_mfa_models("English"), ("english_mfa", "english_mfa"))
        self.assertEqual(resolve_mfa_models("french"), ("french_mfa", "french_mfa"))
        self.assertIsNone(resolve_mfa_models("Yoruba"))
        self.assertIsNone(resolve_mfa_models(None))

    def test_align_command_shape(self) -> None:
        command = build_align_command(
            "mfa",
            Path("/tmp/a.wav"),
            Path("/tmp/a.txt"),
            "english_mfa",
            "english_mfa",
            Path("/tmp/out"),
        )
        self.assertEqual(command[0:2], ["mfa", "align_one"])
        self.assertIn("english_mfa", command)
        self.assertIn("--clean", command)


class ScoreBlendTests(unittest.TestCase):
    def test_mean_confidence_maps_to_0_100(self) -> None:
        scores = [
            {"phoneme": "a", "expected": "a", "confidence": 0.9, "timestamp_ms": 0},
            {"phoneme": "b", "expected": "b", "confidence": 0.5, "timestamp_ms": 100},
        ]
        self.assertEqual(_pronunciation_score_from_phonemes(scores), 70)

    def test_none_or_empty_returns_none(self) -> None:
        self.assertIsNone(_pronunciation_score_from_phonemes(None))
        self.assertIsNone(_pronunciation_score_from_phonemes([]))


if __name__ == "__main__":
    unittest.main()
