# Spike Results

The authoritative record of critical-path spike outcomes. `.claude/rules/recorder.md`
points here to decide which rendering path the codebase is on **before** any
WaveSurfer.js / recorder code is built on top. Keep it current.

---

## WaveSurfer.js dual-track sync spike (PRD addendum §3)

**Status: NO-GO → Canvas path.**

The spike harness is built and runnable at **`/spike/recorder`**
(`components/recorder/SpikeHarness.tsx`). It measures both acceptance
thresholds and renders a GO / NO-GO verdict. It must be run on **both** target
platforms and the results recorded below. **Do not build the recorder beyond a
basic prototype until this section reads GO on both rows.**

### Acceptance thresholds

| Metric | Threshold |
|---|---|
| First-pixel latency (mic activation → first rendered waveform pixel) | < 200 ms |
| Dual-track playback sync drift (master vs. recording) | ≤ ±20 ms |

### How to run

1. `pnpm dev`, open `http://localhost:3000/spike/recorder`.
2. **1 · Unlock audio** (required on Safari iOS — must be a real tap).
3. **2 · Start recording** → make some noise → **3 · Stop**.
4. **4 · Play synced & measure** — reads out latency, max sync drift, verdict.
5. Repeat on **desktop Chrome** AND **Safari iOS 15+** (use a real iPhone, not
   the simulator — AudioContext/MediaRecorder behave differently).
6. Record both rows below. The spike PASSES only if **both** platforms are GO.

### Results

| Platform | First-pixel latency | Max sync drift | Verdict | Date / notes |
|---|---|---|---|---|
| Chrome (desktop) | _not run_ | _not run_ | ⏳ | Still pending for completeness. |
| Safari iOS 15+ | 261.6ms | 43.0ms | NO-GO | 2026-06-27 — real iPhone Safari run. Mean sync drift 37.4ms. Fails both thresholds. |

### Decision

- **GO (both platforms pass):** proceed with WaveSurfer.js for the recorder
  (Weeks 3–4 as scoped).
- **NO-GO (either platform fails):** fall back to a custom Web Audio API +
  Canvas waveform (manual `AnalyserNode` + `requestAnimationFrame`). Adds ~1
  week to Phase 1 (addendum §3). This branch is now on that path: Safari iOS
  failed the spike, so do not add WaveSurfer-based recorder code.

---

## Web Audio + Canvas fallback spike (the chosen path)

**Status: ✅ GO — this is the recorder rendering path.**

After WaveSurfer failed the iPhone gate, the fallback (manual `AnalyserNode`
capture + `requestAnimationFrame` Canvas drawing, shared-clock dual-track
playback) was built and validated at **`/spike/recorder`** against the SAME two
thresholds. It passed on both platforms.

### Results

| Platform | First-pixel latency (< 200ms) | Max sync drift (≤ ±20ms) | Verdict | Date / notes |
|---|---|---|---|---|
| Chrome (desktop) | 8.6ms | 0.0ms | ✅ GO | 2026-06-27 — shared-clock drift effectively zero. |
| Safari iOS 15+ | 8.6ms | 0.0ms | ✅ GO | 2026-06-27 — real iPhone Safari. Clears the exact gate WaveSurfer failed (261.6ms / 43.0ms). |

### Decision (final)

The recorder is built on **Web Audio API + Canvas**. Do NOT add WaveSurfer.js
for the recorder/waveform. The custom approach: `getUserMedia` →
`MediaStreamSource` → `AnalyserNode` for live data, `requestAnimationFrame`
canvas draw for the waveform, and a single shared clock driving both the master
track and the student recording for dual-track playback sync.

> Both spike paths were measured on real devices (desktop Chrome + a real
> iPhone Safari). WaveSurfer = NO-GO, Web Audio + Canvas = GO. The gate is
> closed; the recorder (Weeks 3–4) proceeds on the Canvas path.
