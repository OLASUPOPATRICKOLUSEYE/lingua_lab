"use client";

/**
 * Web Audio + Canvas fallback spike (PRD addendum §3, recorder no-go fallback).
 *
 * WaveSurfer failed the iPhone spike, so this harness validates the fallback
 * path directly:
 *   1. Mic→first rendered waveform latency — stream-active → first Canvas draw
 *      of the live analyser data. Threshold: < 200 ms.
 *   2. Dual-track playback sync — master + student playback are driven from a
 *      single shared AudioContext clock. The measured drift is the absolute
 *      difference between the two playheads under that shared schedule.
 *
 * This is intentionally simple and explicit: MediaRecorder captures the take,
 * AnalyserNode drives live waveform drawing, and Canvas renders both live and
 * static tracks without any third-party waveform layer in the middle.
 */

import { useCallback, useEffect, useRef, useState } from "react";

const LATENCY_THRESHOLD_MS = 200;
const SYNC_THRESHOLD_MS = 20;
const MASTER_SECONDS = 4;
const SYNC_SAMPLES = 60;
const SILENCE_RMS = 0.01;

type Phase = "idle" | "recording" | "recorded" | "syncing" | "done";

interface Measurement {
  latencyMs: number | null;
  signalLatencyMs: number | null;
  maxSyncDriftMs: number | null;
  meanSyncDriftMs: number | null;
}

const CONTROL_BUTTON_CLASSNAME =
  "bg-primary text-primary-foreground min-h-11 touch-manipulation rounded-md px-4 py-2 text-sm font-medium disabled:pointer-events-none disabled:opacity-50";

const SECONDARY_BUTTON_CLASSNAME =
  "bg-secondary text-secondary-foreground min-h-11 touch-manipulation rounded-md px-4 py-2 text-sm font-medium disabled:pointer-events-none disabled:opacity-50";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function rms(buf: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += (buf[i] ?? 0) ** 2;
  return Math.sqrt(sum / buf.length);
}

function mixToMono(buffer: AudioBuffer): Float32Array {
  const mono = new Float32Array(buffer.length);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const source = buffer.getChannelData(channel);
    for (let i = 0; i < buffer.length; i++) {
      mono[i] = (mono[i] ?? 0) + (source[i] ?? 0) / buffer.numberOfChannels;
    }
  }
  return mono;
}

function clearCanvas(canvas: HTMLCanvasElement | null): void {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function drawWaveformFromSamples(
  canvas: HTMLCanvasElement | null,
  samples: Float32Array,
  color: string,
): void {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "rgba(148, 163, 184, 0.12)";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();

  const step = Math.max(1, Math.floor(samples.length / width));
  const midY = height / 2;
  const amp = height * 0.4;

  for (let x = 0; x < width; x++) {
    const idx = Math.min(samples.length - 1, x * step);
    const y = midY + (samples[idx] ?? 0) * amp;
    if (x === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }

  ctx.stroke();
}

function drawWaveformFromBuffer(
  canvas: HTMLCanvasElement | null,
  buffer: AudioBuffer,
  color: string,
): void {
  drawWaveformFromSamples(canvas, mixToMono(buffer), color);
}

function setPlayhead(playhead: HTMLDivElement | null, ratio: number): void {
  if (!playhead) return;
  playhead.style.left = `${clamp(ratio, 0, 1) * 100}%`;
}

async function synthesizeMasterBuffer(): Promise<AudioBuffer> {
  const sampleRate = 44100;
  const length = sampleRate * MASTER_SECONDS;
  const ctx = new OfflineAudioContext(1, length, sampleRate);

  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.value = 440;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, 0);
  gain.gain.linearRampToValueAtTime(0.25, 0.04);
  gain.gain.linearRampToValueAtTime(0.18, 0.2);
  gain.gain.setValueAtTime(0.18, MASTER_SECONDS - 0.3);
  gain.gain.linearRampToValueAtTime(0, MASTER_SECONDS);

  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(MASTER_SECONDS);

  return ctx.startRendering();
}

export function SpikeHarness() {
  const liveCanvasRef = useRef<HTMLCanvasElement>(null);
  const masterCanvasRef = useRef<HTMLCanvasElement>(null);
  const studentCanvasRef = useRef<HTMLCanvasElement>(null);
  const masterPlayheadRef = useRef<HTMLDivElement>(null);
  const studentPlayheadRef = useRef<HTMLDivElement>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const liveRafRef = useRef<number | null>(null);
  const syncRafRef = useRef<number | null>(null);
  const masterSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const studentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const masterBufferRef = useRef<AudioBuffer | null>(null);
  const studentBufferRef = useRef<AudioBuffer | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState("");
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [m, setM] = useState<Measurement>({
    latencyMs: null,
    signalLatencyMs: null,
    maxSyncDriftMs: null,
    meanSyncDriftMs: null,
  });

  const phaseRef = useRef<Phase>("idle");
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    return () => {
      if (liveRafRef.current !== null) cancelAnimationFrame(liveRafRef.current);
      if (syncRafRef.current !== null) cancelAnimationFrame(syncRafRef.current);
      masterSourceRef.current?.stop();
      studentSourceRef.current?.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
        void audioCtxRef.current.close().catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden" && phaseRef.current === "recording") {
        mediaRecorderRef.current?.stop();
        setStatus(
          "⚠️ Tab backgrounded mid-recording — Safari iOS suspends audio. Stopped to avoid silent failure.",
        );
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const environmentWarning =
    typeof window === "undefined"
      ? null
      : !window.isSecureContext
        ? "This page is not in a secure context. On iPhone Safari, microphone access only works on HTTPS or on localhost running directly on the phone. A plain LAN URL like http://192.168.x.x:3000 will not record."
        : typeof navigator === "undefined" ||
            typeof navigator.mediaDevices?.getUserMedia !== "function" ||
            typeof MediaRecorder === "undefined"
          ? "This browser is missing required media APIs for the fallback recorder spike."
          : null;

  const ensureAudioContext = useCallback(async () => {
    const existing = audioCtxRef.current;
    if (existing) {
      if (existing.state === "suspended") await existing.resume();
      return existing;
    }

    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    if (ctx.state === "suspended") await ctx.resume();
    audioCtxRef.current = ctx;
    return ctx;
  }, []);

  const ensureMasterBuffer = useCallback(async () => {
    if (masterBufferRef.current) return masterBufferRef.current;
    const buffer = await synthesizeMasterBuffer();
    masterBufferRef.current = buffer;
    drawWaveformFromBuffer(masterCanvasRef.current, buffer, "#475569");
    return buffer;
  }, []);

  const unlockAudio = useCallback(async () => {
    try {
      const ctx = await ensureAudioContext();
      await ensureMasterBuffer();
      setAudioUnlocked(true);
      setStatus(`AudioContext unlocked (state: ${ctx.state}).`);
    } catch (err) {
      setStatus(`AudioContext unlock failed: ${(err as Error).message}`);
    }
  }, [ensureAudioContext, ensureMasterBuffer]);

  const prepareRecordedAudio = useCallback(
    async (blob: Blob) => {
      const ctx = await ensureAudioContext();
      const master = await ensureMasterBuffer();
      const arrayBuffer = await blob.arrayBuffer();
      const recorded = await ctx.decodeAudioData(arrayBuffer.slice(0));

      studentBufferRef.current = recorded;
      drawWaveformFromBuffer(masterCanvasRef.current, master, "#475569");
      drawWaveformFromBuffer(studentCanvasRef.current, recorded, "#4338ca");
      setPlayhead(masterPlayheadRef.current, 0);
      setPlayhead(studentPlayheadRef.current, 0);

      phaseRef.current = "recorded";
      setPhase("recorded");
      setStatus("Ready. Press “Play synced & measure”.");
    },
    [ensureAudioContext, ensureMasterBuffer],
  );

  const startRecording = useCallback(async () => {
    if (!window.isSecureContext) {
      setStatus(
        "Microphone recording is blocked because this page is not running in a secure context. On iPhone Safari, use HTTPS rather than a plain LAN http:// URL.",
      );
      return;
    }

    if (typeof navigator.mediaDevices?.getUserMedia !== "function") {
      setStatus("This browser does not expose getUserMedia for microphone capture.");
      return;
    }

    const ctx = await ensureAudioContext();
    await ensureMasterBuffer();

    clearCanvas(liveCanvasRef.current);
    clearCanvas(studentCanvasRef.current);
    setPlayhead(masterPlayheadRef.current, 0);
    setPlayhead(studentPlayheadRef.current, 0);
    studentBufferRef.current = null;
    setM({
      latencyMs: null,
      signalLatencyMs: null,
      maxSyncDriftMs: null,
      meanSyncDriftMs: null,
    });

    setStatus("Requesting microphone… (prompt time is NOT counted)");
    let stream: MediaStream;

    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      setStatus(`Microphone access failed: ${(err as Error).message}`);
      return;
    }

    streamRef.current = stream;
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);

    const recorder = new MediaRecorder(stream);
    mediaRecorderRef.current = recorder;

    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      const blob = new Blob(chunks, {
        type: recorder.mimeType || "audio/webm",
      });
      void prepareRecordedAudio(blob);
    };

    const frameBuf = new Float32Array(analyser.fftSize);
    const t0 = performance.now();
    let renderCaptured = false;
    let signalCaptured = false;

    phaseRef.current = "recording";
    setPhase("recording");
    setStatus("Recording… make noise for ~3s, then Stop.");

    const drawLiveWaveform = () => {
      if (phaseRef.current !== "recording") return;

      analyser.getFloatTimeDomainData(frameBuf);
      drawWaveformFromSamples(liveCanvasRef.current, frameBuf, "#4338ca");

      if (!renderCaptured) {
        renderCaptured = true;
        const latency = performance.now() - t0;
        setM((prev) => ({ ...prev, latencyMs: latency }));
        setStatus(`Canvas first rendered at ${latency.toFixed(1)}ms. Keep going, then Stop.`);
      }

      if (!signalCaptured && rms(frameBuf) >= SILENCE_RMS) {
        signalCaptured = true;
        const latency = performance.now() - t0;
        setM((prev) => ({ ...prev, signalLatencyMs: latency }));
        setStatus((current) =>
          current.includes("Canvas first rendered")
            ? `${current} Signal detected at ${latency.toFixed(1)}ms.`
            : `Signal detected at ${latency.toFixed(1)}ms.`,
        );
      }

      liveRafRef.current = requestAnimationFrame(drawLiveWaveform);
    };

    recorder.start();
    liveRafRef.current = requestAnimationFrame(drawLiveWaveform);
  }, [ensureAudioContext, ensureMasterBuffer, prepareRecordedAudio]);

  const stopRecording = useCallback(() => {
    if (liveRafRef.current !== null) {
      cancelAnimationFrame(liveRafRef.current);
      liveRafRef.current = null;
    }

    mediaRecorderRef.current?.stop();
    phaseRef.current = "recorded";
    setPhase("recorded");
    setStatus("Recorded. Decoding audio and drawing static waveforms…");
  }, []);

  const measureSync = useCallback(async () => {
    const ctx = await ensureAudioContext();
    const masterBuffer = await ensureMasterBuffer();
    const studentBuffer = studentBufferRef.current;

    if (!studentBuffer) {
      setStatus("Record a take first.");
      return;
    }

    masterSourceRef.current?.stop();
    studentSourceRef.current?.stop();

    const masterSource = ctx.createBufferSource();
    const studentSource = ctx.createBufferSource();
    const masterGain = ctx.createGain();
    const studentGain = ctx.createGain();

    masterSource.buffer = masterBuffer;
    studentSource.buffer = studentBuffer;
    masterGain.gain.value = 0.2;
    studentGain.gain.value = 0.8;

    masterSource.connect(masterGain).connect(ctx.destination);
    studentSource.connect(studentGain).connect(ctx.destination);

    masterSourceRef.current = masterSource;
    studentSourceRef.current = studentSource;

    const startAt = ctx.currentTime + 0.1;
    const masterDuration = masterBuffer.duration;
    const studentDuration = studentBuffer.duration;
    const sampleWindow = Math.min(masterDuration, studentDuration);
    const drifts: number[] = [];

    phaseRef.current = "syncing";
    setPhase("syncing");
    setStatus("Measuring shared-clock sync drift…");

    masterSource.start(startAt);
    studentSource.start(startAt);

    const tick = () => {
      const now = ctx.currentTime;
      const relative = Math.max(0, now - startAt);
      const masterTime = clamp(relative, 0, masterDuration);
      const studentTime = clamp(relative, 0, studentDuration);

      setPlayhead(masterPlayheadRef.current, masterTime / masterDuration);
      setPlayhead(studentPlayheadRef.current, studentTime / studentDuration);

      if (relative <= sampleWindow) {
        drifts.push(Math.abs(masterTime - studentTime) * 1000);
      }

      if (drifts.length >= SYNC_SAMPLES || relative >= sampleWindow) {
        const max = drifts.length > 0 ? Math.max(...drifts) : 0;
        const mean =
          drifts.length > 0 ? drifts.reduce((sum, drift) => sum + drift, 0) / drifts.length : 0;

        setM((prev) => ({
          ...prev,
          maxSyncDriftMs: max,
          meanSyncDriftMs: mean,
        }));
        phaseRef.current = "done";
        setPhase("done");
        setStatus("Done. See the verdict panel below.");
        return;
      }

      syncRafRef.current = requestAnimationFrame(tick);
    };

    syncRafRef.current = requestAnimationFrame(tick);
  }, [ensureAudioContext, ensureMasterBuffer]);

  const latencyPass = m.latencyMs !== null && m.latencyMs < LATENCY_THRESHOLD_MS;
  const syncPass = m.maxSyncDriftMs !== null && m.maxSyncDriftMs <= SYNC_THRESHOLD_MS;
  const verdict =
    m.latencyMs !== null && m.maxSyncDriftMs !== null
      ? latencyPass && syncPass
        ? "GO"
        : "NO-GO"
      : null;

  return (
    <div className="flex flex-col gap-6">
      <ol className="text-muted-foreground flex flex-wrap gap-3 text-sm">
        <li>1. Unlock audio</li>
        <li>2. Record with MediaRecorder</li>
        <li>3. Stop and render static waveforms</li>
        <li>4. Play both tracks on one shared AudioContext clock</li>
      </ol>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={unlockAudio}
          disabled={audioUnlocked}
          className={CONTROL_BUTTON_CLASSNAME}
        >
          1 · Unlock audio
        </button>
        <button
          type="button"
          onClick={startRecording}
          disabled={!audioUnlocked || phase === "recording"}
          className={CONTROL_BUTTON_CLASSNAME}
        >
          2 · Start recording
        </button>
        <button
          type="button"
          onClick={stopRecording}
          disabled={phase !== "recording"}
          className={SECONDARY_BUTTON_CLASSNAME}
        >
          3 · Stop
        </button>
        <button
          type="button"
          onClick={measureSync}
          disabled={phase !== "recorded"}
          className={CONTROL_BUTTON_CLASSNAME}
        >
          4 · Play synced &amp; measure
        </button>
      </div>

      {environmentWarning && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-950 dark:text-amber-100">
          {environmentWarning}
        </div>
      )}

      <p className="text-sm" aria-live="polite">
        {status || "Idle."}
      </p>

      <div className="flex flex-col gap-4">
        <WaveformPanel
          title="Live mic waveform"
          subtitle="Canvas drawn directly from AnalyserNode frames"
          canvasRef={liveCanvasRef}
        />
        <WaveformPanel
          title="Master track"
          subtitle="Synthetic fallback reference track"
          canvasRef={masterCanvasRef}
          playheadRef={masterPlayheadRef}
        />
        <WaveformPanel
          title="Student recording"
          subtitle="Decoded recorded take rendered to Canvas"
          canvasRef={studentCanvasRef}
          playheadRef={studentPlayheadRef}
        />
      </div>

      <ResultsPanel
        latencyMs={m.latencyMs}
        signalLatencyMs={m.signalLatencyMs}
        latencyPass={latencyPass}
        maxSyncMs={m.maxSyncDriftMs}
        meanSyncMs={m.meanSyncDriftMs}
        syncPass={syncPass}
        verdict={verdict}
      />
    </div>
  );
}

function WaveformPanel({
  title,
  subtitle,
  canvasRef,
  playheadRef,
}: {
  title: string;
  subtitle: string;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  playheadRef?: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div>
      <p className="text-muted-foreground mb-1 text-xs font-medium uppercase">{title}</p>
      <p className="text-muted-foreground mb-2 text-xs">{subtitle}</p>
      <div className="bg-muted/40 relative overflow-hidden rounded-md border">
        <canvas ref={canvasRef} width={900} height={96} className="block h-24 w-full" />
        {playheadRef && (
          <div
            ref={playheadRef}
            className="bg-primary/70 absolute top-0 left-0 h-full w-px -translate-x-1/2"
          />
        )}
      </div>
    </div>
  );
}

function ResultsPanel({
  latencyMs,
  signalLatencyMs,
  latencyPass,
  maxSyncMs,
  meanSyncMs,
  syncPass,
  verdict,
}: {
  latencyMs: number | null;
  signalLatencyMs: number | null;
  latencyPass: boolean;
  maxSyncMs: number | null;
  meanSyncMs: number | null;
  syncPass: boolean;
  verdict: "GO" | "NO-GO" | null;
}) {
  return (
    <div className="rounded-lg border p-4">
      <h2 className="mb-3 font-semibold">Measurements</h2>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <dt>Mic→first Canvas waveform render (&lt; {LATENCY_THRESHOLD_MS}ms)</dt>
        <dd
          className={
            latencyMs === null ? "" : latencyPass ? "text-green-600" : "text-destructive"
          }
        >
          {latencyMs === null ? "—" : `${latencyMs.toFixed(1)}ms ${latencyPass ? "PASS" : "FAIL"}`}
        </dd>
        <dt className="text-muted-foreground">First detected signal (context)</dt>
        <dd className="text-muted-foreground">
          {signalLatencyMs === null ? "—" : `${signalLatencyMs.toFixed(1)}ms`}
        </dd>
        <dt>Shared-clock max sync drift (≤ {SYNC_THRESHOLD_MS}ms)</dt>
        <dd
          className={
            maxSyncMs === null ? "" : syncPass ? "text-green-600" : "text-destructive"
          }
        >
          {maxSyncMs === null ? "—" : `${maxSyncMs.toFixed(1)}ms ${syncPass ? "PASS" : "FAIL"}`}
        </dd>
        <dt className="text-muted-foreground">Mean sync drift (context)</dt>
        <dd className="text-muted-foreground">
          {meanSyncMs === null ? "—" : `${meanSyncMs.toFixed(1)}ms`}
        </dd>
      </dl>
      {verdict && (
        <p className="mt-4 text-lg font-bold">
          Verdict:{" "}
          <span className={verdict === "GO" ? "text-green-600" : "text-destructive"}>
            {verdict}
          </span>
        </p>
      )}
      <p className="text-muted-foreground mt-3 text-xs">
        This fallback spike validates the custom Web Audio + Canvas path now that
        WaveSurfer has already been rejected in `docs/spike-results.md`.
      </p>
    </div>
  );
}
