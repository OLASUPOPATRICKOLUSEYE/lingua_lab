# Backend Next Milestone Decision

Status: Decided 2026-07-06, Milestone 1 delivered 2026-07-20.

## Current state

**Milestone 1 (class-assignment completion + teacher monitoring) is done:**
class-assigned delivery, `classes`/`class_memberships`/`activity_assignments`
schema + RLS, student visibility through assignments, teacher
publish/preview/assign flow, lifecycle archive, class-level monitoring.
`submissions.assignment_id` persists which assignment a take was made
against.

**Next up is Milestone 2 — core orchestration controls (Socket.io).** See
`.claude/rules/realtime.md` for the design spec and latency targets; nothing
in that layer is built yet.

**Not tracked by this sequence, but gates any real deployment:** no CI, and
the managed Supabase/production instance has never had `db:migrate` /
`rls:apply` run against it. Don't assume either is done just because this
milestone list doesn't mention them.

## Why orchestration before phoneme-scoring refinement

Socket.io orchestration needs a stable class/assignment target boundary, or
commands have ambiguous scope. That boundary just shipped (Milestone 1), so
orchestration can build on it directly. Phoneme-scoring depth matters, but
deepening grading quality before delivery/review is fully class-aware risks
polishing analysis that then needs rework once orchestration lands. Sequence:
orchestration next, phoneme-scoring refinement after.

Constraints (submissions append-only, RLS-first, canonical storage paths,
grading_results as the mutation layer) are unchanged — see
`docs/assignment-targeting.md` and `AGENTS.md`, not repeated here.
