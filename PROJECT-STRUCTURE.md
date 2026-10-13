** PROJECT STRUCTURE **

Last verified against the tree: 2026-07-20.

This file maps the repository as it actually exists. When it disagrees with
`docs/PRD-v1.0.md`, the tree wins — the PRD records intent, this records
reality (Iron Law 19).

lingua_lab/
├── .next/                                   # Next.js build cache (generated)
├── node_modules/                            # Managed by pnpm via workspaces
│
├── app/                                     # --- NEXT.JS 15 APP ROUTER ---
│   ├── (auth)/                              # Authentication route group
│   │   ├── accept-invite/page.tsx           # Tenant invitation acceptance
│   │   ├── forgot-password/page.tsx         # Password recovery request
│   │   ├── login/page.tsx                   # Portal entry (email/password)
│   │   ├── onboarding/page.tsx              # School profile initialization
│   │   ├── reset-password/page.tsx          # Recovery token destination
│   │   └── actions.ts                       # Server actions for the auth forms
│   │
│   ├── (dashboard)/                         # Role-gated layout group
│   │   ├── admin/page.tsx                   # School administrator console
│   │   ├── settings/page.tsx                # Account/profile settings
│   │   ├── student/
│   │   │   ├── page.tsx                     # Student hub: activity feed + progress
│   │   │   └── assignments/
│   │   │       ├── page.tsx                 # Assigned mission list
│   │   │       └── [id]/page.tsx            # Practice workspace (record → upload → results)
│   │   └── teacher/
│   │       ├── page.tsx                     # Cross-class dashboard + published missions
│   │       ├── activities/[id]/preview/     # Teacher-facing preview of a live mission
│   │       ├── classes/page.tsx             # All-classes list (links into each below)
│   │       ├── classes/[classId]/page.tsx   # Class monitor + lesson authoring
│   │       └── submissions/[submissionId]/  # Submission review + playback
│   │
│   ├── api/                                 # --- REST ROUTE HANDLERS (see note below) ---
│   │   ├── activities/route.ts              # List / create activities
│   │   ├── activities/[id]/route.ts         # Read / update a single activity
│   │   ├── activities/[id]/assignments/     # Assign to class; update/archive assignment
│   │   ├── activities/[id]/reference-audio/ # Teacher reference audio upload
│   │   ├── activities/[id]/reference-video/ # Teacher reference video upload
│   │   ├── activities/[id]/reference-media/ # Shared reference media read path
│   │   ├── grading/[submissionId]/override/ # Teacher score override
│   │   ├── grading/[submissionId]/regrade/  # Enqueue a re-grade (new grading_results row)
│   │   ├── submissions/upload/route.ts      # Chunked upload (5MB chunks)
│   │   ├── submissions/[id]/route.ts        # Submission status — polled by the student flow
│   │   └── submissions/[id]/media/route.ts  # Signed media read
│   │
│   ├── spike/                               # Recorder spike harnesses (see docs/spike-results.md)
│   ├── globals.css                          # Tailwind v4 entrypoint + light/.dark theme tokens
│   ├── layout.tsx                           # Root layout: fonts, providers
│   └── page.tsx                             # Public landing page
│
├── components/                              # --- CLIENT INTERFACE ---
│   ├── recorder/                            # LIVE recorder stack (Web Audio + Canvas)
│   │   ├── AudioRecorder.tsx                # MediaRecorder capture + chunked upload
│   │   ├── DualTrackPlayer.tsx              # Master/student synchronized playback
│   │   ├── WaveformVisualizer.tsx           # AnalyserNode + requestAnimationFrame canvas
│   │   ├── StudentAssignmentWorkspace.tsx   # Record → compare → send → poll for grade
│   │   ├── TeacherReadAlong.tsx             # Teacher reference recording
│   │   ├── MouthReview.tsx                  # Mouth-position review
│   │   ├── MouthComparison.tsx              # Side-by-side mouth comparison
│   │   ├── RecorderDemo.tsx / SpikeHarness.tsx  # Spike + demo surfaces
│   │   └── recorder-utils.ts                # Shared chunked-upload helper
│   ├── audio/                               # DEAD — superseded by components/recorder/.
│   │                                        # Unreferenced by any import; contents have
│   │                                        # diverged from the recorder/ versions. Safe to
│   │                                        # delete in a dedicated cleanup change.
│   ├── teacher/                             # Teacher surfaces (studio, review, class list)
│   ├── student/                             # Student-facing surfaces
│   ├── dashboard/ feedback/ forms/ icons/ landing/ table/
│   └── ui/                                  # shadcn/ui baseline
│
├── packages/                                # --- WORKSPACE PACKAGES ---
│   ├── db/                                  # Drizzle schema, client, RLS, migrations
│   │   ├── drizzle/                         # Generated migrations (0000-00xx)
│   │   │   └── rls/                         # Hand-written RLS policies, applied by rls:apply
│   │   └── src/
│   │       ├── client.ts                    # pool + db + withClaims (the ONLY tenant path)
│   │       ├── lib/storage-paths.ts         # buildStoragePath() — canonical paths only
│   │       ├── rls-tests/                   # RLS suite, runs through the real Drizzle conn
│   │       ├── scripts/                     # apply-rls.ts, seed-test-users.ts (admin conn)
│   │       └── schema/                      # schools, users, activities, classes,
│   │                                        # class_memberships, activity_assignments,
│   │                                        # submissions, submission_processing_states,
│   │                                        # grading_results
│   └── ts-config/base.json                  # Shared strict TypeScript config
│
├── server/                                  # --- SERVER-SIDE BOUNDARY ---
│   ├── ai/                                  # FastAPI client + grading contract mirror
│   ├── audio/ffmpeg.ts                      # Normalization before any model sees audio
│   ├── grading/                             # grading_results writes, manual review
│   ├── queues/                              # BullMQ queues + Redis connection
│   ├── uploads/finalize-upload.ts           # Chunk assembly
│   ├── workers/                             # grading + normalization workers (concurrency 1)
│   ├── context.ts
│   └── routers/, root.ts, trpc.ts           # DEAD — tRPC tree is not mounted. No /api/trpc
│                                            # handler exists and nothing imports appRouter.
│                                            # Superseded by app/api/** route handlers per the
│                                            # 2026-07-05 decision in AGENTS.md. The four
│                                            # @trpc/* deps in package.json are likewise unused.
│
├── utils/                                   # --- SERVER/CLIENT UTILITIES ---
│   ├── auth/dal.ts                          # verifySession / requireRole → AuthClaims
│   ├── dashboard/ student/ teacher/ teacher-review/  # Per-surface data loaders
│   ├── presentation/                        # Score/phoneme band formatting
│   ├── settings/ storage/
│   └── supabase/                            # Browser + SSR Supabase clients
│
├── ai_service/                              # --- FASTAPI AI MICROSERVICE ---
│   ├── app/                                 # POST /grade, GET /health
│   ├── tests/
│   └── requirements.txt, requirements-pronunciation.txt
│
├── docker/postgres/init/                    # Role bootstrap for the compose Postgres
├── docs/                                    # PRDs, spikes, decisions, active-work log
├── .claude/rules/                           # Path-scoped agent rules
├── public/                                  # Static assets
├── docker-compose.yml                       # Postgres + Redis + app + workers + AI service
├── pnpm-workspace.yaml, package.json, pnpm-lock.yaml
├── tsconfig.json, eslint.config.mjs, postcss.config.mjs
├── AGENTS.md                                # Cross-tool source of truth (read this first)
├── CLAUDE.md                                # Claude-specific instructions; imports AGENTS.md
├── PROJECT-STRUCTURE.md                     # This file
└── README.md                                # Setup + deployment guide

## Notes

**API layer is REST, not tRPC.** Route handlers in `app/api/**`, each
Zod-validated, session-guarded via `requireRole`/`verifySession`, and
RLS-scoped through `withClaims`. See AGENTS.md (decision 2026-07-05).

**Two directories are dead code** and are labelled above rather than removed,
so this file stays a description rather than a proposal: `components/audio/`
and the `server/routers/` + `server/root.ts` + `server/trpc.ts` tRPC tree.
Removing them (and the `@trpc/*` dependencies) is a code change worth doing
in its own commit.
