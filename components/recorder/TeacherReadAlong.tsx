"use client";

import { useEffect, useRef, useState } from "react";
import { Ear, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
// Voice locale comes from the shared registry; this used to be a two-language
// if-chain that read every other language aloud in an American accent.
import { speechLocale } from "@/utils/languages";


function renderHighlightedPassage(text: string, activeCharIndex: number | null) {
  const tokens = text.split(/(\s+)/);
  let cursor = 0;

  return tokens.map((token, index) => {
    const start = cursor;
    const end = cursor + token.length;
    cursor = end;

    if (/^\s+$/.test(token)) {
      return <span key={`space-${index}`}>{token}</span>;
    }

    const isActive =
      activeCharIndex !== null && activeCharIndex >= start && activeCharIndex < end;

    return (
      <span
        key={`word-${index}`}
        className={
          isActive
            ? "rounded-md bg-orange-200 px-1 text-foreground dark:bg-orange-500/25"
            : undefined
        }
      >
        {token}
      </span>
    );
  });
}

function getProgressCharIndex(text: string, currentTime: number, duration: number) {
  if (!text.length || !Number.isFinite(duration) || duration <= 0) {
    return null;
  }

  const progress = Math.min(Math.max(currentTime / duration, 0), 1);
  return Math.min(text.length - 1, Math.floor(progress * text.length));
}

export function TeacherReadAlong({
  teacherName,
  language,
  passageText,
  referenceAudioUrl,
}: {
  teacherName: string;
  language: string;
  passageText: string;
  referenceAudioUrl?: string | null;
}) {
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioSyncFrameRef = useRef<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeCharIndex, setActiveCharIndex] = useState<number | null>(null);
  const [status, setStatus] = useState("Press play to hear the teacher from the beginning.");

  useEffect(() => {
    return () => {
      if (audioSyncFrameRef.current !== null) {
        window.cancelAnimationFrame(audioSyncFrameRef.current);
      }
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  function stopPlayback() {
    if (audioSyncFrameRef.current !== null) {
      window.cancelAnimationFrame(audioSyncFrameRef.current);
      audioSyncFrameRef.current = null;
    }
    audioRef.current?.pause();
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
    }
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    utteranceRef.current = null;
    setIsPlaying(false);
    setActiveCharIndex(null);
    setStatus("Playback stopped.");
  }

  function playFromStart() {
    if (referenceAudioUrl) {
      if (audioSyncFrameRef.current !== null) {
        window.cancelAnimationFrame(audioSyncFrameRef.current);
        audioSyncFrameRef.current = null;
      }
      audioRef.current?.pause();
      const nextAudio = new Audio(referenceAudioUrl);

      const syncHighlight = () => {
        const nextIndex = getProgressCharIndex(
          passageText,
          nextAudio.currentTime,
          nextAudio.duration,
        );
        setActiveCharIndex(nextIndex);

        if (!nextAudio.paused && !nextAudio.ended) {
          audioSyncFrameRef.current = window.requestAnimationFrame(syncHighlight);
        } else {
          audioSyncFrameRef.current = null;
        }
      };

      nextAudio.currentTime = 0;
      nextAudio.onplay = () => {
        setIsPlaying(true);
        setActiveCharIndex(0);
        setStatus(`${teacherName}'s recording is playing now.`);
        syncHighlight();
      };
      nextAudio.onended = () => {
        if (audioSyncFrameRef.current !== null) {
          window.cancelAnimationFrame(audioSyncFrameRef.current);
          audioSyncFrameRef.current = null;
        }
        setIsPlaying(false);
        setActiveCharIndex(null);
        setStatus("Finished. Replay whenever you want.");
      };
      nextAudio.onpause = () => {
        if (audioSyncFrameRef.current !== null) {
          window.cancelAnimationFrame(audioSyncFrameRef.current);
          audioSyncFrameRef.current = null;
        }
        setIsPlaying(false);
      };
      nextAudio.onerror = () => {
        if (audioSyncFrameRef.current !== null) {
          window.cancelAnimationFrame(audioSyncFrameRef.current);
          audioSyncFrameRef.current = null;
        }
        setIsPlaying(false);
        setActiveCharIndex(null);
        setStatus("Teacher playback could not start in this browser.");
      };
      audioRef.current = nextAudio;
      void nextAudio.play().catch(() => {
        if (audioSyncFrameRef.current !== null) {
          window.cancelAnimationFrame(audioSyncFrameRef.current);
          audioSyncFrameRef.current = null;
        }
        setIsPlaying(false);
        setActiveCharIndex(null);
        setStatus("Teacher playback could not start in this browser.");
      });
      return;
    }

    if (
      typeof window === "undefined" ||
      !("speechSynthesis" in window) ||
      typeof SpeechSynthesisUtterance === "undefined"
    ) {
      setStatus("Teacher playback is not available in this browser.");
      return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(passageText);
    utterance.lang = speechLocale(language);
    utterance.rate = 0.9;
    utterance.pitch = 1;

    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find((voice) =>
      voice.lang.toLowerCase().startsWith(utterance.lang.slice(0, 2).toLowerCase()),
    );
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    utterance.onstart = () => {
      setIsPlaying(true);
      setActiveCharIndex(0);
      setStatus(`${teacherName} is reading now.`);
    };

    utterance.onboundary = (event) => {
      if (typeof event.charIndex === "number") {
        setActiveCharIndex(event.charIndex);
      }
    };

    utterance.onend = () => {
      utteranceRef.current = null;
      setIsPlaying(false);
      setActiveCharIndex(null);
      setStatus("Finished. Replay whenever you want.");
    };

    utterance.onerror = () => {
      utteranceRef.current = null;
      setIsPlaying(false);
      setActiveCharIndex(null);
      setStatus("Playback could not start in this browser.");
    };

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }

  return (
    <div className="rounded-2xl border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Ear className="text-primary size-4" />
            <p className="text-sm font-medium">Teacher model</p>
          </div>
          <p className="text-muted-foreground mt-1 text-sm leading-6">
            {referenceAudioUrl
              ? "Listen to the recorded teacher model before you make your take."
              : "Follow the highlight while the guided model reads the full passage."}
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" size="sm" onClick={playFromStart}>
            <Play className="size-4" />
            Play
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={stopPlayback}
            disabled={!isPlaying}
          >
            <Square className="size-4" />
            Stop
          </Button>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border bg-background/70 p-4 text-[15px] leading-8">
        <p className="text-foreground">{renderHighlightedPassage(passageText, activeCharIndex)}</p>
      </div>

      <p className="text-muted-foreground mt-3 text-sm">{status}</p>
      <p className="text-muted-foreground mt-2 text-xs leading-5">
        {referenceAudioUrl
          ? "This activity includes a recorded teacher reference."
          : "Current demo uses in-browser guided playback for the model reading."}
      </p>
    </div>
  );
}
