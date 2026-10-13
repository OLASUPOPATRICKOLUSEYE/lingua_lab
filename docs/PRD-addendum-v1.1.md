# LinguaLab — PRD Implementation Addendum

Version 1.1 — 6-Month MVP Re-Scope & Implementation Clarifications
Status: Draft — For Internal Review

Supersedes the roadmap in Section 9 of PRD v1.0. All other sections of v1.0
remain in force.

| Document       | Team size  | MVP timeline | Deferred to v2   |
|----------------|------------|--------------|------------------|
| Addendum v1.1  | 2 engineers| 6 months     | 4 feature areas  |

> **Provenance note:** Transcribed from `PRD-addendum-v1.1.pdf`, an image-only
> (scanned) PDF with no text layer, into markdown for tooling that expects
> `docs/PRD-addendum-v1.1.md` (per AGENTS.md). The PDF remains canonical.

---

## 1. Purpose of This Addendum

PRD v1.0 established the product vision, modules, data model, API contracts, and
architecture for LinguaLab. A subsequent re-scope identified two categories of
gap: first, a set of technical details that were left ambiguous and need
concrete answers before the relevant sprint begins; second, a structural issue
with the roadmap itself — the 8-month, 3-phase plan in Section 9 of v1.0 assumes
more engineering capacity than is available.

This addendum does three things. It re-scopes the roadmap into a realistic
6-month MVP for a 2-person team, with a cleanly separated v2 backlog. It answers
the technical questions that are concrete enough to settle now, so they don't
become blockers mid-sprint. And it elevates one engineering recommendation — a
pre-build spike on dual-track waveform sync — because it is the single
highest-risk item in the entire build.

*Everything in PRD v1.0 (not explicitly revised here remains in force: the data
model (Section 6), API contracts (Section 7), the storage path discipline, and
the overall module breakdown (Section 6.4) are unchanged.*

## 2. Revised MVP Scope

The original v1.0 roadmap described 8 months across three phases covering all
six modules, full real-time orchestration including LiveKit, and Nigerian
language support. For a 2-person team, this is closer to a 12–14 month effort if
pursued as written. Rather than compress the same scope into 6 months — which
produces a starved, fragile build — the scope itself is reduced. The phases are
reprioritised, not compressed.

### In scope for the 6-month MVP

| Area                      | Why it stays in MVP                                                           |
|---------------------------|------------------------------------------------------------------------------|
| Recorder & waveform       | Browser audio/video recording, dual-track playback, live waveform via WaveSurfer.js |
| AI grading pipeline        | Self-hosted Faster-Whisper transcription, Wav2Vec2 + MFA pronunciation scoring (EN/FR), MFA preprocessing |
| Speaking assessment        | Free Speaking, Prompted Speaking, Read Aloud, Dictation, phoneme map, rubric grading |
| Read Aloud                 | Passage display, WPM/WER scoring, transcript highlighting                     |
| Teacher orchestration (core) | Socket.io-based Mute All, Lock Screens, Launch Exam, Broadcast — text and audio |
| Gradebook & dashboards     | Real-time grade updates, student progress dashboard, class analytics         |
| Data integrity             | Re-grading workflow, retention policy, RLS test coverage on all tables        |
| Production readiness        | CI/CD, Sentry/Grafana monitoring, load testing against defined latency targets, school LMS |

### Deferred to v2 (separately scoped after MVP ships)

| Area                          | Why it's deferred                                                                 |
|-------------------------------|-----------------------------------------------------------------------------------|
| LiveKit (listen-in, pairing, screen broadcast) | Highest-complexity feature cluster in the entire system (rated 9/10). Self-hosted WebRTC, token-scoped access, and NAT traversal each carry independent risk. MVP orchestration via Socket.io covers the highest-value teacher controls without this dependency. |
| WordCards                     | Fully left-contained vocabulary module with no dependency on any other part of the system. Zero risk to defer — can be built in parallel with v2 work or as a standalone sprint. |
| MiniLesson                    | By design, sequences activities from the other five modules; it's naturally the last module to build — deferring it doesn't block anything else and avoids building a sequencing layer for modules that don't yet exist. |
| Nigerian languages (Meta MMS) | Already correctly scoped in v1.0 as a research effort requiring fine-tuning data that does not yet exist. For 2 engineers, this is a separate engagement with its own timeline, not a point inside the MVP. |

> **What this means for the school:** The MVP delivers the full core value
> proposition described to the school: students record, get AI-graded
> pronunciation and fluency feedback in English and French, and teachers see
> live results with classroom controls. The deferred items unbundle through a
> defined v2 engagement — not a missing promise.

## 3. Critical Path — Phase 1 Waveform Spike

Before any sprint planning is finalised, a 2–3 day spike must be run on
dual-track waveform synchronisation using WaveSurfer.js, tested on Chrome
(desktop) and Safari iOS 15+. This is elevated above every other item in the
document because it is the highest-risk technical assumption in the entire MVP,
and the cost of discovering a problem in week 4 is the difference between a
manageable schedule adjustment and a blown sprint.

### Spike scope

- Render two synchronised waveforms (master track + live recording) in the same
  view
- Confirm playback sync holds within ±20 ms across both tracks on repeated runs
- Confirm Safari iOS AudioContext behaviour — known to require a user-gesture
  unlock and to suspend on background/lock
- **Acceptance threshold** — sub-200 ms latency from microphone activation to
  first rendered waveform pixel, on both desktop Chrome and Safari iOS 15+

### Go / no-go decision

- **Go** — WaveSurfer.js meets the threshold on both platforms — proceed with
  Weeks 3–4 as scoped
- **No-go** — fall back to a custom Web Audio API + Canvas implementation for
  the waveform layer. This is a known, well-understood pattern but adds an
  estimated 1 extra week to Phase 1 — budget this contingency now rather than
  discovering it mid-sprint

## 4. Revised Roadmap — 6 Months, 2 Engineers

This roadmap replaces Section 9 of PRD v1.0 in full. The structure (Foundation
→ AI pipeline → polish) is preserved, but each phase is reduced to MVP scope as
defined in Section 2 above.

### Phase 1 — Foundation (Months 1–2, Weeks 1–8)

Goal: prove the recorder, waveform, and data pipeline end-to-end. AI grading is
not yet live, but every system it depends on is in production. Week 1 begins
with the waveform spike defined in Section 3.

| Sprint                     | Deliverables                                                                                                 |
|----------------------------|--------------------------------------------------------------------------------------------------------------|
| **Week 1** (Days 1–3)      | • Dual-track WaveSurfer.js sync spike on Chrome + Safari iOS 15+ • Go/no-go decision against the ±20ms sync and 200ms latency thresholds • If no-go: confirm fallback plan and adjust Weeks 3–4 estimate by +1 week |
| **Weeks 1–2** (Scaffold & auth) | • Monorepo — Next.js 15, TypeScript strict, Tailwind v4, tRPC, Drizzle ORM • Supabase project — schema, RLS policies, RLS test • Docker Compose — all services running locally in one command • Auth flows — role-based redirects per the 4-tier RBAC, session management • Multi-tenant `school_id` isolation enforced at database level from day one |
| **Weeks 3–4** (Recorder & waveform) | • Web Audio API + MediaRecorder browser recorder • Dual-track WaveSurfer.js — informed by spike outcome • Side-by-side master + student frequency comparison on playback • Chunked 5 MB upload with retry logic and progress indication |
| **Weeks 5–6** (Pipeline & storage) | • FFmpeg normalization pipeline (defined in Section 6.2) • Three separate Supabase Storage buckets — raw, processed, exports — with lifecycle rules (Section 6.3) • BullMQ + Upstash Redis queue, dead-letter configured • Canonical storage path enforced — UUID-only (Section 6.5) • Submission data model — append-only, immutable row creation |
| **Weeks 7–8** (Basic teacher panel) | • Teacher dashboard — view all submissions per course • Audio playback with WaveSurfer.js in teacher review view • Manual grade entry and justification field • Re-grading workflow scaffolding (Section 6.4) • End-to-end integration test: student records → teacher sees and plays back |

> **Phase 1 milestone:** End of month 2. A student records audio against a
> master track, sees both waveforms side-by-side, and submits. A teacher sees
> the submission instantly and can play it back or enter a manual grade. The
> data pipeline — recording, normalization, storage, gradebook — is live,
> tested, and reliable.

### Phase 2 — AI Pipeline & Core Orchestration (Months 3–4, Weeks 9–16)

Goal: AI grades every submission automatically in English and French. Teachers
gain real-time classroom orchestration (listen-in, pairing, screen broadcast)
are explicitly out of scope for this phase — see Section 3.

| Sprint                     | Deliverables                                                                                                 |
|----------------------------|--------------------------------------------------------------------------------------------------------------|
| **Weeks 9–10** (AI service setup) | • FastAPI + Uvicorn microservice on a self-hosted GPU server • Faster-Whisper medium (GPU) / EN and FR transcription live • VAD (silero-vad) integrated before pronunciation scoring (Section 6.6) • GPU concurrency control: BullMQ concurrency:1, OOM protection • Faster-whisper warm/cold returning transcript and word timestamps |
| **Weeks 11–12** (Pronunciation scoring) | • Wav2Vec2-large model loaded and serving • Montreal Forced Aligner — EN/FR lexicons and acoustic models sourced (Section 6.6) • /score/pronunciation returning phoneme_scores[] with confidence values • Confidence thresholds applied: ≥0.8 strong, 0.3–0.8 weak, <0.3 flagged (Section 6.1) • grading_result written to Postgres; Supabase Realtime push confirmed |
| **Weeks 13–14** (Speaking modules) | • Speaking Assessment UI — Free Speaking and Prompted Speaking • Oral Dictation exercise type • Phoneme map component using the confidence bands from Section 6.1 • Rubric grading visible — Fluency / Vocabulary / Grammar / Pronunciation • Teacher submission review — transcript, phoneme map, score, manual override |
| **Weeks 15–16** (Live orchestration) | • Socket.io server — classroom room isolation, reconnection logic • Classroom grid UI — live student status map • Mute All, Lock Screens, Launch Exam, Broadcast Announcement commands • Latency targets defined and validated (Section 3) — load-test tooling selected at this point; not before |

> **Phase 2 milestone:** End of month 4. Every submission is AI-graded within 30
> seconds, with phoneme-level pronunciation feedback in English and French.
> Teachers can mute the class, push a speaking exercise, lock screens, and
> broadcast announcements — all in real time. Live classroom monitoring and
> piping remain x3.

### Phase 3 — Read Aloud, Analytics & Hardening (Months 5–6, Weeks 17–24)

Goal: complete the MVP module set, give students and teachers meaningful
analytics, and harden the platform for daily school use.

| Sprint                     | Deliverables                                                                                                 |
|----------------------------|--------------------------------------------------------------------------------------------------------------|
| **Weeks 17–18** (Read Aloud) | • Read Aloud UI — passage display with synced word highlighting during recording • WPM and WER computation against teacher-assigned passage • Per-sentence accuracy highlighting in transcript review • Read Aloud score fed into gradebook; teacher feedback loop |
| **Weeks 19–20** (Analytics) | • Student progress dashboard — score history, phoneme weakness map, CEFR progression • Class analytics — cohort phoneme gaps, CEFR distribution • Timestamped audio and text feedback per submission • CSV gradebook export (columns confirmed in Section 6.5) |
| **Weeks 21–22** (Data integrity) | • Re-grading workflow fully implemented (Section 6.4) • Data retention automation per policy (Section 6.5) • RLS test suite — one test per table minimum, any SQL-bound harness (Section 6.7) • Admin panel — user management, storage health, platform usage metrics |
| **Weeks 23–24** (Production hardening) | • GitHub Actions CI/CD — lint, type-check, test, build, push, deploy • Sentry error tracking live; Grafana GPU and queue-depth dashboard • Load test against latency targets from Section 3, using tooling selected in Phase 2 • School LMS — structured testing with real teachers and students; bug-fix sprint |

> **Phase 3 milestone — MVP complete (end of month 6):** Recorder, AI-graded
> Speaking Assessment and Read Aloud in English and French, real-time
> gradebook, core teacher orchestration, student and class analytics, and a
> monitored, CI/CD-deployed platform validated through school use. WordCards,
> LiveKit features, and Nigerian languages form the v2 backlog, scoped
> separately.

## 5. Orchestration Latency Targets

Per-command latency targets for Socket.io orchestration, to be validated in
Weeks 23–24. The load-testing tool (k6, Artillery, or Locust) is selected when
this sprint begins — the targets below are fixed now so tool choice doesn't
shift the definition of done.

| Command               | Target latency | Notes                                                            |
|-----------------------|----------------|------------------------------------------------------------------|
| Mute All              | < 100 ms       | Broadcast to all student sockets in a classroom room             |
| Lock Screens          | < 100 ms       | Same broadcast mechanism as Mute All                            |
| Launch Exam           | < 200 ms       | Includes timer-initialization across all clients                |
| Broadcast (text)      | < 100 ms       | Single message to all sockets in room                           |
| Broadcast (audio)     | < 500 ms       | Audio-payload size dominates; measured to playback-ready, not just delivery |
| student:status_update | < 1 ms         | Student → teacher status changes (idle/recording/submitted)     |

> *Network condition simulation (high-latency, packet-loss) is included in the
> Weeks 23–24 load test but is not a separate sprint item — it is a
> configuration of whichever tool is selected.*

## 6. Technical Clarifications

The following items were ambiguous in PRD v1.0. Each is settled here with a
concrete answer to the relevant sprint is not blocked on a decision.

### 6.1 Phoneme Confidence Thresholds

Wav2Vec2's per-phoneme confidence score (its softmax output of the aligned
frame) is bucketed into three bands for both the student-facing phoneme map and
the teacher-review channel.

| Confidence | Label     | Behaviour                                                                          |
|------------|-----------|------------------------------------------------------------------------------------|
| 0.8 – 1.0  | Strong    | Shown in green on the phoneme map; no action needed                               |
| 0.3 – 0.8  | Weak      | Shown in amber; included in the student's "sounds to practise" list               |
| < 0.3      | Flagged   | Shown in red; surfaced to the teacher for manual review — not auto-scored as a hard fail |

Mispronunciations do not receive a flat zero. The `phoneme_scores[]` array
stores the raw confidence value regardless of band; the bands above are a
presentation-layer mapping only, which preserves the ability to retune
thresholds later without re-running inference (consistent with the immutability
rule in v1.0 Section 6.2).

**Example `phoneme_scores[]` entry:**

```json
{ "phoneme": "θ", "expected": "θ", "confidence": 0.42, "timestamp_ms": 1240.0 }
```

`// rendered red, flagged for teacher review, contributes to the student's
per-sound weakness map in Section 6.4 of v1.0.`

### 6.2 FFmpeg Normalization — Command & Benchmark

The exact normalization command run by the BullMQ worker before any audio
reaches the AI pipeline:

```bash
ffmpeg -i input.webm -ar 16000 -ac 1 -af loudnorm=I=-23:LRA=7:tp=-2 output.wav
```

Benchmark estimate for a 60-second submission on a standard CPU core: 2–4
seconds. This is well within the BullMQ unlimited-concurrency for this job type
(v1.0 Section 8.2) and does not contend with the GPU-bound AI queue.

> *Future handling:* an FFmpeg failure routes the job to the dead-letter queue
> exactly as described in v1.0 Section 11 (Risk). An audio job that cannot be
> normalized stops the existing dead-letter mechanism covers this.

### 6.3 Storage Bucket Architecture

`raw`, `processed`, and `exports` are three separate Supabase Storage buckets,
not folders within one bucket. This is required because lifecycle rules
(auto-deletion) and bucket-level access differ per bucket (with different
retention rules in Section 6.5 prefixes reliably).

| Bucket    | Contents                                            | Lifecycle                                                                |
|-----------|-----------------------------------------------------|--------------------------------------------------------------------------|
| raw       | Original browser recording (WebM/MP4), one file per submission | Deleted 24 hours after the corresponding grading_result is written — the source recording is disposable once normalization + grading output is later found defective the raw |
| processed | 16 kHz mono WAV output from FFmpeg                   | Retained per the data-retention policy in Section 6.5 — this is the file used for any re-grade |
| exports   | Teacher-generated archives (e.g. a student's full audio history) | Generated on demand, retained 7 days, then deleted — teachers re-generate if needed |

Teacher export of a student's processed audio archive is supported — it is the
mechanism that populates the exports bucket above. This is a Phase 3 (Weeks
19–20) deliverable alongside the CSV gradebook export.

### 6.4 Re-grading Workflow

A teacher-requested re-grade does not modify the original submission record.
This preserves the append-only immutability rule from v1.0 Section 6.2. Instead:

- The teacher dashboard displays the most recent grading_result by graded_at,
  but all historical results remain queryable.
- Re-grade is enqueued through the same BullMQ AI queue as a normal grading job
  — no separate priority lane, since re-grades are infrequent and not
  time-sensitive.
- The original `submission_id` is preserved; a new grading_result row is written
  with the same `submission_id`, a new `id`, and an incremented `model_version`.

### 6.5 Data Retention Policy

| Data                       | Retention   | Notes                                                                                  |
|----------------------------|-------------|----------------------------------------------------------------------------------------|
| raw bucket                 | 24 hours post-grading | See Section 6.3                                                                |
| processed bucket           | 12 months rolling | After 12 months, archived to cold storage; not deleted outright — schools may require it for academic record purposes |
| Transcripts & scores (Postgres) | Indefinite | Text-data storage cost is negligible. Retained for longitudinal student progress tracking |
| exports bucket             | 7 days      | See Section 6.3                                                                         |

CSV gradebook export format: one row per submission, columns — `student_name`,
`course`, `activity`, `submitted_at`, `fluency_score`, `pronunciation_score`,
`cefr_estimate`, `teacher_override` (if any). This is a fixed schema, not a
custom-per-school format, to keep the export endpoint simple.

### 6.6 VAD & MFA Lexicon Sourcing

Two AI pipeline dependencies needed concrete sourcing decisions before Phase 2:

- **Voice Activity Detection (VAD)** — silero-vad is selected over librosa-based
  energy thresholding. It is a small (~2 MB) pretrained model run before the
  GPU-bound Whisper/Wav2Vec2 queue, and trims silence from free-speech
  submissions before they reach the AI pipeline — reducing both processing time
  and false negative pronunciation distortions via its own model dependency.
- **MFA lexicons and acoustic models** — Montreal Forced Aligner ships
  pretrained English (US) and French (Provençalais / global) acoustic
  dictionaries via its own model repository ( though pre-fine-tuning data
  download ). These are used as-is for MVP — no custom lexicon work is required
  for EN/FR. Custom lexicons only become necessary for Nigerian languages in v2,
  where MFA's pretrained models do not exist and Meta MMS becomes the dependency
  instead.

### 6.7 RLS Test Coverage

Per v1.0 Section 6.4, an automated RLS test suite runs on every Postgres
migration. The specific framework (pgTAP, a Python harness using the Supabase
client with two test users, or raw SQL assertions) is an implementation choice
made by whoever writes the first test — the requirement is the test itself, not
the tool.

**Minimum test per table:**

For each table carrying `school_id`, create two test users in different schools,
attempt to read/write rows belonging to the other school, and assert zero rows
are returned and zero writes succeed. The submission table is the first table
tested, since it is the highest-value target for a cross-tenant leak.

## 7. Spaced Repetition — WordCards (v2)

Although WordCards is deferred to v2 (Section 2), the SM-2 interval and
state-transition logic is defined here while the underlying rationale is fresh.
This costs nothing now and removes one ambiguity from the v2 backlog before it's
scoped as its own item.

### SM-2 interval table (simplified for word-level review)

| Review outcome                 | Interval                        | Ease factor                                          |
|--------------------------------|---------------------------------|------------------------------------------------------|
| First exposure                 | 1 day                           | 2.5 (default)                                        |
| First successful review        | 4 days                          | 2.5                                                  |
| Subsequent successful review   | previous interval × ease factor | increases slightly on each pass, capped at 2.5       |
| Failed review                  | reset to 1 day                  | reset to 2.5                                          |

### State transitions

- **Introduced → Learning** — on the first successful review
- **Learning → Mastered** — after 3 consecutive successful reviews
- **Any state → Introduced** — on any failed review — full reset, not a one-step
  back. This keeps the model simple and matches the standard SM-2 behaviour for
  early-stage items.
- **Mastered words** — remain in the review rotation at their (now long) interval
  — they are not removed from review entirely, since long-term retention still
  decays.

## 8. Updated Open Questions

This replaces the open questions table in v1.0 Section 12. Items resolved by
this addendum are marked **Resolved**; items unique to the v2 scope are dialed.

| #  | Question                                                                                                       | Status / Owner                          |
|----|----------------------------------------------------------------------------------------------------------------|-----------------------------------------|
| 1  | Will the school provide a dedicated GPU server (min. RTX 3080, 10 GB VRAM), or will RouTel procure one?         | Open — School IT + RouTel               |
| 2  | Is Supabase managed cloud acceptable, or must all data remain on-premise via self-hosted Supabase?             | Open — this addendum                     |
| 3  | Confirm English + French for the 6-month MVP. Yoruba/Hausa/Igbo move to a separately scoped v2 engagement.      | Resolved — this addendum                 |
| 4  | How many concurrent students must the system support at peak? (Used for GPU and Redis sizing.)                 | Open — School stakeholder                |
| 5  | Phoneme confidence bands, FFmpeg command, storage architecture, retention policy, VAD/MFA sourcing.            | Resolved — Section 6 of this addendum    |
| 6  | LiveKit (listen-in, pairing, screen broadcast), WordCards, and MiniLesson are confirmed v2 — who sets and who timeline matters for MVP completion? | Open — RouTel leadership |
| 7  | Who collects Yoruba, Hausa, and Igbo speech recordings for fine-tuning Meta MMS, and who owns the training pipeline — school, RouTel, or a third party? | Open — carried from v1.0 Q6, applies to v2 |
| 8  | Is a 30-second AI grading latency acceptable, or must the target be faster?                                    | Open — School stakeholder                |

## 9. Sign-off

This addendum, together with PRD v1.0 (Sections 1–8 and 10–12, unchanged),
constitutes the complete specification for the LinguaLab 6-month MVP. The
roadmap in Section 4 above is binding on the build and replaces v1.0 Section 9
in full.
