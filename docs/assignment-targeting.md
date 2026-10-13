# Assignment Targeting — Backend Direction

Status: **Decided and implemented** (2026-07-06). Kept short — the schema
(`classes`, `class_memberships`, `activity_assignments`) is the source of
truth for fields/constraints now, not this doc. What's still worth recording
here is the *why*, since it isn't self-evident from the code.

## Decision

Class-assigned missions first (`activity → class assignment`), with
student-specific override as a later, additive layer — not a replacement.

**Why not school-wide visibility as the long-term model:** it breaks the real
classroom workflow — teachers can't control who owes a mission, students see
irrelevant work outside their class, and completion tracking gets noisy when
publication and assignment are the same action.

**Transitional fallback:** if a school has no class assignments yet, the app
falls back to school-wide activities so the product doesn't go blank
mid-migration. Still true — check `utils/student/assignment-data.ts` before
removing it.

## Policy rules not enforced by code (working norms, not constraints)

- **Editing after assignment:** small copy/coaching-note edits may update the
  existing activity. A materially different passage should become a *new*
  activity + assignment, not an edit — keeps existing submissions honestly
  tied to what the student actually read.
- **Archiving:** removes an assignment from student visibility, never deletes
  prior submissions, never mutates append-only `submissions` rows.

## Constraints that stay fixed regardless of future changes here

- submissions remain append-only
- canonical storage path discipline stays unchanged
- every school-scoped table gets RLS and an application-path test
- frontend polish must not silently redefine backend lifecycle or ownership rules
