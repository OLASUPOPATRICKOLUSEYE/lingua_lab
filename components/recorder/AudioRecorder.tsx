"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BookOpenText,
  Loader2,
  Upload,
  CheckCircle2,
  CircleAlert,
  Mic,
  Square,
  RotateCcw,
  Video,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { WaveformVisualizer } from "@/components/recorder/WaveformVisualizer";
import {
  compressAudioBlob,
  formatDuration,
  isVideoMimeType,
  type RecorderActivityConfig,
  type RecorderSubmissionMode,
  type RecorderTake,
  type UploadTakeResult,
  type UploadProgress,
  supportedRecorderMimeType,
  uploadTakeInChunks,
} from "@/components/recorder/recorder-utils";

interface AudioRecorderProps {
  activity: RecorderActivityConfig;
  selectedTakeId: string | null;
  onSelectedTakeChange: (take: RecorderTake | null) => void;
  onUploadComplete?: (result: UploadTakeResult) => void;
  uploadEndpoint?: string;
}

export function AudioRecorder({
  activity,
  selectedTakeId,
  onSelectedTakeChange,
  onUploadComplete,
  uploadEndpoint = "/api/submissions/upload",
}: AudioRecorderProps) {
  const idleRemainingMs = activity.timeLimitSeconds * 1000;
  const preferredSubmissionMode = activity.submissionModes[0] ?? "audio";
  const audioCtxRef = useRef<AudioContext | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserNodeRef = useRef<AnalyserNode | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const stopTimeoutRef = useRef<number | null>(null);
  const selectedTakeRef = useRef<RecorderTake | null>(null);
  const takesRef = useRef<RecorderTake[]>([]);
  const liveVideoRef = useRef<HTMLVideoElement | null>(null);
  /** Last countdown value committed to React — see tickRemaining. */
  const lastShownSecondRef = useRef<number>(-1);

  const [takes, setTakes] = useState<RecorderTake[]>([]);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [status, setStatus] = useState("Tap once to get your microphone ready.");
  const [isRecording, setIsRecording] = useState(false);
  const [remainingMs, setRemainingMs] = useState(idleRemainingMs);
  const [liveAnalyserNode, setLiveAnalyserNode] = useState<AnalyserNode | null>(null);
  const [measurementOriginMs, setMeasurementOriginMs] = useState<number | null>(null);
  const [submissionMode, setSubmissionMode] = useState<RecorderSubmissionMode>(
    preferredSubmissionMode,
  );
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress>({
    phase: "idle",
    percent: 0,
    message: "Your take will appear here when it is ready to send.",
  });

  const activeSubmissionMode = activity.submissionModes.includes(submissionMode)
    ? submissionMode
    : preferredSubmissionMode;

  useEffect(() => {
    selectedTakeRef.current = takes.find((take) => take.id === selectedTakeId) ?? null;
  }, [selectedTakeId, takes]);

  useEffect(() => {
    takesRef.current = takes;
  }, [takes]);

  useEffect(() => {
    return () => {
      if (stopTimeoutRef.current !== null) window.clearTimeout(stopTimeoutRef.current);
      for (const take of takesRef.current) {
        URL.revokeObjectURL(take.objectUrl);
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      setPreviewStream(null);
      if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
        void audioCtxRef.current.close().catch(() => {});
      }
      analyserNodeRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!liveVideoRef.current) return;
    liveVideoRef.current.srcObject = previewStream;
  }, [previewStream]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden" && isRecording) {
        mediaRecorderRef.current?.stop();
        setStatus(
          "Recording paused because the app moved to the background. Come back and try again.",
        );
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [isRecording]);

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

  const unlockAudio = useCallback(async () => {
    try {
      await ensureAudioContext();
      setAudioUnlocked(true);
        setStatus(
        activeSubmissionMode === "video"
          ? "Camera and microphone are ready. Press start when you are set."
          : "Microphone is ready. Press start when you are set.",
      );
    } catch (err) {
      setStatus(`We could not prepare the recorder: ${(err as Error).message}`);
    }
  }, [activeSubmissionMode, ensureAudioContext]);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setPreviewStream(null);
    analyserNodeRef.current = null;
    setLiveAnalyserNode(null);
    setIsRecording(false);
    setMeasurementOriginMs(null);
    if (stopTimeoutRef.current !== null) {
      window.clearTimeout(stopTimeoutRef.current);
      stopTimeoutRef.current = null;
    }
    setStatus("Saving your take...");
  }, []);

  const startRecording = useCallback(async () => {
    if (!window.isSecureContext) {
      setStatus(
        "Recording only works on a secure page connection.",
      );
      return;
    }

    if (typeof navigator.mediaDevices?.getUserMedia !== "function") {
      setStatus("This browser does not support microphone recording.");
      return;
    }

    const ctx = await ensureAudioContext();

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video:
          activeSubmissionMode === "video"
            ? {
                facingMode: "user",
                width: { ideal: 1280 },
                height: { ideal: 720 },
              }
            : false,
      });
    } catch (err) {
      setStatus(
        activeSubmissionMode === "video"
          ? `Camera or microphone access failed: ${(err as Error).message}`
          : `Microphone access failed: ${(err as Error).message}`,
      );
      return;
    }

    streamRef.current = stream;
    setPreviewStream(stream);

    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    analyserNodeRef.current = analyser;
    setLiveAnalyserNode(analyser);

    const chunks: Blob[] = [];
    const preferredMimeType = supportedRecorderMimeType(activeSubmissionMode);
    const recorder = preferredMimeType
      ? new MediaRecorder(stream, { mimeType: preferredMimeType })
      : new MediaRecorder(stream);
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };

    recorder.onstop = async () => {
      const startedAt = startedAtRef.current ?? performance.now();
      const durationMs = Math.max(1, Math.round(performance.now() - startedAt));
      const blob = new Blob(chunks, {
        type: recorder.mimeType || "audio/webm",
      });
      const take: RecorderTake = {
        id: crypto.randomUUID(),
        blob,
        mimeType: blob.type,
        objectUrl: URL.createObjectURL(blob),
        durationMs,
        createdAt: Date.now(),
        compressedBlob: null,
        submissionMode: activeSubmissionMode,
      };

      setTakes((prev) => [take, ...prev]);
      onSelectedTakeChange(take);
      setUploadProgress({
        phase: "idle",
        percent: 0,
        message: "Your take is ready. Listen back or send it when you are happy.",
      });
      setStatus(
        activeSubmissionMode === "video"
          ? "Nice. Your video take is ready."
          : "Nice. Your take is ready.",
      );
      setRemainingMs(idleRemainingMs);

      // Compress NOW, in the background, while the student listens back —
      // never on the Send click. compressAudioBlob re-encodes by playing the
      // buffer through a MediaRecorder at 1x, so a 90-second take costs 90
      // seconds of wall clock. Doing that lazily on submit froze the button for
      // the length of the recording. Video skips it: the audio-only encoder
      // would throw the picture away.
      if (activeSubmissionMode !== "video" && !isVideoMimeType(take.mimeType)) {
        void compressAudioBlob(take.blob, take.mimeType)
          .then((compressed) => {
            setTakes((prev) =>
              prev.map((t) => (t.id === take.id ? { ...t, compressedBlob: compressed } : t)),
            );
            // Only refresh the parent's copy if this take is STILL the selected
            // one — the student may have re-recorded while we were encoding, and
            // silently re-selecting an older take would be worse than slow.
            if (selectedTakeRef.current?.id === take.id) {
              onSelectedTakeChange({ ...take, compressedBlob: compressed });
            }
          })
          .catch(() => {
            // Non-fatal: submit falls back to the original blob.
          });
      }
    };

    startedAtRef.current = performance.now();
    // Reset so the first tick of a new take always commits, even if the
    // previous take happened to stop on the same second.
    lastShownSecondRef.current = -1;
    setMeasurementOriginMs(startedAtRef.current);
    setIsRecording(true);
    setStatus(
      activeSubmissionMode === "video"
        ? `Recording video... you have ${activity.timeLimitSeconds} seconds.`
        : `Recording audio... you have ${activity.timeLimitSeconds} seconds.`,
    );

    recorder.start();

    const timeoutMs = activity.timeLimitSeconds * 1000;
    stopTimeoutRef.current = window.setTimeout(() => {
      setStatus("Time is up. Recording stopped.");
      stopRecording();
    }, timeoutMs);

    const tickRemaining = () => {
      if (!isRecording && mediaRecorderRef.current?.state !== "recording") return;
      const elapsed = performance.now() - (startedAtRef.current ?? performance.now());
      const remaining = Math.max(0, timeoutMs - elapsed);

      // The countdown renders as m:ss, so it only CHANGES once a second — but
      // this ran setState on every animation frame, re-rendering the recorder
      // (waveform, take list, every button) ~60x/second. That is what made taps
      // feel unresponsive while recording. Keep the rAF for an accurate clock;
      // only commit to React when the displayed value actually differs.
      const shownSecond = Math.round(remaining / 1000);
      if (shownSecond !== lastShownSecondRef.current) {
        lastShownSecondRef.current = shownSecond;
        setRemainingMs(remaining);
      }

      if (mediaRecorderRef.current?.state === "recording") {
        requestAnimationFrame(tickRemaining);
      }
    };
    requestAnimationFrame(tickRemaining);
  }, [
    activity.timeLimitSeconds,
    ensureAudioContext,
    idleRemainingMs,
    isRecording,
    onSelectedTakeChange,
    activeSubmissionMode,
    stopRecording,
  ]);

  const selectTake = useCallback(
    (take: RecorderTake) => {
      onSelectedTakeChange(take);
      setStatus(`Selected the take from ${new Date(take.createdAt).toLocaleTimeString()}.`);
    },
    [onSelectedTakeChange],
  );

  const rerecord = useCallback(() => {
    setStatus("Ready for a fresh try.");
    void startRecording();
  }, [startRecording]);

  const uploadSelectedTake = useCallback(async () => {
    const selectedTake = selectedTakeRef.current;
    if (!selectedTake) {
      setUploadProgress({
        phase: "error",
        percent: 0,
        message: "Pick a take before sending it.",
      });
      return;
    }

    try {
      // Use the background-compressed blob if it finished; otherwise send the
      // original immediately. Waiting here is what made this button hang for
      // the length of the recording — a slightly larger upload beats a student
      // staring at a dead button.
      const takeBlob = selectedTake.compressedBlob ?? selectedTake.blob;

      setUploadProgress({
        phase: "uploading",
        percent: 0,
        message: "Sending your take...",
      });

      setTakes((prev) =>
        prev.map((take) =>
          take.id === selectedTake.id
            ? {
                ...take,
                compressedBlob: isVideoMimeType(selectedTake.mimeType)
                  ? null
                  : takeBlob,
              }
            : take,
        ),
      );

      const result = await uploadTakeInChunks({
        endpoint: uploadEndpoint,
        activityId: activity.id,
        take: selectedTake,
        compressedBlob: takeBlob,
        onProgress: setUploadProgress,
      });
      onUploadComplete?.(result);
      setStatus(
        result.manualReview
          ? "Your take was sent. It is waiting for teacher review."
          : "Your take was sent. Grading is running now.",
      );
    } catch (err) {
      setUploadProgress({
        phase: "error",
        percent: uploadProgress.percent,
        message: (err as Error).message,
      });
    }
  }, [activity.id, onUploadComplete, uploadEndpoint, uploadProgress.percent]);

  return (
    <Card className="overflow-hidden rounded-xl border bg-card shadow-[0_20px_55px_-42px_rgba(0,0,0,0.28)]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {activeSubmissionMode === "video" ? <Video className="size-4" /> : <Mic className="size-4" />}
          Record your {activeSubmissionMode === "video" ? "video" : "audio"} take
        </CardTitle>
        <CardDescription>
          Read the passage, follow the teacher&apos;s reference, then send the version that feels strongest.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="rounded-xl border bg-background/60 p-3.5">
          <div className="flex items-center gap-2">
            <BookOpenText className="text-primary size-4" />
            <p className="text-sm font-medium">{activity.passageTitle}</p>
          </div>
          <p className="text-muted-foreground mt-3 text-sm leading-7">{activity.passageText}</p>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-xl border bg-background/60 p-3.5">
            <p className="text-sm font-medium">Language</p>
            <p className="text-muted-foreground text-sm">{activity.targetLanguage}</p>
          </div>
          <div className="rounded-xl border bg-background/60 p-3.5">
            <p className="text-sm font-medium">Time limit</p>
            <p className="text-muted-foreground text-sm">
              {Math.round(activity.timeLimitSeconds / 60) > 1
                ? `${Math.round(activity.timeLimitSeconds / 60)} minutes`
                : `${activity.timeLimitSeconds} seconds`}
            </p>
          </div>
          <div className="rounded-xl border bg-background/60 p-3.5">
            <p className="text-sm font-medium">Goal</p>
            <p className="text-muted-foreground text-sm leading-6">{activity.prompt}</p>
          </div>
        </div>

        {activity.submissionModes.length > 1 ? (
          <div className="flex flex-wrap gap-2">
            {activity.submissionModes.map((mode) => {
              const active = submissionMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setSubmissionMode(mode)}
                  className={`rounded-full border px-3 py-1.5 text-sm transition ${
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                  }`}
                >
                  {mode === "video" ? "Video response" : "Audio response"}
                </button>
              );
            })}
          </div>
        ) : null}

        {activeSubmissionMode === "video" ? (
          <div className="rounded-xl border bg-background/60 p-3.5">
            <p className="text-sm font-medium">Live camera preview</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Your camera feed appears here while you record.
            </p>
            <div className="mt-4 overflow-hidden rounded-lg border border-white/10 bg-black">
              <video
                ref={liveVideoRef}
                autoPlay
                muted
                playsInline
                className="aspect-video w-full object-cover"
              />
            </div>
          </div>
        ) : null}

        <WaveformVisualizer
          title="Your live voice"
          subtitle={
            activeSubmissionMode === "video"
              ? "Your spoken audio is still what the grading pipeline listens to"
              : "Watch your voice move while you speak"
          }
          analyserNode={liveAnalyserNode}
          isActive={isRecording}
          measurementOriginMs={measurementOriginMs}
          onFirstRender={() => {
            setStatus("We can hear you. Keep going.");
          }}
          onFirstSignal={() => {}}
        />

        <div className="flex flex-wrap gap-3">
          <Button type="button" onClick={unlockAudio} disabled={audioUnlocked}>
            {audioUnlocked ? <CheckCircle2 /> : activeSubmissionMode === "video" ? <Video /> : <Mic />}
            {audioUnlocked
              ? activeSubmissionMode === "video"
                ? "Camera ready"
                : "Microphone ready"
              : activeSubmissionMode === "video"
                ? "Prepare camera"
                : "Prepare microphone"}
          </Button>
          <Button type="button" onClick={startRecording} disabled={!audioUnlocked || isRecording}>
            {activeSubmissionMode === "video" ? <Video /> : <Mic />}
            Start
          </Button>
          <Button type="button" variant="secondary" onClick={stopRecording} disabled={!isRecording}>
            <Square />
            Stop
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={rerecord}
            disabled={!audioUnlocked || isRecording}
          >
            <RotateCcw />
            Try again
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={uploadSelectedTake}
            disabled={!selectedTakeId || isRecording}
          >
            {uploadProgress.phase === "compressing" || uploadProgress.phase === "uploading" ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Upload />
            )}
            Send this take
          </Button>
        </div>

        <div className="rounded-xl border bg-background/60 p-3.5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Recorder status</p>
              <p className="text-muted-foreground text-sm leading-6">{status}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium">Time remaining</p>
              <p className="text-muted-foreground text-sm">
                {formatDuration(isRecording ? remainingMs : idleRemainingMs)}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-background/60 p-3.5">
          <div className="mb-3 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Send progress</p>
              <p className="text-muted-foreground text-sm">{uploadProgress.message}</p>
            </div>
            <span className="text-sm font-medium">{Math.round(uploadProgress.percent)}%</span>
          </div>
          <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
            <div
              className="bg-primary h-full transition-[width]"
              style={{ width: `${uploadProgress.percent}%` }}
            />
          </div>
          {uploadProgress.phase === "error" && (
            <p className="text-destructive mt-3 flex items-center gap-2 text-sm">
              <CircleAlert className="size-4" />
              {uploadProgress.message}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <div>
            <p className="text-sm font-medium">Takes</p>
            <p className="text-muted-foreground text-sm">
              You can retry as many times as you want. Only the selected take gets sent.
            </p>
          </div>
          {takes.length === 0 ? (
            <div className="text-muted-foreground rounded-xl border border-dashed p-3.5 text-sm">
              No takes yet. Prepare the microphone and make your first try.
            </div>
          ) : (
            <div className="grid gap-3">
              {takes.map((take, index) => {
                const isSelected = take.id === selectedTakeId;
                return (
                  <button
                    key={take.id}
                    type="button"
                    onClick={() => selectTake(take)}
                    className={`rounded-xl border p-3.5 text-left transition ${
                      isSelected
                        ? "border-primary bg-primary/8"
                        : "hover:bg-muted/60"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium">Take {takes.length - index}</p>
                        <p className="text-muted-foreground text-sm">
                          {formatDuration(take.durationMs)} · {take.submissionMode} · {take.mimeType || "media blob"}
                        </p>
                      </div>
                      <div className="text-right text-sm">
                        <p>{Math.round(take.blob.size / 1024)} KB</p>
                        <p className="text-muted-foreground">
                          {new Date(take.createdAt).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
