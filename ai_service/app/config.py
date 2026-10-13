from __future__ import annotations

from dataclasses import dataclass
import os


def _as_bool(value: str | None, default: bool) -> bool:
    if value is None:
      return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _require_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} is required but not set.")
    return value


def _optional_env(name: str) -> str | None:
    return os.getenv(name, "").strip() or None


@dataclass(frozen=True)
class Settings:
    # Optional: with S3_ENDPOINT unset the service reads processed audio from
    # the local filesystem instead. This mirrors the Node side
    # (utils/storage/s3.ts) — without it, local dev cannot run AI grading at
    # all, because the worker would write audio to disk and this service would
    # look for it in an object store that does not exist.
    s3_endpoint: str | None
    s3_region: str | None
    s3_bucket: str | None
    s3_access_key_id: str | None
    s3_secret_access_key: str | None
    s3_force_path_style: bool
    transcribe_model: str
    transcribe_device: str
    transcribe_compute_type: str
    require_vad: bool
    # Pronunciation layer (MFA + Wav2Vec2 phoneme CTC) — optional stack.
    pronunciation_enabled: bool = True
    mfa_bin: str | None = None
    phoneme_model: str = "facebook/wav2vec2-lv-60-espeak-cv-ft"
    # Root for local-filesystem mode; must match the Node LOCAL_STORAGE_ROOT.
    local_storage_root: str = "uploads"

    @property
    def use_local_storage(self) -> bool:
        return not self.s3_endpoint


def get_settings() -> Settings:
    return Settings(
        s3_endpoint=_optional_env("S3_ENDPOINT"),
        s3_region=_optional_env("S3_REGION"),
        s3_bucket=_optional_env("S3_BUCKET"),
        s3_access_key_id=_optional_env("S3_ACCESS_KEY_ID"),
        s3_secret_access_key=_optional_env("S3_SECRET_ACCESS_KEY"),
        s3_force_path_style=_as_bool(os.getenv("S3_FORCE_PATH_STYLE"), True),
        transcribe_model=os.getenv("AI_TRANSCRIBE_MODEL", "medium").strip() or "medium",
        transcribe_device=os.getenv("AI_TRANSCRIBE_DEVICE", "auto").strip() or "auto",
        transcribe_compute_type=os.getenv("AI_TRANSCRIBE_COMPUTE_TYPE", "auto").strip() or "auto",
        require_vad=_as_bool(os.getenv("AI_REQUIRE_VAD"), False),
        pronunciation_enabled=_as_bool(os.getenv("AI_PRONUNCIATION"), True),
        mfa_bin=os.getenv("AI_MFA_BIN", "").strip() or None,
        phoneme_model=os.getenv(
            "AI_PHONEME_MODEL", "facebook/wav2vec2-lv-60-espeak-cv-ft"
        ).strip()
        or "facebook/wav2vec2-lv-60-espeak-cv-ft",
        local_storage_root=os.getenv("LOCAL_STORAGE_ROOT", "").strip() or "uploads",
    )
