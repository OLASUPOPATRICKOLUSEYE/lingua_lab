from __future__ import annotations

import os
import shutil
import tempfile
from dataclasses import dataclass
from pathlib import Path
import math
import re
import subprocess
from typing import Any


from .config import Settings
from .pronunciation import PronunciationScorer
from .schemas import GradingRequest, GradingResponse, WordTimestamp


class ServiceUnavailableError(RuntimeError):
    pass


class SpeechNotDetectedError(RuntimeError):
    pass


def _read_audio_duration_seconds(audio_path: Path) -> float:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(audio_path),
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    return max(0.0, float(result.stdout.strip() or 0.0))


@dataclass
class WhisperArtifacts:
    transcript: str
    word_timestamps: list[WordTimestamp]


WORD_RE = re.compile(r"[A-Za-zÀ-ÿ']+")


def _tokenize_words(transcript: str) -> list[str]:
    return [token.lower() for token in WORD_RE.findall(transcript)]


def _compute_word_error_rate(expected_transcript: str, actual_transcript: str) -> float | None:
    expected = _tokenize_words(expected_transcript)
    actual = _tokenize_words(actual_transcript)

    if not expected:
        return None

    rows = len(expected) + 1
    cols = len(actual) + 1
    matrix = [[0] * cols for _ in range(rows)]

    for i in range(rows):
        matrix[i][0] = i
    for j in range(cols):
        matrix[0][j] = j

    for i in range(1, rows):
        for j in range(1, cols):
            substitution_cost = 0 if expected[i - 1] == actual[j - 1] else 1
            matrix[i][j] = min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + substitution_cost,
            )

    return matrix[-1][-1] / len(expected)


def _clamp_score(value: float) -> int:
    return max(0, min(100, int(round(value))))


def _estimate_fluency_score(word_count: int, duration_seconds: float) -> int | None:
    if duration_seconds <= 0 or word_count <= 0:
        return None

    wpm = (word_count / duration_seconds) * 60
    cadence_penalty = abs(wpm - 120) * 0.6
    return _clamp_score(100 - cadence_penalty)


def _estimate_pronunciation_score(
    word_timestamps: list[WordTimestamp],
    duration_seconds: float,
    wer: float | None = None,
) -> int | None:
    if duration_seconds <= 0 or not word_timestamps:
        return None

    spoken_ms = sum(
        max(0, timestamp.end_ms - timestamp.start_ms)
        for timestamp in word_timestamps
    )
    coverage_ratio = min(1.0, spoken_ms / (duration_seconds * 1000))

    word_durations = [
        max(1, timestamp.end_ms - timestamp.start_ms)
        for timestamp in word_timestamps
    ]
    average_duration = sum(word_durations) / len(word_durations)
    variance = sum((duration - average_duration) ** 2 for duration in word_durations) / len(word_durations)
    duration_stability = 1.0 / (1.0 + math.sqrt(variance) / max(average_duration, 1.0))

    pause_gaps = [
        max(0, current.start_ms - previous.end_ms)
        for previous, current in zip(word_timestamps, word_timestamps[1:])
    ]
    average_gap = sum(pause_gaps) / len(pause_gaps) if pause_gaps else 0.0
    pause_score = max(0.0, 1.0 - min(average_gap, 1200.0) / 1200.0)
    transcript_accuracy = 1.0 if wer is None else max(0.0, 1.0 - min(wer, 1.0))

    score = (
        15
        + (coverage_ratio * 25)
        + (duration_stability * 20)
        + (pause_score * 10)
        + (transcript_accuracy * 30)
    )
    return _clamp_score(score)


def _pronunciation_score_from_phonemes(
    phoneme_scores: list[dict[str, Any]] | None,
) -> int | None:
    """0–100 pronunciation score from raw phoneme confidences (mean × 100).

    Only used when the real MFA+Wav2Vec2 layer produced scores; otherwise the
    timing heuristic below remains the fallback.
    """
    if not phoneme_scores:
        return None
    confidences = [
        float(entry["confidence"])
        for entry in phoneme_scores
        if isinstance(entry.get("confidence"), (int, float))
    ]
    if not confidences:
        return None
    return _clamp_score(sum(confidences) / len(confidences) * 100)


def _estimate_cefr(word_count: int, duration_seconds: float) -> str | None:
    if duration_seconds <= 0 or word_count <= 0:
        return None

    words_per_minute = (word_count / duration_seconds) * 60

    if word_count < 8 or words_per_minute < 55:
        return "A1"
    if word_count < 20 or words_per_minute < 80:
        return "A2"
    if word_count < 40 or words_per_minute < 110:
        return "B1"
    if word_count < 70 or words_per_minute < 145:
        return "B2"
    if word_count < 110 or words_per_minute < 175:
        return "C1"
    return "C2"


class AiGradingService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        # No S3 client in local-filesystem mode — there is nothing to connect to,
        # and constructing one would fail on the missing credentials.
        self._s3 = None if settings.use_local_storage else self._make_s3_client()
        self._whisper_model: Any | None = None
        self._vad_loaded = False
        self._vad_error: str | None = None
        self._whisper_error: str | None = None
        self._pronunciation = PronunciationScorer(
            mfa_bin=settings.mfa_bin,
            phoneme_model_id=settings.phoneme_model,
            enabled=settings.pronunciation_enabled,
        )
        self._load_vad_probe()

    def _make_s3_client(self) -> Any:
        # Imported here, not at module scope: local-filesystem mode needs no
        # object-store client, and requiring boto3 to be installed just to start
        # the service would make the local path impossible.
        import boto3
        from botocore.config import Config as BotocoreConfig

        addressing_style = "path" if self.settings.s3_force_path_style else "auto"
        return boto3.client(
            "s3",
            endpoint_url=self.settings.s3_endpoint,
            region_name=self.settings.s3_region,
            aws_access_key_id=self.settings.s3_access_key_id,
            aws_secret_access_key=self.settings.s3_secret_access_key,
            config=BotocoreConfig(s3={"addressing_style": addressing_style}),
        )

    def _load_vad_probe(self) -> None:
        try:
            from silero_vad import get_speech_timestamps, load_silero_vad  # type: ignore

            self._vad_loaded = True
            self._vad_model_loader = load_silero_vad
            self._vad_timestamp_fn = get_speech_timestamps
            self._vad_model: Any | None = None
        except Exception as exc:  # pragma: no cover - environment dependent
            self._vad_loaded = False
            self._vad_error = str(exc)
            self._vad_model_loader = None
            self._vad_timestamp_fn = None
            self._vad_model = None

    def _ensure_whisper_model(self) -> Any:
        if self._whisper_model is not None:
            return self._whisper_model

        try:
            from faster_whisper import WhisperModel  # type: ignore

            compute_type = self.settings.transcribe_compute_type
            if compute_type == "auto":
                compute_type = "float16" if self.settings.transcribe_device == "cuda" else "int8"

            device = self.settings.transcribe_device
            if device == "auto":
                device = "cuda"

            self._whisper_model = WhisperModel(
                self.settings.transcribe_model,
                device=device,
                compute_type=compute_type,
            )
            return self._whisper_model
        except Exception as exc:  # pragma: no cover - environment dependent
            self._whisper_error = str(exc)
            raise ServiceUnavailableError(
                "Faster-Whisper is unavailable. Install the Week 9 AI service dependencies "
                "and confirm the model can load on this machine."
            ) from exc

    def _ensure_vad_model(self) -> Any | None:
        if not self._vad_loaded:
            if self.settings.require_vad:
                raise ServiceUnavailableError(
                    "silero-vad is unavailable but AI_REQUIRE_VAD=true. Install the VAD dependencies "
                    "or disable the strict VAD requirement."
                )
            return None

        if self._vad_model is None:
            self._vad_model = self._vad_model_loader()
        return self._vad_model

    def _run_vad_gate(self, audio_path: Path) -> None:
        vad_model = self._ensure_vad_model()
        if vad_model is None:
            return

        import soundfile as sf  # type: ignore

        audio, sample_rate = sf.read(str(audio_path))
        speech_segments = self._vad_timestamp_fn(audio, vad_model, sampling_rate=sample_rate)
        if not speech_segments:
            raise SpeechNotDetectedError("No speech detected in processed audio.")

    def _transcribe(self, audio_path: Path) -> WhisperArtifacts:
        whisper_model = self._ensure_whisper_model()
        segments, _info = whisper_model.transcribe(str(audio_path), word_timestamps=True)
        transcript_parts: list[str] = []
        words: list[WordTimestamp] = []

        for segment in segments:
            text = (segment.text or "").strip()
            if text:
                transcript_parts.append(text)

            for word in getattr(segment, "words", []) or []:
                token = (getattr(word, "word", "") or "").strip()
                if not token:
                    continue
                start = int(round(max(0.0, float(getattr(word, "start", 0.0))) * 1000))
                end = int(round(max(float(getattr(word, "end", 0.0)), float(getattr(word, "start", 0.0))) * 1000))
                words.append(WordTimestamp(word=token, start_ms=start, end_ms=end))

        transcript = " ".join(transcript_parts).strip()
        return WhisperArtifacts(transcript=transcript, word_timestamps=words)

    def health(self) -> dict[str, Any]:
        ready = self._whisper_model is not None or self._whisper_error is None
        status = "ok" if not self._whisper_error and (self._vad_loaded or not self.settings.require_vad) else "degraded"
        return {
            "status": status,
            "s3_endpoint": self.settings.s3_endpoint,
            "s3_bucket": self.settings.s3_bucket,
            "transcribe_model": self.settings.transcribe_model,
            "transcribe_device": self.settings.transcribe_device,
            "vad_loaded": self._vad_loaded,
            "require_vad": self.settings.require_vad,
            "whisper_error": self._whisper_error,
            "vad_error": self._vad_error,
            "pronunciation": self._pronunciation.health(),
            "ready": ready,
        }

    def _fetch_processed_audio(self, processed_path: str, destination: Path) -> None:
        """Copy the processed WAV to a local temp path for the models to read.

        Two sources: an S3 object in any real deployment, or the local
        filesystem when S3 is unconfigured (dev). Both end at the same place, so
        everything downstream — ffprobe, Whisper, VAD, MFA — is unchanged.
        """
        if not self.settings.use_local_storage:
            self._s3.download_file(
                self.settings.s3_bucket,
                processed_path,
                str(destination),
            )
            return

        root = Path(self.settings.local_storage_root).resolve()
        source = (root / processed_path).resolve()
        # Defence in depth: processed_path is generated by buildStoragePath()
        # and holds only UUIDs, but a traversal here would read arbitrary files.
        if root != source and root not in source.parents:
            raise FileNotFoundError(
                f"Refusing to read outside the storage root: {processed_path}"
            )
        if not source.is_file():
            raise FileNotFoundError(f"Processed audio not found: {processed_path}")
        shutil.copyfile(source, destination)

    def grade(self, payload: GradingRequest) -> GradingResponse:
        # Download the processed WAV from S3 to a local temp file so that
        # ffprobe, Whisper, silero-vad, and MFA can all read it via the local
        # filesystem. The temp file is deleted in the finally block regardless
        # of outcome; mkstemp creates a unique path so concurrent jobs never
        # share a file even under high concurrency.
        suffix = Path(payload.processed_path).suffix or ".wav"
        fd, tmp_str = tempfile.mkstemp(prefix="lingua-grade-", suffix=suffix)
        os.close(fd)
        audio_path = Path(tmp_str)
        try:
            self._fetch_processed_audio(payload.processed_path, audio_path)

            self._run_vad_gate(audio_path)
            whisper_output = self._transcribe(audio_path)
            duration_seconds = _read_audio_duration_seconds(audio_path)

            word_count = len(_tokenize_words(whisper_output.transcript))
            wpm = int(round((word_count / duration_seconds) * 60)) if duration_seconds > 0 and word_count > 0 else None
            wer = (
                _compute_word_error_rate(payload.expected_transcript, whisper_output.transcript)
                if payload.expected_transcript
                else None
            )
            fluency_score = _estimate_fluency_score(word_count, duration_seconds)
            cefr_estimate = _estimate_cefr(word_count, duration_seconds)

            # Real phoneme layer (MFA + Wav2Vec2) when the optional stack and a
            # reference passage are present. A failure here NEVER fails the grade
            # — the submission still gets transcript/fluency, phoneme_scores stays
            # null, and the error is surfaced via /health (tier philosophy).
            phoneme_scores: list[dict[str, Any]] | None = None
            if payload.expected_transcript and self._pronunciation.can_score(
                payload.target_language
            ):
                try:
                    phoneme_scores = (
                        self._pronunciation.score(
                            audio_path,
                            payload.expected_transcript,
                            payload.target_language or "",
                        )
                        or None
                    )
                    self._pronunciation.last_error = None
                except Exception as exc:  # pragma: no cover - environment dependent
                    self._pronunciation.last_error = str(exc)

            pronunciation_score = _pronunciation_score_from_phonemes(phoneme_scores)
            if pronunciation_score is None:
                pronunciation_score = _estimate_pronunciation_score(
                    whisper_output.word_timestamps,
                    duration_seconds,
                    wer,
                )

            model_version = f"faster-whisper-{self.settings.transcribe_model}-reference-v2"
            if phoneme_scores:
                model_version += "+mfa-w2v2ph-v1"

            return GradingResponse(
                transcript=whisper_output.transcript or None,
                word_timestamps=whisper_output.word_timestamps or None,
                phoneme_scores=phoneme_scores,
                wpm=wpm,
                wer=wer,
                fluency_score=fluency_score,
                pronunciation_score=pronunciation_score,
                cefr_estimate=cefr_estimate,
                model_version=model_version,
            )
        finally:
            audio_path.unlink(missing_ok=True)
