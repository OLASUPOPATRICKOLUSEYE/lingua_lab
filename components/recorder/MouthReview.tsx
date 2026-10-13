"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, SkipBack, SkipForward, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * MouthReview — a video reviewer built for studying mouth movement and
 * position, not general playback. Adds the affordances a teacher or student
 * needs to scrutinise lip/jaw shape at a moment in time:
 *
 *  - slow-motion (0.25× / 0.5× / 1×) and frame-step (~1/30s) for catching the
 *    exact instant a sound is formed,
 *  - a scrubber, and
 *  - zoom-to-mouth: a CSS-transform crop centred on the lower face, with a
 *    draggable focus point (no computer vision — pure transform).
 *
 * Deliberately dependency-free and client-only. Shared by the student review
 * step and the teacher submission review so both sides study the mouth the
 * same way.
 */

const SPEEDS = [0.25, 0.5, 1] as const;
// One frame at 30fps. Recordings are variable-fps; this is a pragmatic step
// size for "nudge by roughly a frame", not an exact frame boundary.
const FRAME_STEP_SECONDS = 1 / 30;
const ZOOM_SCALE = 2.4;

interface MouthReviewProps {
  /** Video source — a blob object URL (student) or a server media URL (teacher). */
  src: string;
  /** Optional caption under the header, e.g. "Your take" / "Processed video". */
  label?: string;
  className?: string;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00.0";
  const whole = Math.floor(seconds);
  const mins = Math.floor(whole / 60);
  const secs = whole % 60;
  const tenths = Math.floor((seconds - whole) * 10);
  return `${mins}:${secs.toString().padStart(2, "0")}.${tenths}`;
}

export function MouthReview({ src, label, className }: MouthReviewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [zoomed, setZoomed] = useState(false);
  // Focus point as a 0–1 ratio of the frame. Defaults to lower-centre, where a
  // face-on speaker's mouth sits.
  const [focus, setFocus] = useState({ x: 0.5, y: 0.68 });

  // Keep the <video> playbackRate in sync with the chosen speed.
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
  }, [speed]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play().catch(() => {
        /* autoplay/gesture rejection is non-fatal */
      });
    } else {
      video.pause();
    }
  }, []);

  const stepFrames = useCallback((frames: number) => {
    const video = videoRef.current;
    if (!video) return;
    // Pausing first makes the step observable and keeps slow scrubbing precise.
    video.pause();
    const next = video.currentTime + frames * FRAME_STEP_SECONDS;
    video.currentTime = Math.min(
      Math.max(next, 0),
      Number.isFinite(video.duration) ? video.duration : next,
    );
  }, []);

  const onScrub = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Number(event.target.value);
  }, []);

  // Drag the zoom focus point across the frame.
  const moveFocusFromPointer = useCallback((clientX: number, clientY: number) => {
    const el = frameRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;
    setFocus({
      x: Math.min(Math.max(x, 0), 1),
      y: Math.min(Math.max(y, 0), 1),
    });
  }, []);

  const zoomStyle = zoomed
    ? {
        transform: `scale(${ZOOM_SCALE})`,
        transformOrigin: `${focus.x * 100}% ${focus.y * 100}%`,
      }
    : undefined;

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">{label ?? "Mouth review"}</p>
        <Button
          type="button"
          size="sm"
          variant={zoomed ? "default" : "outline"}
          onClick={() => setZoomed((z) => !z)}
        >
          {zoomed ? <ZoomOut className="size-4" /> : <ZoomIn className="size-4" />}
          {zoomed ? "Fit" : "Zoom to mouth"}
        </Button>
      </div>

      <div
        ref={frameRef}
        className={`mt-3 overflow-hidden rounded-lg border bg-black ${
          zoomed ? "cursor-crosshair" : ""
        }`}
        onPointerDown={(e) => {
          if (!zoomed) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          moveFocusFromPointer(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (!zoomed || e.buttons !== 1) return;
          moveFocusFromPointer(e.clientX, e.clientY);
        }}
      >
        <video
          ref={videoRef}
          src={src}
          playsInline
          className="aspect-video w-full object-cover transition-transform duration-150"
          style={zoomStyle}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onClick={togglePlay}
        />
      </div>

      {zoomed ? (
        <p className="text-muted-foreground mt-2 text-xs">
          Drag on the video to move the zoom onto the mouth.
        </p>
      ) : null}

      {/* Scrubber */}
      <input
        type="range"
        min={0}
        max={duration || 0}
        step={0.01}
        value={Math.min(currentTime, duration || 0)}
        onChange={onScrub}
        aria-label="Scrub video"
        className="accent-primary mt-3 w-full"
      />

      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={() => stepFrames(-1)}
            aria-label="Step back one frame"
            title="Step back one frame"
          >
            <SkipBack className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            onClick={togglePlay}
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
          </Button>
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={() => stepFrames(1)}
            aria-label="Step forward one frame"
            title="Step forward one frame"
          >
            <SkipForward className="size-4" />
          </Button>
          <span className="text-muted-foreground ml-2 text-xs tabular-nums">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <span className="text-muted-foreground mr-1 text-xs">Speed</span>
          {SPEEDS.map((s) => (
            <Button
              key={s}
              type="button"
              size="sm"
              variant={s === speed ? "default" : "outline"}
              onClick={() => setSpeed(s)}
            >
              {s}×
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
