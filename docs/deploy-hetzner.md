# Deploying to Hetzner (Coolify)

Coolify deploys from the Git remote, so **anything not committed and pushed does
not exist as far as production is concerned.**

## Sequence

1. Commit and push to `main` (or whichever branch the Coolify app tracks).
2. Set the environment variables below in Coolify — the compose file uses
   `${VAR:?...}`, so a missing one fails the deploy loudly instead of starting a
   half-configured stack.
3. Deploy. The `migrate` service runs first, applies migrations and RLS, and
   exits; the app and workers only start if it succeeded.
4. Verify (below).

## The migrate gate

`docker-compose.prod.yml` has a one-shot `migrate` service:

```
command: pnpm db:migrate && pnpm rls:apply
```

The app, the normalization worker, and the grading worker all wait on
`service_completed_successfully`. If migrations fail, **nothing starts** — that
is the point. A stack that boots against a stale schema fails later, in
production, in a way that looks like an application bug.

`rls:apply` is separate because Drizzle does not generate RLS policies. Both
steps use `DATABASE_ADMIN_URL`; the app's `lingua_app` role is deliberately
non-BYPASSRLS and cannot alter policies.

It uses the `worker` image target, which carries the full source and dev
dependencies. The `runner` target is a trimmed Next standalone build with
neither `drizzle-kit` nor `tsx`.

## Required environment variables

| Variable | Notes |
|---|---|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Postgres container |
| `DATABASE_URL` | **Must** be the non-BYPASSRLS `lingua_app` role |
| `DATABASE_ADMIN_URL` | Migrations and RLS only — never used by app code |
| `REDIS_URL` | Queue. Without it, uploads fail |
| `RESEND_API_KEY` | Transactional mail |
| `S3_ENDPOINT` / `S3_REGION` / `S3_BUCKET` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | Object storage |
| `NORMALIZATION_WORKER_CONCURRENCY` | Normalization fan-out |
| `AI_SERVICE_URL` | **Optional.** Unset = Manual tier |

The local-filesystem storage fallback is a **dev convenience only**. Production
requires the `S3_*` block and the compose file enforces that — no replication,
no lifecycle policy, and no survival across container rebuilds otherwise.

## The AI service is opt-in

`ai-service` sits behind the `ai` Compose profile and will not build or start on
a plain deploy. Enable it only once the host is sized for it — minimum 4 vCPU /
16 GB (e.g. CCX23). A 1 GB container OOM-killed repeatedly under real load.

Leaving `AI_SERVICE_URL` unset is a supported mode, not a broken one:
submissions route to `pending_review` for teacher grading.

## Verify after deploy

1. **Migrate log** — confirm it ran and exited 0. It prints each applied
   migration and each RLS file.
2. **Teacher visibility** — log in as a teacher and open a class gradebook.
   Empty numbers where submissions exist means RLS did not apply. This is the
   exact failure the policy fix addresses: teachers could not see submissions
   for admin-authored activities assigned to their own classes.
3. **Upload round trip** — record, submit, and confirm the submission appears
   for the teacher.
4. **Queue** — check the normalization worker log for `worker started`.

## Rollback

Redeploy the previous commit in Coolify. Note that **migrations do not roll
back**: `db:migrate` only rolls forward. If a migration is wrong, write a new
migration that corrects it rather than reverting the code and expecting the
schema to follow.
