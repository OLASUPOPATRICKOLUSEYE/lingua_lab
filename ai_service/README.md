# LinguaLab AI Service

Week 9 scaffold for the FastAPI + Uvicorn grading microservice.

## Endpoints

- `GET /health`
- `POST /grade`

`/grade` accepts the existing Node worker contract:

```json
{
  "submission_id": "uuid",
  "school_id": "uuid",
  "student_id": "uuid",
  "activity_id": "uuid",
  "processed_path": "processed/.../submission.wav"
}
```

## Environment

- `AI_STORAGE_ROOT` — root directory for relative `processed_path` values.
  Defaults to `/app/uploads` in Docker, `./uploads` locally.
- `AI_TRANSCRIBE_MODEL` — Faster-Whisper model name. Default: `medium`
- `AI_TRANSCRIBE_DEVICE` — `auto`, `cpu`, or `cuda`. Default: `auto`
- `AI_TRANSCRIBE_COMPUTE_TYPE` — Faster-Whisper compute type. Default: `auto`
- `AI_REQUIRE_VAD` — `true`/`false`. Default: `false`

## Local run

Create a Python environment, then:

```bash
pip install -r ai_service/requirements.txt
uvicorn ai_service.app.main:app --host 0.0.0.0 --port 8000
```

If the heavy model dependencies are not installed correctly, `/health` will
report `degraded` and `/grade` will return `503` with a clear message.

## Smoke test from the Node app

Once the service is running and you have a real normalized file:

```bash
AI_SERVICE_URL="http://127.0.0.1:8000" pnpm ai:smoke uploads/processed/<school>/<course>/<student>/<submission>.wav
```

The smoke command calls `/health`, then submits that file to `/grade` using the
same contract as the grading worker.

## Current grading output

The Week 9 service currently returns:

- transcript
- word timestamps
- words-per-minute
- heuristic `fluency_score`
- heuristic `pronunciation_score`
- heuristic `cefr_estimate`

It still does **not** compute a real `wer` or phoneme-level pronunciation map,
because the current request contract does not include a reference transcript and
the full Wav2Vec2/MFA stack is not wired yet.

## Pronunciation layer (Weeks 11–12): MFA + Wav2Vec2 phoneme scoring

`app/pronunciation.py` implements the PRD-specified pipeline behind the same
`POST /grade` call: MFA phone alignment against the teacher reference text,
then GOP-style per-phoneme confidences from a phoneme-CTC Wav2Vec2 model
(default `facebook/wav2vec2-lv-60-espeak-cv-ft`, override with
`AI_PHONEME_MODEL`). WhisperX was evaluated and rejected for this layer —
see `docs/spike-whisperx.md`.

The stack is OPTIONAL, like faster-whisper and silero-vad:

- No `mfa` binary or no torch/transformers → grading still works and
  `phoneme_scores` is `null`. Check `GET /health` → `pronunciation` for
  availability and the last error.
- Install on CPU/GPU-tier hosts: `pip install -r requirements-pronunciation.txt`
  plus Montreal Forced Aligner via conda (instructions inside that file).
  Set `AI_MFA_BIN` if `mfa` is not on PATH; set `AI_PRONUNCIATION=false` to
  force the layer off.
- When the layer produces scores, `pronunciation_score` is the mean raw
  confidence × 100 (replacing the timing heuristic), `phoneme_scores[]`
  carries raw 0.0–1.0 values (bands stay presentation-layer, addendum §6.1),
  and `model_version` gains a `+mfa-w2v2ph-v1` suffix so re-grades are
  distinguishable.

**Not yet verified end-to-end**: the exact `mfa align_one` invocation and the
full model path were written against MFA 3.x / transformers docs but this
machine does not have the model stack installed — smoke-test with
`pnpm ai:smoke <processed-wav>` on a tier host (and adjust
`build_align_command` if the CLI shape differs) before relying on scores.
