from __future__ import annotations

from pydantic import BaseModel, Field


class GradingRequest(BaseModel):
    submission_id: str
    school_id: str
    student_id: str
    activity_id: str
    processed_path: str = Field(min_length=1)
    expected_transcript: str | None = None
    target_language: str | None = None


class WordTimestamp(BaseModel):
    word: str
    start_ms: int
    end_ms: int


class GradingResponse(BaseModel):
    transcript: str | None = None
    phoneme_scores: list[dict] | None = None
    word_timestamps: list[WordTimestamp] | None = None
    wpm: int | None = None
    wer: float | None = None
    fluency_score: int | None = None
    pronunciation_score: int | None = None
    cefr_estimate: str | None = None
    model_version: str
