"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { mixToMono, rms } from "@/components/recorder/recorder-utils";

interface WaveformVisualizerProps {
  title: string;
  subtitle: string;
  analyserNode?: AnalyserNode | null;
  audioBuffer?: AudioBuffer | null;
  color?: string;
  isActive?: boolean;
  measurementOriginMs?: number | null;
  playheadRatio?: number | null;
  onFirstRender?: (latencyMs: number) => void;
  onFirstSignal?: (latencyMs: number) => void;
  className?: string;
}

function drawWaveformFromSamples(
  canvas: HTMLCanvasElement,
  samples: Float32Array,
  color: string,
): void {
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
  const amplitude = height * 0.4;

  for (let x = 0; x < width; x++) {
    const index = Math.min(samples.length - 1, x * step);
    const y = midY + (samples[index] ?? 0) * amplitude;
    if (x === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }

  ctx.stroke();
}

export function WaveformVisualizer({
  title,
  subtitle,
  analyserNode,
  audioBuffer,
  color = "#4338ca",
  isActive = false,
  measurementOriginMs = null,
  playheadRatio = null,
  onFirstRender,
  onFirstSignal,
  className,
}: WaveformVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const firstRenderCapturedRef = useRef(false);
  const firstSignalCapturedRef = useRef(false);

  useEffect(() => {
    firstRenderCapturedRef.current = false;
    firstSignalCapturedRef.current = false;
  }, [measurementOriginMs]);

  useEffect(() => {
    if (playheadRef.current) {
      playheadRef.current.style.left =
        playheadRatio === null ? "0%" : `${Math.min(100, Math.max(0, playheadRatio * 100))}%`;
    }
  }, [playheadRatio]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (!audioBuffer) {
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    drawWaveformFromSamples(canvas, mixToMono(audioBuffer), color);
  }, [audioBuffer, color]);

  useEffect(() => {
    if (!analyserNode || !isActive) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const frame = new Float32Array(analyserNode.fftSize);
    let rafId = 0;

    const tick = () => {
      analyserNode.getFloatTimeDomainData(frame);
      drawWaveformFromSamples(canvas, frame, color);

      if (!firstRenderCapturedRef.current && measurementOriginMs !== null) {
        firstRenderCapturedRef.current = true;
        onFirstRender?.(performance.now() - measurementOriginMs);
      }

      if (!firstSignalCapturedRef.current && measurementOriginMs !== null && rms(frame) >= 0.01) {
        firstSignalCapturedRef.current = true;
        onFirstSignal?.(performance.now() - measurementOriginMs);
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [
    analyserNode,
    color,
    isActive,
    measurementOriginMs,
    onFirstRender,
    onFirstSignal,
  ]);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div>
        <p className="text-muted-foreground text-xs font-medium uppercase">{title}</p>
        <p className="text-muted-foreground text-xs">{subtitle}</p>
      </div>
      <div className="bg-muted/40 relative overflow-hidden rounded-md border">
        <canvas ref={canvasRef} width={900} height={96} className="block h-24 w-full" />
        {playheadRatio !== null && (
          <div
            ref={playheadRef}
            className="bg-primary/70 absolute top-0 left-0 h-full w-px -translate-x-1/2"
          />
        )}
      </div>
    </div>
  );
}
