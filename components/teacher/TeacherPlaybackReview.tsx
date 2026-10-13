"use client";

import { useEffect, useRef, useState } from "react";

interface WordTimestamp {
  word: string;
  start_ms: number;
  end_ms: number;
}

interface TeacherPlaybackReviewProps {
  mediaSrc: string;
  transcript: string | null;
  wordTimestamps: WordTimestamp[] | null;
  /**
   * Render a player with a picture. Video submissions must be given the RAW
   * source: normalization rewrites every take to a 16 kHz mono .wav for the AI
   * pipeline, which has no video track at all.
   */
  isVideo?: boolean;
}

function formatTimestampLabel(ms: number): string {
  return `${(ms / 1000).toFixed(2)}s`;
}

export function TeacherPlaybackReview({
  mediaSrc,
  transcript,
  wordTimestamps,
  isVideo = false,
}: TeacherPlaybackReviewProps) {
  // HTMLMediaElement is the shared base of <audio> and <video>, so the
  // transcript seeking below works identically for both.
  const audioRef = useRef<HTMLMediaElement | null>(null);
  const [activeWordIndex, setActiveWordIndex] = useState<number | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !wordTimestamps?.length) {
      setActiveWordIndex(null);
      return;
    }

    const handleTimeUpdate = (): void => {
      const currentMs = audio.currentTime * 1000;
      const index = wordTimestamps.findIndex(
        (token) => currentMs >= token.start_ms && currentMs <= token.end_ms,
      );
      setActiveWordIndex(index >= 0 ? index : null);
    };

    const handleEnded = (): void => {
      setActiveWordIndex(null);
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [wordTimestamps]);

  function seekToWord(startMs: number): void {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    audio.currentTime = startMs / 1000;
    void audio.play().catch(() => {
      // Ignore autoplay rejection; the seek still applies.
    });
  }

  return (
    <div className="space-y-4">
      {isVideo ? (
        <video
          ref={audioRef as React.RefObject<HTMLVideoElement | null>}
          controls
          playsInline
          className="max-h-112 w-full rounded-xl bg-black"
          src={mediaSrc}
        />
      ) : (
        <audio
          ref={audioRef as React.RefObject<HTMLAudioElement | null>}
          controls
          className="w-full rounded-xl"
          src={mediaSrc}
        />
      )}
      {transcript ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="font-medium">Latest transcript</p>
            {wordTimestamps?.length ? (
              <p className="text-muted-foreground text-xs">
                Click any word to jump playback
              </p>
            ) : null}
          </div>
          <div className="border-border bg-muted/50 rounded-2xl border p-4">
            {wordTimestamps?.length ? (
              <div className="flex flex-wrap gap-2 text-sm leading-6">
                {wordTimestamps.map((token, index) => {
                  const isActive = activeWordIndex === index;
                  return (
                    <button
                      key={`${token.word}-${token.start_ms}-${index}`}
                      type="button"
                      onClick={() => seekToWord(token.start_ms)}
                      className={`rounded-full border px-3 py-1.5 text-left transition ${
                        isActive
                          ? "border-emerald-500 bg-emerald-100 text-emerald-900"
                          : "border-border bg-background text-foreground hover:bg-accent"
                      }`}
                    >
                      <span className="font-medium">{token.word}</span>
                      <span className="text-muted-foreground pl-2 text-xs">
                        {formatTimestampLabel(token.start_ms)}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm leading-6">
                {transcript}
              </p>
            )}
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          No transcript yet. Manual review can still proceed.
        </p>
      )}
      {wordTimestamps?.length ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="font-medium">Latest word timing</p>
            <p className="text-muted-foreground text-xs">
              {wordTimestamps.length} aligned words
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {wordTimestamps.map((token, index) => (
              <div
                key={`timing-${token.word}-${token.start_ms}-${index}`}
                className="border-border bg-background rounded-full border px-3 py-1.5 text-xs"
              >
                <span className="font-medium">{token.word}</span>
                <span className="text-muted-foreground pl-2">
                  {formatTimestampLabel(token.start_ms)}-{formatTimestampLabel(token.end_ms)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
