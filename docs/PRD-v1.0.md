# LinguaLab — Product Requirements Document

**School Language Learning Platform**

Version 1.0 — June 2026
Status: Draft — For Internal Review

> **Provenance note:** This markdown was transcribed from `PRD-v1.0.pdf`, an
> image-only (scanned) PDF with no text layer. It is a faithful transcription
> of the document content for tooling that expects `docs/PRD-v1.0.md` (per
> AGENTS.md). The PDF remains the canonical signed artifact. Sections 1–5 and
> 7–12 are summarized; **Section 6 (Data Model)** is transcribed in full as it
> is the schema/RLS source of truth referenced by `.claude/rules/data-model.md`.

---

## 1. Executive Summary

LinguaLab is a purpose-built, self-hosted school language learning platform. It
delivers the LSRW framework — Listening, Speaking, Reading, and Writing —
through an AI-graded speaking and pronunciation pipeline, a real-time teacher
orchestration panel, and a fully self-hosted AI grading stack.

The platform targets secondary-school and university students across five
languages: English, French, Yoruba, Hausa, and Igbo. It is designed to run
entirely on school-owned hardware, with the school retaining full ownership of
their data, content, and infrastructure.

## 2. Problem Statement

Schools in Nigeria and across Africa face three structural problems in language
education:

- **High recurring cost** — per-seat licensing for foreign platforms consumes
  school IT budgets with no ownership benefit.
- **No Nigerian language support** — Yoruba, Hausa, and Igbo are absent from
  all existing commercial language lab platforms.
- **Infrastructure dependency** — cloud-only platforms fail on the
  low-bandwidth school networks common across Nigeria.

> **Key insight:** A self-hosted platform eliminates recurring subscription
> costs after the initial build, operates on school-owned hardware, and gives
> the institution permanent ownership of their language data and content.

## 3. Goals & Non-Goals *(summarized)*

Goals: AI-graded pronunciation/fluency feedback (EN/FR in MVP), live teacher
gradebook, real-time classroom orchestration, full self-hosting with three
deployment tiers (Manual / CPU-assisted / GPU-accelerated).

## 4. User Roles *(summarized)*

Four tiers: `system_admin`, `dept_head`, `teacher`, `student`. See Section 6
`users.role` CHECK constraint for the canonical enum.

## 5. Features *(summarized — see §5.6 below for orchestration detail)*

### 5.6 Teacher Orchestration Panel

The real-time classroom control centre. Teachers see all students on a live
grid and orchestrate the class via WebSocket commands.

**Live orchestration**

- `FR-TD-01` — Classroom grid: live map of all logged-in students with status
  indicators — Idle / Recording / Flagged / Submitted
- `FR-TD-02` — Mute All: broadcast event to disable all student microphones
  simultaneously
- `FR-TD-03` — Lock Screens: freeze all student consoles until unlocked by the
  teacher
- `FR-TD-04` — Launch Exam: push exam mode to all students; starts timer, locks
  navigation
- `FR-TD-05` — Broadcast Announcement: push audio or text to all student
  consoles
- `FR-TD-06` — Listen-in: silent one-way subscribe to a specific student's live
  microphone
- `FR-TD-07` — Pair students: assign two students into a private audio room for
  conversation practice
- `FR-TD-08` — Group creator: assign up to six students into a shared audio room
- `FR-TD-09` — Screen broadcast: teacher streams their screen or a video to all
  student consoles

**Gradebook & feedback**

- `FR-TD-10` — Gradebook updates in real time as students submit — no manual
  refresh required
- `FR-TD-11` — Per-submission view: audio playback, AI transcript, phoneme map,
  rubric scores
- `FR-TD-12` — Manual grade override + required justification field
- `FR-TD-13` — Timestamped audio and text feedback per submission
- `FR-TD-14` — Class analytics: per-phoneme weakness map, vocabulary gaps, CEFR
  level distribution
- `FR-TD-15` — Gradebook CSV export

---

## 6. Data Model

All tables include `school_id` (UUID, NOT NULL) as a foreign key. Supabase RLS
policies enforce school-level isolation on every table — no query can return
rows outside the authenticated user's school.

### schools

| Column      | Type        | Notes / Constraints                          |
|-------------|-------------|----------------------------------------------|
| id          | uuid        | PRIMARY KEY; default `gen_random_uuid()`     |
| name        | text        | NOT NULL                                     |
| slug        | text        | UNIQUE NOT NULL; used in subdomain routing   |
| plan        | text        | default 'standard'                           |
| created_at  | timestamptz | NOT NULL, default now()                      |

### users

| Column        | Type        | Notes / Constraints                                            |
|---------------|-------------|---------------------------------------------------------------|
| id            | uuid        | PRIMARY KEY — references `auth.users(id)`                      |
| school_id     | uuid        | FK → `schools(id)`, NOT NULL                                   |
| role          | text        | CHECK IN ('system_admin','dept_head','teacher','student')     |
| full_name     | text        | NOT NULL                                                       |
| email         | text        | UNIQUE NOT NULL                                                |
| language_pref | text        | default 'en'                                                   |
| created_at    | timestamptz | NOT NULL, default now()                                        |

### submissions

Append-only. A submission record is never updated after creation. The grading
result is a separate record written by the AI worker on completion.

| Column           | Type        | Notes / Constraints                                       |
|------------------|-------------|-----------------------------------------------------------|
| id               | uuid        | PRIMARY KEY                                               |
| school_id        | uuid        | FK — RLS anchor                                           |
| student_id       | uuid        | FK → `users(id)`                                          |
| activity_id      | uuid        | FK → `activities(id)`                                     |
| raw_storage_path | text        | `{school_id}/{course_id}/{student_id}/{id}.webm`          |
| processed_path   | text        | `{school_id}/{course_id}/{student_id}/{id}.wav`           |
| status           | text        | pending \| processing \| graded \| failed                |
| submitted_at     | timestamptz | NOT NULL, default now()                                  |

### grading_results

Raw scores (phoneme arrays, WPM, WER) stored alongside computed display scores.
This enables re-grading with a revised formula without re-running the AI models.

| Column              | Type        | Notes / Constraints                              |
|---------------------|-------------|--------------------------------------------------|
| id                  | uuid        | PRIMARY KEY                                       |
| submission_id       | uuid        | FK → `submissions(id)`, UNIQUE                    |
| transcript          | text        | Faster-Whisper output                            |
| phoneme_scores      | jsonb       | `[{phoneme, expected, confidence, timestamp_ms}]`|
| wpm                 | integer     | words per minute                                 |
| wer                 | float       | word error rate, 0.0 – 1.0                       |
| fluency_score       | integer     | computed, 0 – 100                                |
| pronunciation_score | integer     | computed, 0 – 100                                |
| cefr_estimate       | text        | A1 \| A2 \| B1 \| B2 \| C1 \| C2                 |
| model_version       | text        | e.g. `whisper-medium-v12`                        |
| graded_at           | timestamptz | NOT NULL                                         |

> **Note on `grading_results`:** `grading_results` carries `school_id` as well
> (every table includes it per the §6 intro line); it is the RLS anchor and is
> denormalized from the parent `submissions` row. The phoneme confidence value
> is always stored raw (0.0–1.0) — band labels (strong/weak/flagged) are
> computed at the presentation layer. See PRD addendum §6.1 for thresholds.

---

## 7. API Contracts *(summarized)*

All endpoints are Next.js Route Handlers with tRPC for typed client-server
calls. Supabase JWT authentication is enforced on every request. File upload
and SSE endpoints are standard HTTP.

**Submission & media endpoints**

| Method | Endpoint                              | Description                                                  |
|--------|---------------------------------------|-------------------------------------------------------------|
| POST   | `/api/submissions/upload`             | Initiate chunked upload; returns `upload_id` and presigned chunk URLs |
| PUT    | `/api/submissions/upload/:id/:chunk`  | Upload a single chunk; server reassembles on final chunk    |
| POST   | `/api/submissions/upload/:id/complete`| Confirm all chunks received; triggers FFmpeg normalization job |
| GET    | `/api/submissions/:id`                | Fetch submission metadata and grading result if ready       |
| GET    | `/api/submissions/:id/stream`         | SSE stream — emits grade_complete when grading job finishes |
| DELETE | `/api/submissions/:id`                | Soft-delete (teacher or admin only)                         |

**Grading & feedback endpoints**

| Method | Endpoint                            | Description                                                |
|--------|-------------------------------------|-----------------------------------------------------------|
| PATCH  | `/api/grading/:id/override`         | Teacher manual override of AI score; justification field required |
| POST   | `/api/grading/:id/feedback`         | Attach text or audio feedback to a submission             |
| GET    | `/api/grading/:class/course_id`     | Aggregated class scores, phoneme-weakness map, CEFR distribution |
| GET    | `/api/grading/export/:course_id`    | CSV export of gradebook for a course                      |

**Real-time orchestration — Socket.io events**

| Event             | Direction          | Payload / behaviour                                              |
|-------------------|--------------------|-----------------------------------------------------------------|
| `classroom:mute_all` | Teacher → Students | `{ class_id }` — disables microphone on all student sockets in the room |

*(Full event list continues in PRD addendum §3 and `.claude/rules/realtime.md`.)*

## 8. Architecture *(summarized)*

See AGENTS.md "Tech stack" and `docs/deployment-tiers.md`. Self-hosted, three
grading tiers (Manual / CPU-assisted / GPU-accelerated).

## 9. Roadmap

> **Superseded.** PRD addendum §4 roadmap replaces v1.0 Section 9 in full (per
> addendum §9 sign-off). See `docs/PRD-addendum-v1.1.md`.

## 10–12. *(unchanged — see PDF)*

Open Questions, Glossary, and Sign-off remain as in the signed PDF. Addendum §8
resolves several v1.0 open questions.
