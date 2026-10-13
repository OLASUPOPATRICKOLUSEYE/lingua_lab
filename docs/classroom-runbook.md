# Classroom runbook — running LinguaLab on a local network

One command. Everything else in this file is troubleshooting.

```bash
pnpm classroom          # manual grading (teacher grades by hand)
pnpm classroom:ai       # + automatic AI grading
```

Ctrl-C stops all of it. Start it from the machine hosting the app; students
connect over Wi-Fi.

## What that command does

1. **Preflight** — refuses to start if Postgres, Redis, FFmpeg, or disk space
   are missing, and says which one. Each of those failures otherwise shows up
   later as a confusing runtime error (a dead Redis, for instance, surfaces as
   a 500 on upload, not as "Redis is down").
2. **Reissues the TLS certificate if your LAN IP changed.** The IP comes from
   DHCP; when it changes, the old certificate silently stops matching and every
   student machine looks broken. This is the single most likely thing to go
   wrong on a second day.
3. Starts the **AI service** (only with `--ai`), the **normalization** and
   **grading** workers, and the **HTTPS dev server**, then prints the student URL.

## URLs

| Who | URL |
|---|---|
| Host machine | `https://localhost:3000` |
| Students | `https://<LAN-IP>:3000` (printed at startup) |
| Students, IP-proof | `https://<hostname>.local:3000` |

Prefer the `.local` name — it survives an IP change, and it is in the certificate.

## HTTPS is not optional

Recording needs `getUserMedia`, which browsers only allow in a **secure
context**. `http://` on a LAN address is not one, so over plain HTTP students
can log in and browse but **cannot record anything**. That is why the stack runs
HTTPS locally.

Students see a certificate warning once — **Advanced → Proceed**. That is
expected: the certificate is signed by a private CA their machines do not know.
Clicking through still yields a real secure context, so recording works.

To remove the warning, copy **`rootCA.pem`** (from
`~/Library/Application Support/mkcert/`) to each machine and trust it.
Never copy `rootCA-key.pem` — anything holding it can impersonate any site to
those machines.

## Grading modes

**Manual** (`pnpm classroom`) — submissions land as `pending_review` in the
teacher's queue for hand grading. No AI service, no model downloads, nothing
extra to go wrong. Use this unless you specifically need AI.

**AI** (`pnpm classroom:ai`) — the worker calls the local AI service.
Prerequisites and limits:

- **Download the model before the session.** Whisper loads lazily on the first
  real request, so `/health` stays green right up until it stalls mid-demo.
  Warm it once with a real submission.
- `AI_TRANSCRIBE_MODEL` defaults to `small` (~500 MB). `tiny` is faster and
  noticeably worse — it mishears "grey sky" as "grace guy".
- **Pronunciation scoring is off.** The Wav2Vec2 + MFA stack needs torch, which
  is not installed. `phoneme_scores` comes back `null`, and the
  `pronunciation_score` you see is the reference-based fallback, not phoneme
  analysis.
- **VAD is not installed** — harmless here (`AI_REQUIRE_VAD=false`), but
  free-speech takes get no silence trimming.

If the AI service is unreachable, submissions fall back to `pending_review`
rather than erroring. A missing AI service is a normal operating mode, not an
incident.

## Storage

With `S3_ENDPOINT` unset, recordings are written under `uploads/` on disk
(gitignored). Fill in the `S3_*` block in `.env` and both the app and the AI
service switch to object storage with no code change.

The local mode is a **dev convenience only** — no replication, no lifecycle
policy, no durability guarantee.

## When something breaks

| Symptom | Cause |
|---|---|
| Students can't reach the URL | Different Wi-Fi, or router "client isolation" / "AP isolation" is on |
| Certificate error naming a different IP | IP changed — rerun `pnpm classroom`, it reissues |
| "Recording only works on a secure page connection" | Opened over `http://` — use the `https://` URL |
| Camera prompt never appears | Browser permission denied for the site; reset it in site settings |
| Upload fails / 500 | Redis down, or disk full (chunks stage on disk) |
| Submission stuck at `pending` | Normalization worker not running — `/tmp/lingua-worker-norm.log` |
| Never grades, sits at `pending_review` | Expected without `--ai` |
| Blank page at `https://0.0.0.0:3000` | `0.0.0.0` is a bind address, not a browsable one — use `localhost` or the LAN IP |

Logs: `/tmp/lingua-ai.log`, `/tmp/lingua-worker-norm.log`,
`/tmp/lingua-worker-grade.log`.

## Test accounts

Password for all: `LinguaTest123!`

| Email | Role |
|---|---|
| `test@gmail.com` | admin |
| `testing@gmail.com` | teacher |
| `student@example.com` | student |
| `student2@example.com` | student |

## Before the session — 10 minutes, not tomorrow morning

1. Run `pnpm classroom` and open `https://localhost:3000`.
2. From **one student machine**, do the whole loop: log in → record → submit →
   grade it from the teacher account. This is the only step that proves the
   certificate, the secure context, and the upload path all work together.
3. If using AI, run `pnpm classroom:ai` and push one submission through so the
   model is downloaded and cached.
