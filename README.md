# RoutLang

Self-hosted school language-learning platform. Students record audio/video
against a master track, get AI-graded pronunciation and fluency feedback
(English/French in MVP), and teachers get a live gradebook with real-time
classroom orchestration.

> **Specs:** `docs/PRD-v1.0.md`, `docs/PRD-addendum-v1.1.md` (the binding 6-month
> roadmap). Project context + architectural rules live in `AGENTS.md` — read it
> before writing code. Path-scoped rules are in `.claude/rules/`.

## Status

**Phase 1 (Core loop) — complete; delivery/orchestration hardening in
progress.** The record → grade → review loop works end to end. Built so far:

- Monorepo: Next.js 16 (App Router, Turbopack), TypeScript strict, Tailwind v4,
  Drizzle, pnpm workspace (`packages/db`, `packages/ts-config`). API layer is
  Next.js route handlers (Zod-validated, session-guarded, RLS-scoped), not tRPC
  (decision 2026-07-05, see AGENTS.md).
- Database: nine `school_id`-bearing tables (`schools`, `users`, `classes`,
  `class_memberships`, `activities`, `activity_assignments`, `submissions`,
  `submission_processing_states`, `grading_results`). Append-only `submissions`;
  runtime state lives in `submission_processing_states`.
- **Multi-tenant RLS** on every table, role-aware, with an isolation suite that
  runs through the real Drizzle connection (`pnpm test:rls`, 35 tests). Every
  DB access in the app goes through `withClaims`, which switches to the
  non-privileged `authenticated` role per transaction — there is no code path
  that reaches Postgres outside it (audited 2026-07-20).
- **Supabase Auth**: email login, role-based redirects (4-tier RBAC:
  `system_admin` / `dept_head` / `teacher` / `student`), session refresh via
  `proxy.ts`.
- **Student flow**: mission list → assignment → record (custom Web Audio +
  Canvas; WaveSurfer was rejected on Safari iOS) → chunked upload → review with
  scores, phoneme feedback, and teacher notes.
- **Teacher flow**: activity authoring + preview, class monitoring, submission
  review, manual override, and re-grade.
- **Assignment targeting**: activities are published to classes via
  `activity_assignments`; students see only assigned missions for their classes.
- Submission pipeline: canonical raw/processed storage paths, FFmpeg
  normalization, BullMQ + Redis queueing, dead-letter handling, and
  manual-tier `pending_review` routing when `AI_SERVICE_URL` is unset.
- **AI grading service** (`ai_service/`, FastAPI): Faster-Whisper transcription,
  silero-VAD gate, WER, CEFR estimate, and pronunciation scoring — real
  MFA + Wav2Vec2 phoneme confidences when that optional stack is installed, with
  a timing/coverage heuristic as the fallback. Exposes `POST /grade` + `/health`.
- Docker Compose for local dev (Postgres + Redis + app + workers + AI service).

Left for later sprints (see `docs/backend-next-milestone.md` for the order):

1. **Socket.io classroom orchestration** — live grade push (`grade:complete`)
   and teacher controls (`mute_all`, `lock_screens`, `launch_exam`,
   `broadcast`) are not built; the student flow polls for grade status today.
2. **Phoneme-scoring refinement** — threshold tuning and GPU-stack validation
   on top of the working pipeline above.

Not yet done, and required before real student data lands:

- **No CI.** `.github/workflows/` does not exist. The RLS suite is green
  locally but nothing runs it on push, so a commit can break a tenant policy
  silently.
- **Supabase is unprovisioned.** `pnpm db:migrate` and `pnpm rls:apply` have
  never been run against the managed instance; `DATABASE_URL` points at local
  Postgres. The deployment target currently has no schema and no policies.

Explicitly v2 (not "unfinished" — see PRD addendum §2): LiveKit/WebRTC,
WordCards, MiniLesson, Nigerian-language support.

## Prerequisites

- **Node 20.9+** (we use v22) and **pnpm** (`corepack enable`)
- **PostgreSQL 17** for local dev — `brew install postgresql@17`
  (or use the Docker path below, which bundles Postgres)
- **FFmpeg** for audio normalization — `brew install ffmpeg`
- **Redis** for BullMQ — `brew install redis`
- **Python 3.11+** if you want to run the Week 9 AI service outside Docker
- A **Supabase project** (free tier) for auth — see [Auth setup](#auth-setup)

## Quick start (local Postgres)

```bash
# 1. Install deps
pnpm install

# 2. Env — copy the template and fill in Supabase values (see Auth setup)
cp .env.example .env

# 3. Start local Postgres on port 5433 (one-time init, then start)
export PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH"
initdb -D .pgdata -U lingua_admin --auth=trust          # first time only
pg_ctl -D .pgdata -o "-p 5433 -k /tmp" -l .pgdata/server.log start
createdb -h /tmp -p 5433 -U lingua_admin lingua_lab     # first time only

# 4. Apply schema + RLS policies
pnpm db:migrate     # creates the tables
pnpm rls:apply      # enables RLS + applies tenant policies

# 5. Run it
pnpm dev            # http://localhost:3000
pnpm worker:normalization
pnpm worker:grading
```

> The `.pgdata` cluster is gitignored and local-only. After a reboot, just
> re-run the `pg_ctl ... start` line — the init/createdb steps are one-time.

## Auth setup

Login goes through **Supabase Auth** (cloud); RLS reads the `school_id` claim
from the issued JWT. To make login work:

1. Create a project at https://supabase.com/dashboard.
2. **Settings → API**: copy the **Project URL** and the **anon public** key into
   `.env`:
   ```
   NEXT_PUBLIC_SUPABASE_URL="https://YOUR-PROJECT.supabase.co"
   NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJ..."
   ```
   (Only the anon key — never the service-role key, which bypasses RLS.)
3. **Authentication → Users → Add user**: set an email + password, check
   **Auto Confirm User**.
4. Give the user a role + tenant. In the **SQL Editor**, run (swap in the
   user's id, pick any of the 4 roles, any UUID for the school):
   ```sql
   update auth.users
   set raw_app_meta_data = raw_app_meta_data || jsonb_build_object(
     'role', 'system_admin',
     'school_id', '11111111-1111-1111-1111-111111111111'
   )
   where id = '<user-id>';
   ```
5. Sign in at `/login`. You'll be redirected by role:
   `system_admin`/`dept_head` → `/admin`, `teacher` → `/teacher`,
   `student` → `/student`. No role yet → `/onboarding`.

> **Env changes don't hot-reload** — restart `pnpm dev` after editing `.env`.

**Joining an existing team instead of starting a fresh project?** Don't create
your own Supabase project — ask whoever's already running one for
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, the `SEED_*_ID`
values (so your local rows match the real Supabase Auth user ids), and a test
account's email/password. None of that belongs in a tracked file — get it
directly, never paste it into a PR, issue, or committed doc.

Frontend polish backlog is tracked in Linear (not in this repo) — worth a skim
before picking up UI work.

## Docker (alternative to local Postgres)

> ⚠️ Built and YAML-valid, but **not yet run end-to-end** (no Docker on the dev
> machine it was authored on). Treat as a starting point; verify on first use.

```bash
docker compose up                          # Postgres + Redis + app + workers + AI service
docker compose exec app pnpm db:migrate    # first run: schema
docker compose exec app pnpm rls:apply     # first run: RLS
```

## AI service (Week 9)

The grading worker now targets a FastAPI microservice at `AI_SERVICE_URL`.
Local Docker sets this to `http://ai-service:8000` by default.

The service lives under `ai_service/` and exposes:

- `GET /health`
- `POST /grade`

Run it outside Docker with:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r ai_service/requirements.txt
uvicorn ai_service.app.main:app --host 0.0.0.0 --port 8000
```

If Faster-Whisper or silero-vad cannot load, `/health` reports `degraded` and
`/grade` returns `503` instead of inventing a fake grade.

Smoke-check the full handshake against a real normalized file with:

```bash
AI_SERVICE_URL="http://127.0.0.1:8000" pnpm ai:smoke uploads/processed/<school>/<course>/<student>/<submission>.wav
```

That command hits `/health` first, then `/grade`, and prints the returned
transcript + scoring fields. Use an actual normalized `.wav` under `uploads/processed/`.

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Next.js dev server (Turbopack) → localhost:3000 |
| `pnpm worker:normalization` | BullMQ worker for FFmpeg normalization |
| `pnpm worker:grading` | BullMQ worker for AI grading |
| `pnpm build` | Production build |
| `pnpm lint` | ESLint (flat config) |
| `pnpm typecheck` | TypeScript no-emit check |
| `pnpm test` | Vitest (db package) |
| `pnpm test:rls` | **RLS isolation test** — run after any schema/RLS change |
| `pnpm db:generate` | Generate a Drizzle migration from schema changes |
| `pnpm db:migrate` | Apply migrations |
| `pnpm rls:apply` | Apply `packages/db/drizzle/rls/*.sql` (RLS is hand-written, not generated) |

## Layout

```
app/                     Next.js App Router
  (auth)/                login, onboarding, password flows + auth Server Actions
  (dashboard)/           admin / teacher / student consoles (role-gated)
components/              UI (forms, audio, table) — audio/table are later-sprint stubs
utils/
  supabase/              browser + server Supabase clients, proxy session refresh
  auth/dal.ts            verifySession / requireRole — the auth boundary
packages/
  db/                    Drizzle schema, RLS policies, RLS test (@lingua/db)
  ts-config/             shared strict tsconfig
proxy.ts                 session refresh + optimistic auth gate (Next 16: was middleware)
docker-compose.yml       local dev stack
```

## Working agreements

- **Every `school_id` table needs an RLS policy + an RLS test** before anything
  builds on it (`AGENTS.md` rule #2). The app connects as a non-`BYPASSRLS`
  role on purpose — never point `DATABASE_URL` at a service-role/superuser.
- `submissions` is **append-only** — never `UPDATE` it; re-grades insert a new
  `grading_results` row.
- Two tools work this repo (Claude Code + Codex). Check `docs/active-work.md`
  before starting and update it when you finish — it's the handoff log.
