from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from ai_service.app.config import Settings
from ai_service.app.schemas import GradingRequest, WordTimestamp
from ai_service.app.service import (
    AiGradingService,
    WhisperArtifacts,
    _compute_word_error_rate,
    _estimate_cefr,
    _estimate_fluency_score,
    _estimate_pronunciation_score,
)


class HeuristicTests(unittest.TestCase):
    def test_fluency_score_prefers_reasonable_cadence(self) -> None:
        self.assertEqual(_estimate_fluency_score(24, 12.0), 100)
        self.assertLess(_estimate_fluency_score(8, 30.0) or 0, 70)

    def test_pronunciation_proxy_uses_word_coverage_and_stability(self) -> None:
        stable = [
            WordTimestamp(word="bonjour", start_ms=0, end_ms=400),
            WordTimestamp(word="tout", start_ms=520, end_ms=850),
            WordTimestamp(word="le", start_ms=940, end_ms=1140),
            WordTimestamp(word="monde", start_ms=1250, end_ms=1680),
        ]
        unstable = [
            WordTimestamp(word="bonjour", start_ms=0, end_ms=120),
            WordTimestamp(word="tout", start_ms=1800, end_ms=2050),
            WordTimestamp(word="le", start_ms=3400, end_ms=3490),
            WordTimestamp(word="monde", start_ms=6100, end_ms=7000),
        ]

        stable_score = _estimate_pronunciation_score(stable, 3.0)
        unstable_score = _estimate_pronunciation_score(unstable, 8.0)

        self.assertIsNotNone(stable_score)
        self.assertIsNotNone(unstable_score)
        self.assertGreater(stable_score or 0, unstable_score or 0)

    def test_cefr_estimate_scales_with_length_and_speed(self) -> None:
        self.assertEqual(_estimate_cefr(5, 15.0), "A1")
        self.assertEqual(_estimate_cefr(18, 14.0), "A2")
        self.assertEqual(_estimate_cefr(36, 22.0), "B1")
        self.assertEqual(_estimate_cefr(65, 30.0), "B2")

    def test_word_error_rate_compares_expected_and_actual_passage(self) -> None:
        self.assertEqual(_compute_word_error_rate("bonjour tout le monde", "bonjour tout le monde"), 0.0)
        self.assertAlmostEqual(
            _compute_word_error_rate("bonjour tout le monde", "bonjour le monde") or 0.0,
            1 / 4,
        )


class ServiceGradeTests(unittest.TestCase):
    def test_grade_returns_heuristic_scores(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            audio_path = Path(tmp_dir) / "sample.wav"
            audio_path.write_bytes(b"fake wav contents")

            service = AiGradingService(
                Settings(
                    storage_root=Path(tmp_dir),
                    transcribe_model="small",
                    transcribe_device="cpu",
                    transcribe_compute_type="int8",
                    require_vad=False,
                )
            )

            request = GradingRequest(
                submission_id="11111111-1111-1111-8111-111111111111",
                school_id="22222222-2222-2222-8222-222222222222",
                student_id="33333333-3333-3333-8333-333333333333",
                activity_id="44444444-4444-4444-8444-444444444444",
                processed_path=str(audio_path),
                expected_transcript="bonjour tout le monde",
                target_language="French",
            )

            with (
                patch.object(service, "_run_vad_gate"),
                patch.object(
                    service,
                    "_transcribe",
                    return_value=WhisperArtifacts(
                        transcript="bonjour tout le monde",
                        word_timestamps=[
                            WordTimestamp(word="bonjour", start_ms=0, end_ms=420),
                            WordTimestamp(word="tout", start_ms=520, end_ms=760),
                            WordTimestamp(word="le", start_ms=840, end_ms=980),
                            WordTimestamp(word="monde", start_ms=1100, end_ms=1480),
                        ],
                    ),
                ),
                patch("ai_service.app.service._read_audio_duration_seconds", return_value=3.0),
            ):
                result = service.grade(request)

            self.assertEqual(result.transcript, "bonjour tout le monde")
            self.assertEqual(result.wpm, 80)
            self.assertEqual(result.fluency_score, 76)
            self.assertIsNotNone(result.pronunciation_score)
            self.assertEqual(result.cefr_estimate, "A1")
            self.assertEqual(result.wer, 0.0)
            self.assertEqual(result.model_version, "faster-whisper-small-reference-v2")


if __name__ == "__main__":
    unittest.main()
