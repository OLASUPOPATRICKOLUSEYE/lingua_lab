"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { WaveformVisualizer } from "@/components/recorder/WaveformVisualizer";
import { MouthComparison } from "@/components/recorder/MouthComparison";
import {
  clamp,
  formatDuration,
  isVideoMimeType,
  synthesizeMasterBuffer,
  type RecorderTake,
} from "@/components/recorder/recorder-utils";

interface DualTrackPlayerProps {
  selectedTake: RecorderTake | null;
  referenceText: string;
  referenceAudioUrl?: string | null;
  referenceVideoUrl?: string | null;
}

function estimateSpeechDurationMs(text: string): number {
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  const estimatedWordsPerMinute = 130;
  const minutes = wordCount / estimatedWordsPerMinute;
  return Math.max(2500, minutes * 60_000);
}

export function DualTrackPlayer({
  selectedTake,
  referenceText,
  referenceAudioUrl,
  referenceVideoUrl,
}: DualTrackPlayerProps) {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const masterBufferRef = useRef<AudioBuffer | null>(null);
  const studentBufferRef = useRef<AudioBuffer | null>(null);
  const masterSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const studentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const syncRafRef = useRef<number | null>(null);
  const referenceSpeechActiveRef = useRef(false);
  const referenceAudioRef = useRef<HTMLAudioElement | null>(null);

  const [status, setStatus] = useState("Choose a take first, then listen back here.");
  const [isPreparing, setIsPreparing] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [masterBuffer, setMasterBuffer] = useState<AudioBuffer | null>(null);
  const [studentBuffer, setStudentBuffer] = useState<AudioBuffer | null>(null);
  const [masterPlayheadRatio, setMasterPlayheadRatio] = useState<number | null>(0);
  const [studentPlayheadRatio, setStudentPlayheadRatio] = useState<number | null>(0);
  const selectedTakeIsVideo = selectedTake ? isVideoMimeType(selectedTake.mimeType) : false;

  useEffect(() => {
    return () => {
      if (syncRafRef.current !== null) cancelAnimationFrame(syncRafRef.current);
      masterSourceRef.current?.stop();
      studentSourceRef.current?.stop();
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      referenceAudioRef.current?.pause();
      referenceAudioRef.current = null;
      if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
        void audioCtxRef.current.close().catch(() => {});
      }
    };
  }, []);

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

  const prepareBuffers = useCallback(async () => {
    if (!selectedTake) {
      setStudentBuffer(null);
      setStatus("Choose a take first, then listen back here.");
      return;
    }

    setIsPreparing(true);

    try {
      const ctx = await ensureAudioContext();

      if (!masterBufferRef.current || referenceAudioUrl) {
        if (referenceAudioUrl) {
          const response = await fetch(referenceAudioUrl, { cache: "no-store" });
          if (!response.ok) {
            throw new Error("Could not load the teacher reference audio.");
          }
          const masterArrayBuffer = await response.arrayBuffer();
          masterBufferRef.current = await ctx.decodeAudioData(masterArrayBuffer.slice(0));
        } else {
          masterBufferRef.current = await synthesizeMasterBuffer();
        }
      }

      setMasterBuffer(masterBufferRef.current);
      setMasterPlayheadRatio(0);
      setStudentPlayheadRatio(0);
      if (isVideoMimeType(selectedTake.mimeType)) {
        studentBufferRef.current = null;
        setStudentBuffer(null);
        setStatus("Video take ready. Use the reference voice and preview your video below.");
      } else {
        const studentArrayBuffer = await selectedTake.blob.arrayBuffer();
        const decodedStudent = await ctx.decodeAudioData(studentArrayBuffer.slice(0));
        studentBufferRef.current = decodedStudent;
        setStudentBuffer(decodedStudent);
        setStatus("Ready to play your take next to the reference.");
      }
    } catch (err) {
      setStatus(`Could not prepare playback: ${(err as Error).message}`);
    } finally {
      setIsPreparing(false);
    }
  }, [ensureAudioContext, referenceAudioUrl, selectedTake]);

  useEffect(() => {
    queueMicrotask(() => {
      void prepareBuffers();
    });
  }, [prepareBuffers]);

  const stopPlayback = useCallback(() => {
    if (syncRafRef.current !== null) {
      cancelAnimationFrame(syncRafRef.current);
      syncRafRef.current = null;
    }
    masterSourceRef.current?.stop();
    studentSourceRef.current?.stop();
    masterSourceRef.current = null;
    studentSourceRef.current = null;
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    referenceAudioRef.current?.pause();
    if (referenceAudioRef.current) {
      referenceAudioRef.current.currentTime = 0;
    }
    referenceSpeechActiveRef.current = false;
    setIsPlaying(false);
    setStatus("Playback stopped.");
  }, []);

  const startPlayback = useCallback(async () => {
    if (
      !selectedTake ||
      !masterBufferRef.current ||
      (!studentBufferRef.current && !isVideoMimeType(selectedTake.mimeType))
    ) {
      setStatus("Pick a take first.");
      return;
    }

    const ctx = await ensureAudioContext();
    stopPlayback();

    const studentSource = isVideoMimeType(selectedTake.mimeType)
      ? null
      : ctx.createBufferSource();
    const studentGain = ctx.createGain();
    const speechSupported =
      !referenceAudioUrl &&
      typeof window !== "undefined" &&
      "speechSynthesis" in window &&
      typeof SpeechSynthesisUtterance !== "undefined" &&
      referenceText.trim().length > 0;

    if (studentSource && studentBufferRef.current) {
      studentSource.buffer = studentBufferRef.current;
      studentGain.gain.value = 0.8;
      studentSource.connect(studentGain).connect(ctx.destination);
    }

    studentSourceRef.current = studentSource;

    const startAt = ctx.currentTime + 0.1;
    const masterDuration = speechSupported
      ? estimateSpeechDurationMs(referenceText) / 1000
      : masterBufferRef.current.duration;
    const studentDuration = studentBufferRef.current?.duration ?? masterDuration;
    const playbackWindow = Math.max(masterDuration, studentDuration);

    if (studentSource) {
      studentSource.start(startAt);
    }

    if (!speechSupported) {
      const masterSource = ctx.createBufferSource();
      const masterGain = ctx.createGain();
      masterSource.buffer = masterBufferRef.current;
      masterGain.gain.value = 0.6;
      masterSource.connect(masterGain).connect(ctx.destination);
      masterSourceRef.current = masterSource;
      masterSource.start(startAt);
    } else {
      const utterance = new SpeechSynthesisUtterance(referenceText);
      utterance.rate = 0.92;
      utterance.pitch = 1;
      utterance.volume = 1;
      referenceSpeechActiveRef.current = true;
      utterance.onstart = () => {
        setStatus("Playing reference voice with your take.");
      };
      utterance.onend = () => {
        referenceSpeechActiveRef.current = false;
      };
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    }

    setIsPlaying(true);
    setStatus(
      selectedTakeIsVideo
        ? referenceAudioUrl
          ? "Playing the teacher recording. Preview the recorded video below."
          : "Playing the reference voice. Preview the recorded video below."
        : speechSupported
          ? "Playing reference voice with your take."
          : referenceAudioUrl
            ? "Playing the teacher recording with your take."
            : "Playing your take with the reference.",
    );

    const tick = () => {
      const now = ctx.currentTime;
      const relative = Math.max(0, now - startAt);

      setMasterPlayheadRatio(clamp(relative / masterDuration, 0, 1));
      setStudentPlayheadRatio(clamp(relative / studentDuration, 0, 1));

      if (
        relative >= playbackWindow &&
        !referenceSpeechActiveRef.current
      ) {
        setIsPlaying(false);
        setStatus("Finished playing.");
        return;
      }

      syncRafRef.current = requestAnimationFrame(tick);
    };

    syncRafRef.current = requestAnimationFrame(tick);
  }, [
    ensureAudioContext,
    referenceAudioUrl,
    referenceText,
    selectedTake,
    selectedTakeIsVideo,
    stopPlayback,
  ]);

  return (
    <Card className="overflow-hidden rounded-xl border bg-card shadow-[0_20px_55px_-42px_rgba(0,0,0,0.28)]">
      <CardHeader>
        <CardTitle>Listen and compare</CardTitle>
        <CardDescription>
          Hear the reference and your take together so rhythm, pacing, and timing are easier to notice.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-wrap gap-3">
          <Button type="button" onClick={startPlayback} disabled={!selectedTake || isPreparing}>
            {isPreparing ? <Loader2 className="animate-spin" /> : <Play />}
            {selectedTakeIsVideo ? "Play reference" : "Play together"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (referenceAudioUrl) {
                stopPlayback();
                const nextAudio = new Audio(referenceAudioUrl);
                nextAudio.currentTime = 0;
                nextAudio.onplay = () => {
                  setIsPlaying(true);
                  setStatus("Playing the teacher recording.");
                };
                nextAudio.onended = () => {
                  setIsPlaying(false);
                  setStatus("Finished playing the teacher recording.");
                };
                referenceAudioRef.current = nextAudio;
                void nextAudio.play().catch(() => {
                  setStatus("Reference audio is not available in this browser.");
                });
                return;
              }

              if (
                typeof window === "undefined" ||
                !("speechSynthesis" in window) ||
                typeof SpeechSynthesisUtterance === "undefined" ||
                referenceText.trim().length === 0
              ) {
                setStatus("Reference voice is not available in this browser.");
                return;
              }
              stopPlayback();
              const utterance = new SpeechSynthesisUtterance(referenceText);
              utterance.rate = 0.92;
              utterance.pitch = 1;
              utterance.volume = 1;
              referenceSpeechActiveRef.current = true;
              utterance.onstart = () => {
                setIsPlaying(true);
                setStatus("Playing the reference voice.");
              };
              utterance.onend = () => {
                referenceSpeechActiveRef.current = false;
                setIsPlaying(false);
                setStatus("Finished playing the reference voice.");
              };
              window.speechSynthesis.cancel();
              window.speechSynthesis.speak(utterance);
            }}
            disabled={isPreparing}
          >
            <Play />
            Play reference
          </Button>
          <Button type="button" variant="secondary" onClick={stopPlayback} disabled={!isPlaying}>
            <Square />
            Stop
          </Button>
        </div>

        <div className="rounded-xl border bg-background/60 p-3.5">
          <p className="text-sm font-medium">Player status</p>
          <p className="text-muted-foreground text-sm leading-6">{status}</p>
          {selectedTake && (
            <p className="text-muted-foreground mt-2 text-sm">
              Selected take duration: {formatDuration(selectedTake.durationMs)}
            </p>
          )}
        </div>

        <WaveformVisualizer
          title="Reference track"
          subtitle="The example you are matching"
          audioBuffer={masterBuffer}
          color="#475569"
          playheadRatio={masterPlayheadRatio}
        />
        <WaveformVisualizer
          title="Your take"
          subtitle={
            selectedTakeIsVideo
              ? "Video takes do not render an audio waveform preview here yet"
              : "Your latest selected recording"
          }
          audioBuffer={studentBuffer}
          color="#4338ca"
          playheadRatio={studentPlayheadRatio}
        />

        {selectedTakeIsVideo && selectedTake ? (
          <div className="rounded-xl border bg-background/60 p-3.5">
            <MouthComparison
              studentSrc={selectedTake.objectUrl}
              referenceVideoUrl={referenceVideoUrl}
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
