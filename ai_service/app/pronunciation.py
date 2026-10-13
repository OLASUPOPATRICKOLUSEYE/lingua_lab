"""Phoneme-level pronunciation scoring: MFA forced alignment + Wav2Vec2 GOP.

Pipeline (PRD addendum §6.1, spike result in docs/spike-whisperx.md):
  1. Montreal Forced Aligner (pretrained EN/FR acoustic models + dictionaries)
     aligns the processed WAV against the teacher reference text, producing a
     phone tier (label + interval per phoneme).
  2. A phoneme-CTC Wav2Vec2 model emits frame-level posteriors over an IPA
     vocabulary; each aligned phone's confidence is the mean posterior of its
     (normalized) label across the frames it spans — a GOP-style raw 0.0–1.0
     value. Raw confidences only; bands are presentation-layer.

Both stages are OPTIONAL dependencies, matching the service's tier philosophy:
if `mfa` or torch/transformers are missing, the service still grades — it just
returns `phoneme_scores = null` (Manual/CPU-lite behavior, never an error).
"""

from __future__ import annotations

import math
import re
import shutil
import subprocess
import tempfile
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Sequence

DEFAULT_PHONEME_MODEL = "facebook/wav2vec2-lv-60-espeak-cv-ft"
PHONEME_SAMPLE_RATE = 16_000
MFA_ALIGN_TIMEOUT_SECONDS = 600

# MFA pretrained (dictionary, acoustic model) names per target language
# (addendum §6.6 — sourced via `mfa model download`). EN/FR only in MVP.
MFA_MODELS: dict[str, tuple[str, str]] = {
    "english": ("english_mfa", "english_mfa"),
    "french": ("french_mfa", "french_mfa"),
}

# MFA emits these interval labels for non-speech; they carry no phoneme.
SILENCE_LABELS = {"", "sil", "sp", "spn", "<eps>", "noi", "sil."}

# Suprasegmentals that never distinguish phonemes for our purposes: primary/
# secondary stress, length marks, tie bars. Deliberately NOT stripping
# combining marks in the first pass — French nasal vowels (ɛ̃ vs ɛ) are
# distinct phonemes and must stay distinct.
_SUPRASEGMENTAL_RE = re.compile(r"[ˈˌːˑ˘͜͡]")


class PronunciationUnavailableError(RuntimeError):
    """The optional MFA / phoneme-model stack is not usable on this host."""


@dataclass(frozen=True)
class PhonemeInterval:
    label: str
    start_ms: int
    end_ms: int


def normalize_phone_label(label: str, fold_diacritics: bool = False) -> str:
    """Normalize an IPA-ish phone label for vocab lookup.

    First-pass lookups keep combining marks (nasality etc.); `fold_diacritics`
    is the second-chance lookup that also drops combining marks (Mn).
    """
    value = unicodedata.normalize("NFD", label.strip().lower())
    value = _SUPRASEGMENTAL_RE.sub("", value)
    if fold_diacritics:
        value = "".join(
            ch for ch in value if unicodedata.category(ch) != "Mn"
        )
    return unicodedata.normalize("NFC", value)


_TIER_NAME_RE = re.compile(r'name\s*=\s*"(?P<name>[^"]*)"')
_XMIN_RE = re.compile(r"xmin\s*=\s*(?P<value>[0-9.+eE-]+)")
_XMAX_RE = re.compile(r"xmax\s*=\s*(?P<value>[0-9.+eE-]+)")
_TEXT_RE = re.compile(r'text\s*=\s*"(?P<value>[^"]*)"')
_ITEM_RE = re.compile(r"item\s*\[\d+\]\s*:")


def parse_textgrid_phones(
    textgrid_text: str, tier_name: str = "phones"
) -> list[PhonemeInterval]:
    """Parse the phone tier out of an MFA long-format TextGrid.

    Minimal by design: MFA's output is machine-generated and regular, so a
    dependency on a TextGrid library isn't warranted for two fields.
    """
    intervals: list[PhonemeInterval] = []
    in_target_tier = False
    xmin: float | None = None
    xmax: float | None = None

    for raw_line in textgrid_text.splitlines():
        line = raw_line.strip()

        if _ITEM_RE.match(line):
            in_target_tier = False
            continue

        name_match = _TIER_NAME_RE.search(line)
        if name_match:
            in_target_tier = name_match.group("name") == tier_name
            continue

        if not in_target_tier:
            continue

        xmin_match = _XMIN_RE.search(line)
        if xmin_match:
            xmin = float(xmin_match.group("value"))
            continue
        xmax_match = _XMAX_RE.search(line)
        if xmax_match:
            xmax = float(xmax_match.group("value"))
            continue

        text_match = _TEXT_RE.search(line)
        if text_match and xmin is not None and xmax is not None:
            label = text_match.group("value").strip()
            if label.lower() not in SILENCE_LABELS:
                intervals.append(
                    PhonemeInterval(
                        label=label,
                        start_ms=int(round(xmin * 1000)),
                        end_ms=int(round(xmax * 1000)),
                    )
                )
            xmin = None
            xmax = None

    return intervals


def _lookup_token_id(vocab_by_label: dict[str, int], label: str) -> int | None:
    exact = normalize_phone_label(label)
    if exact in vocab_by_label:
        return vocab_by_label[exact]
    folded = normalize_phone_label(label, fold_diacritics=True)
    return vocab_by_label.get(folded)


def build_normalized_vocab(vocab: dict[str, int]) -> dict[str, int]:
    """Index the model vocab by normalized label (exact first, folded second).

    Exact (diacritic-preserving) keys win over folded ones so ɛ̃ never
    silently resolves to ɛ when the model distinguishes them.
    """
    folded: dict[str, int] = {}
    exact: dict[str, int] = {}
    for token, token_id in vocab.items():
        folded.setdefault(
            normalize_phone_label(token, fold_diacritics=True), token_id
        )
        exact.setdefault(normalize_phone_label(token), token_id)
    return {**folded, **exact}


def score_intervals(
    intervals: Sequence[PhonemeInterval],
    frame_probs: Sequence[Sequence[float]],
    frame_hop_ms: float,
    vocab_by_label: dict[str, int],
) -> list[dict[str, Any]]:
    """GOP-style scoring: mean posterior of each phone's token over its frames.

    Pure math on plain sequences so it is unit-testable without torch. Phones
    whose label cannot be resolved to a model token (even via per-character
    composition) are skipped rather than given a fabricated confidence.
    """
    total_frames = len(frame_probs)
    if total_frames == 0 or frame_hop_ms <= 0:
        return []

    scores: list[dict[str, Any]] = []
    for interval in intervals:
        first = max(0, min(total_frames - 1, int(interval.start_ms // frame_hop_ms)))
        last = max(first + 1, min(total_frames, math.ceil(interval.end_ms / frame_hop_ms)))
        frames = frame_probs[first:last]
        if not len(frames):
            continue

        token_id = _lookup_token_id(vocab_by_label, interval.label)
        if token_id is not None:
            confidence = sum(frame[token_id] for frame in frames) / len(frames)
        else:
            # Composition fallback for multi-character labels the vocab only
            # has piecewise (e.g. affricates split into stop + fricative).
            char_ids = [
                _lookup_token_id(vocab_by_label, ch) for ch in interval.label
            ]
            resolved = [cid for cid in char_ids if cid is not None]
            if len(resolved) != len(interval.label) or not resolved:
                continue
            confidence = sum(
                max(frame[cid] for cid in resolved) for frame in frames
            ) / len(frames)

        scores.append(
            {
                "phoneme": normalize_phone_label(interval.label),
                "expected": interval.label,
                "confidence": max(0.0, min(1.0, float(confidence))),
                "timestamp_ms": interval.start_ms,
            }
        )

    return scores


def resolve_mfa_models(target_language: str | None) -> tuple[str, str] | None:
    if not target_language:
        return None
    return MFA_MODELS.get(target_language.strip().lower())


def build_align_command(
    mfa_bin: str,
    audio_path: Path,
    text_path: Path,
    dictionary: str,
    acoustic_model: str,
    output_dir: Path,
) -> list[str]:
    """`mfa align_one` invocation (MFA 3.x single-file alignment)."""
    return [
        mfa_bin,
        "align_one",
        str(audio_path),
        str(text_path),
        dictionary,
        acoustic_model,
        str(output_dir),
        "--clean",
        "--quiet",
    ]


class PronunciationScorer:
    """Lazy, optional MFA + Wav2Vec2 phoneme scorer (mirrors the whisper/VAD
    availability pattern in service.py)."""

    def __init__(
        self,
        mfa_bin: str | None,
        phoneme_model_id: str = DEFAULT_PHONEME_MODEL,
        enabled: bool = True,
    ) -> None:
        self.enabled = enabled
        self.mfa_bin = mfa_bin or shutil.which("mfa")
        self.phoneme_model_id = phoneme_model_id
        self.last_error: str | None = None
        self._model: Any | None = None
        self._feature_extractor: Any | None = None
        self._vocab_by_label: dict[str, int] | None = None

    def can_score(self, target_language: str | None) -> bool:
        return (
            self.enabled
            and self.mfa_bin is not None
            and resolve_mfa_models(target_language) is not None
        )

    def health(self) -> dict[str, Any]:
        return {
            "enabled": self.enabled,
            "mfa_found": self.mfa_bin is not None,
            "phoneme_model": self.phoneme_model_id,
            "phoneme_model_loaded": self._model is not None,
            "languages": sorted(MFA_MODELS.keys()),
            "last_error": self.last_error,
        }

    # -- alignment ---------------------------------------------------------

    def _align(
        self, audio_path: Path, reference_text: str, target_language: str
    ) -> list[PhonemeInterval]:
        models = resolve_mfa_models(target_language)
        if models is None or self.mfa_bin is None:
            raise PronunciationUnavailableError(
                f"MFA alignment unavailable for language: {target_language!r}"
            )
        dictionary, acoustic_model = models

        with tempfile.TemporaryDirectory(prefix="lingua-mfa-") as tmp:
            tmp_path = Path(tmp)
            text_path = tmp_path / f"{audio_path.stem}.txt"
            text_path.write_text(reference_text.strip() + "\n", encoding="utf-8")
            output_dir = tmp_path / "aligned"
            output_dir.mkdir()

            command = build_align_command(
                self.mfa_bin, audio_path, text_path, dictionary, acoustic_model, output_dir
            )
            result = subprocess.run(
                command,
                capture_output=True,
                text=True,
                timeout=MFA_ALIGN_TIMEOUT_SECONDS,
            )
            if result.returncode != 0:
                raise PronunciationUnavailableError(
                    f"mfa align_one failed ({result.returncode}): {result.stderr.strip()[:500]}"
                )

            textgrids = sorted(output_dir.rglob("*.TextGrid"))
            if not textgrids:
                raise PronunciationUnavailableError(
                    "mfa align_one produced no TextGrid output."
                )
            return parse_textgrid_phones(
                textgrids[0].read_text(encoding="utf-8")
            )

    # -- posteriors --------------------------------------------------------

    def _ensure_phoneme_model(self) -> None:
        if self._model is not None:
            return
        try:
            from transformers import (  # type: ignore
                AutoTokenizer,
                Wav2Vec2FeatureExtractor,
                Wav2Vec2ForCTC,
            )

            self._feature_extractor = Wav2Vec2FeatureExtractor.from_pretrained(
                self.phoneme_model_id
            )
            tokenizer = AutoTokenizer.from_pretrained(self.phoneme_model_id)
            self._vocab_by_label = build_normalized_vocab(tokenizer.get_vocab())
            self._model = Wav2Vec2ForCTC.from_pretrained(self.phoneme_model_id)
            self._model.eval()
        except Exception as exc:  # pragma: no cover - environment dependent
            raise PronunciationUnavailableError(
                f"Phoneme model {self.phoneme_model_id} is unavailable: {exc}"
            ) from exc

    def _frame_posteriors(self, audio_path: Path) -> tuple[Any, float]:
        import numpy as np
        import soundfile as sf  # type: ignore
        import torch  # type: ignore

        audio, sample_rate = sf.read(str(audio_path), dtype="float32")
        if getattr(audio, "ndim", 1) > 1:
            audio = audio.mean(axis=1)
        if sample_rate != PHONEME_SAMPLE_RATE:
            target_len = int(round(len(audio) * PHONEME_SAMPLE_RATE / sample_rate))
            audio = np.interp(
                np.linspace(0.0, len(audio) - 1.0, max(target_len, 1)),
                np.arange(len(audio)),
                audio,
            ).astype("float32")

        inputs = self._feature_extractor(
            audio, sampling_rate=PHONEME_SAMPLE_RATE, return_tensors="pt"
        )
        with torch.no_grad():
            logits = self._model(inputs.input_values).logits[0]
            probs = torch.softmax(logits, dim=-1).cpu().numpy()

        duration_ms = len(audio) / PHONEME_SAMPLE_RATE * 1000.0
        frame_hop_ms = duration_ms / max(1, probs.shape[0])
        return probs, frame_hop_ms

    # -- entry point -------------------------------------------------------

    def score(
        self, audio_path: Path, reference_text: str, target_language: str
    ) -> list[dict[str, Any]]:
        intervals = self._align(audio_path, reference_text, target_language)
        if not intervals:
            return []
        self._ensure_phoneme_model()
        probs, frame_hop_ms = self._frame_posteriors(audio_path)
        assert self._vocab_by_label is not None
        return score_intervals(intervals, probs, frame_hop_ms, self._vocab_by_label)
