# API Reference

Two API surfaces exist in this codebase. Both are internal — neither is a
public API today.

1. **The Next.js REST API** (`app/api/**`) — the app's own backend, called
   by the frontend. Route handlers, not tRPC (decision 2026-07-05, see
   AGENTS.md). Every route is Zod-validated, session-guarded via
   `requireRole`/`verifySession`, and RLS-scoped through `withClaims` —
   no internal storage path ever appears in a response.
2. **The AI grading service** (`ai_service/`, FastAPI) — called only by the
   grading BullMQ worker over internal HTTP. Never exposed on a
   public-facing port (AGENTS.md).

This doc is generated from reading the actual route handlers and FastAPI
schemas directly — if it drifts from the code, the code wins; regenerate
rather than hand-patch.

## Cross-cutting behavior

- **Auth failure is inconsistent across routes, by omission, not design.**
  `requireRole()`/`verifySession()` call Next's `redirect("/login")` when
  there's no session — in a Server Component that's correct, but in a route
  handler it produces a `307` redirect response, not a JSON `401`. Only
  `POST /api/submissions/upload` catches this (`isRedirectError`) and
  returns a real `401 { error: "Unauthorized." }`. Every other route below
  will 307-redirect an unauthenticated caller instead of returning JSON.
  Worth knowing if you're writing a non-browser client against these routes;
  not fixed here since it's out of scope for a docs pass.
- **Ownership scoping**: `teacher` role is almost always scoped to rows it
  owns (`activities.teacherId = session.id`, or via a joined `classes.teacherId`);
  `dept_head`/`system_admin` see anything in-school; `student` is scoped to
  its own submissions/assignments. RLS enforces the tenant boundary
  underneath all of this regardless of the application-level scoping.
- **Storage paths never leak.** Every response that involves media returns a
  `/api/.../media` or `/api/.../reference-media` URL for the client to fetch
  separately — never the raw `rawStoragePath`/`processedPath` string.
- **Append-only submissions**: grading override and re-grade both insert a
  new `grading_results` row (bumped `model_version`) rather than updating —
  `submissions` itself is never mutated after creation.

---

## Activities

### `POST /api/activities`
Create a new activity (mission).
**Auth**: `teacher`, `dept_head`, `system_admin`
**Body**:
```ts
{ passageTitle: string(min 3), targetLanguage: "English" | "French",
  passageText: string(min 20), coachNote?: string(3-500) }
```
**201** `{ ok: true, activity: { id, title } }`
**400** invalid payload

### `GET /api/activities/[id]`
**Auth**: `teacher` (own only), `dept_head`/`system_admin` (any)
**200** `{ ok: true, activity: { id, title, targetLanguage, passageText, coachNote, teacherReferenceText, referenceAudioUrl } }`
**404** not found / not owned

### `PATCH /api/activities/[id]`
Full replace of the passage fields.
**Auth**: same as GET
**Body**: same shape as `POST /api/activities`
**200** `{ ok: true, activity: { id, title } }`
**400 / 404**

### `GET /api/activities/[id]/assignments`
List which classes an activity is assigned to.
**Auth**: `teacher` (own activity only), `dept_head`/`system_admin` (any)
**200** `{ ok: true, assignments: [{ id, classId, className, classSlug, status, dueAt, assignedAt }] }`
**404** activity not found

### `POST /api/activities/[id]/assignments`
Assign an activity to a class. Upserts — assigning to a class that already
has an (archived) assignment for this activity re-activates it rather than
creating a duplicate.
**Auth**: same as above
**Body**: `{ classId: uuid, dueAt?: ISO datetime | null }`
**200** `{ ok: true, assignment: { id, activityId, activityTitle, classId, className, classSlug, status: "assigned", dueAt } }`
**404** activity or class not found · **400** activity/class are in different schools

### `PATCH /api/activities/[id]/assignments/[assignmentId]`
Update status (`assigned`/`archived`) and/or due date.
**Auth**: same as above (teacher scoped via the assignment's `classes.teacherId`)
**Body**: `{ status?: "assigned" | "archived", dueAt?: ISO datetime | null }`
**200** `{ ok: true, assignment: { id, classId, className, classSlug, status, dueAt } }`
**400 / 404**

### `POST /api/activities/[id]/reference-audio`
Upload/replace the teacher's reference audio for an activity. Single request,
not chunked (audio is small — ≤5min).
**Auth**: `teacher` (own activity), `dept_head`/`system_admin` (any)
**Body**: `multipart/form-data`, field `file` — audio, max 20MB, one of
webm/mp4/m4a/mpeg/wav/aac/ogg
**201** `{ ok: true, referenceAudioUrl }`
**400** bad/unsupported file · **413** too large · **404** activity not found · **500** storage write failed

### `POST /api/activities/[id]/reference-video`
Upload/replace the teacher's reference video. Chunked.
**Auth**: same as reference-audio
**Body**: `multipart/form-data` — `uploadId` (uuid), `chunkIndex`, `totalChunks`,
`mimeType` (`video/webm` or `video/mp4` only), `chunk` (File, ≤5MB/chunk,
~200MB total cap)
**202** (non-final chunk) `{ ok: true, uploadId, chunkIndex, totalChunks }`
**201** (final chunk) `{ ok: true, referenceVideoUrl }`
**400 / 413 / 404 / 422** (422 = chunk assembly failed, e.g. a missing chunk)

### `GET /api/activities/[id]/reference-media?kind=audio|video`
Stream the reference file's bytes.
**Auth**: any authenticated role. Students only if assigned to the activity
*and* that reference kind is actually attached (checked via the student's
resolved assignment, not just activity ownership); teachers scoped to own
activities for direct fetch.
**200** raw file bytes, `content-type` set from extension, `cache-control: private, max-age=60`
**404** activity/reference not found

---

## Grading

### `POST /api/grading/[submissionId]/override`
Teacher manually sets/overrides a submission's grade. Inserts a new
`grading_results` row (does not touch AI-derived fields — they're left
`null` on this row).
**Auth**: `teacher` (own activity's submissions), `dept_head`/`system_admin` (any)
**Body**: `{ fluencyScore: 0-100 int, pronunciationScore: 0-100 int, cefrEstimate: "A1"|"A2"|"B1"|"B2"|"C1"|"C2", justification: string(min 10) }`
**200** `{ ok: true, modelVersion }`
**400 / 404**

### `POST /api/grading/[submissionId]/regrade`
Enqueues the submission for a fresh AI grading pass.
**Auth**: same as override
**409** if `AI_SERVICE_URL` isn't configured (Manual tier — no AI service to regrade with) or the submission has no `processedPath` yet
**202** `{ ok: true, status: "processing" }`

---

## Submissions

### `POST /api/submissions/upload`
Student uploads a take. Chunked. The only route that returns a real JSON
`401` on an unauthenticated call (see note above).
**Auth**: any authenticated user; validates the student is actually assigned
the activity before accepting the first chunk (and cleans up any staged
chunks if not)
**Body**: `multipart/form-data` — `uploadId` (uuid), `activityId`, `takeId`
(uuid), `chunkIndex`, `totalChunks`, `fileName`, `mimeType`, `durationMs`,
`chunk` (File, ≤5MB/chunk)
**202** (non-final chunk) `{ ok: true, uploadId, chunkIndex, totalChunks }`
**201** (final chunk) `{ ok: true, submissionId, status: "pending", manualReview: boolean }` —
`manualReview` is `true` whenever `AI_SERVICE_URL` is unset (Manual tier);
on final chunk this also freezes which assignment the submission was made
against and enqueues the normalization job
**400 / 413 / 404** (unknown/unassigned activity) **/ 400** (missing chunk)

### `GET /api/submissions/[id]`
**Auth**: `student` (own submissions), `teacher` (own activities' submissions),
`dept_head`/`system_admin` (any)
**200**:
```ts
{ ok: true, submission: {
    id, activityId, status, submittedAt, rawMediaUrl,
    processedMediaUrl: string | null,
    latestGrade: {
      transcript, wer, wpm, fluencyScore, pronunciationScore,
      cefrEstimate, wordTimestamps, phonemeScores,
      overrideJustification, gradedAt
    } | null
} }
```
Note: if the latest grade carries an `overrideJustification` (a manual
override), the AI-derived fields (`transcript`, `wer`, `wpm`,
`wordTimestamps`, `phonemeScores`) are stripped to `null` in the response —
for every caller, not just students. Only the score/CEFR estimate and the
override note come through.
**404** not found / not visible to this caller

### `GET /api/submissions/[id]/media?kind=raw|processed`
Stream a submission's audio/video bytes.
**Auth**: same scoping as `GET /api/submissions/[id]`
`kind=processed` falls back to the raw file if processing hasn't finished yet.
**200** raw bytes, `content-type` inferred from extension
**404**

---

## AI Grading Service (FastAPI, `ai_service/`)

Internal only — called by the grading worker (`server/ai/grading-client.ts`)
over `AI_SERVICE_URL`. Contract mirrored in
`server/ai/grading-contract.ts` (Zod) and `ai_service/app/schemas.py`
(Pydantic) — **change both or neither** (AGENTS.md).

FastAPI auto-generates interactive docs for this service for free: **Swagger
UI at `/docs`, OpenAPI JSON at `/openapi.json`**, whenever it's running
(`docker compose up ai-service`, or `uvicorn app.main:app`) — nothing extra
to set up. What follows is a static reference for reading the contract
without starting the service.

### `GET /health`
```ts
{ status: "ok" | "degraded", storage_root: string, transcribe_model: string,
  transcribe_device: string, vad_loaded: boolean, require_vad: boolean,
  whisper_error: string | null, vad_error: string | null,
  pronunciation: { ... }, ready: boolean }
```

### `POST /grade`
**Request**:
```ts
{ submission_id, school_id, student_id, activity_id: string,  // uuid-shaped
  processed_path: string,
  expected_transcript?: string | null, target_language?: string | null }
```
**200**:
```ts
{ transcript?, phoneme_scores?: { phoneme, expected, confidence, timestamp_ms }[],
  word_timestamps?: { word, start_ms, end_ms }[],
  wpm?: number, wer?: number, fluency_score?: number,
  pronunciation_score?: number, cefr_estimate?: string,
  model_version: string }
```
**404** `processed_path` doesn't resolve to a file on the service's storage
root (same-host bind-mount contract — see `docker-compose.yml`)
**422** no speech detected (VAD gate) — distinct from a plain request-shape
validation error, which FastAPI also returns as 422; check the `detail`
message to tell them apart
**503** models not ready / service unavailable

Pronunciation scoring (`phoneme_scores`) is an optional stack — see
`.claude/rules/ai-pipeline.md`. When the MFA/Wav2Vec2 stack isn't installed
(the default CPU-tier Docker image only installs `requirements.txt`, not
`requirements-pronunciation.txt`), `phoneme_scores` comes back `null` rather
than erroring.
