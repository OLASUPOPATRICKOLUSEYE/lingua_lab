"use client";

export const RECORDER_TIME_LIMITS = [30, 60, 90, 120, 300] as const;
export const UPLOAD_CHUNK_SIZE_BYTES = 5 * 1024 * 1024;
export const MAX_UPLOAD_RETRIES = 3;

export type RecorderTimeLimitSeconds = (typeof RECORDER_TIME_LIMITS)[number];
export type RecorderSubmissionMode = "audio" | "video";

export interface RecorderActivityConfig {
  id: string;
  prompt: string;
  targetLanguage: string;
  passageTitle: string;
  passageText: string;
  teacherName: string;
  teacherReferenceText: string;
  teacherReferenceAudioUrl?: string | null;
  teacherReferenceVideoUrl?: string | null;
  submissionModes: RecorderSubmissionMode[];
  timeLimitSeconds: RecorderTimeLimitSeconds;
}

export interface RecorderTake {
  id: string;
  blob: Blob;
  mimeType: string;
  objectUrl: string;
  durationMs: number;
  createdAt: number;
  compressedBlob: Blob | null;
  submissionMode: RecorderSubmissionMode;
}

export interface UploadProgress {
  phase: "idle" | "compressing" | "uploading" | "success" | "error";
  percent: number;
  message: string;
}

export interface ChunkUploadPayload {
  endpoint: string;
  activityId: string;
  take: RecorderTake;
  compressedBlob: Blob;
  onProgress: (progress: UploadProgress) => void;
}

export interface UploadTakeResult {
  submissionId: string;
  status: string;
  manualReview: boolean;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function isVideoMimeType(mimeType: string): boolean {
  return mimeType.split(";")[0]?.trim().toLowerCase().startsWith("video/") ?? false;
}

export function supportedRecorderMimeType(
  submissionMode: RecorderSubmissionMode,
): string {
  const candidates =
    submissionMode === "video"
      ? [
          "video/webm;codecs=vp9,opus",
          "video/webm;codecs=vp8,opus",
          "video/webm",
          "video/mp4",
        ]
      : [
          "audio/webm;codecs=opus",
          "audio/webm",
          "audio/mp4",
          "audio/mp4;codecs=mp4a.40.2",
        ];

  for (const candidate of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(candidate)) {
      return candidate;
    }
  }

  return "";
}

export function rms(buf: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += (buf[i] ?? 0) ** 2;
  return Math.sqrt(sum / buf.length);
}

export function mixToMono(buffer: AudioBuffer): Float32Array {
  const mono = new Float32Array(buffer.length);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const source = buffer.getChannelData(channel);
    for (let i = 0; i < buffer.length; i++) {
      mono[i] = (mono[i] ?? 0) + (source[i] ?? 0) / buffer.numberOfChannels;
    }
  }
  return mono;
}

export async function synthesizeMasterBuffer(): Promise<AudioBuffer> {
  const sampleRate = 44100;
  const durationSeconds = 4;
  const length = sampleRate * durationSeconds;
  const ctx = new OfflineAudioContext(1, length, sampleRate);

  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.value = 440;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, 0);
  gain.gain.linearRampToValueAtTime(0.25, 0.04);
  gain.gain.linearRampToValueAtTime(0.18, 0.2);
  gain.gain.setValueAtTime(0.18, durationSeconds - 0.3);
  gain.gain.linearRampToValueAtTime(0, durationSeconds);

  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(durationSeconds);

  return ctx.startRendering();
}

function supportedCompressedMimeType(preferredMimeType: string): string {
  const candidates = [
    preferredMimeType,
    "audio/webm;codecs=opus",
    "audio/mp4",
    "audio/webm",
    "audio/mp4;codecs=mp4a.40.2",
  ];

  for (const candidate of candidates) {
    if (candidate && MediaRecorder.isTypeSupported(candidate)) {
      return candidate;
    }
  }

  return preferredMimeType;
}

export async function compressAudioBlob(
  blob: Blob,
  preferredMimeType: string,
): Promise<Blob> {
  const ctx = new AudioContext();
  const arrayBuffer = await blob.arrayBuffer();

  try {
    const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
    const destination = ctx.createMediaStreamDestination();
    const source = ctx.createBufferSource();
    source.buffer = decoded;
    source.connect(destination);

    const mimeType = supportedCompressedMimeType(preferredMimeType);
    const recorder = new MediaRecorder(destination.stream, {
      mimeType,
      audioBitsPerSecond: 64_000,
    });

    const chunks: Blob[] = [];

    return await new Promise<Blob>((resolve, reject) => {
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };

      recorder.onerror = () => {
        reject(new Error("Audio compression failed during MediaRecorder capture."));
      };

      recorder.onstop = () => {
        resolve(
          new Blob(chunks, {
            type: recorder.mimeType || mimeType || blob.type,
          }),
        );
      };

      source.onended = () => {
        if (recorder.state !== "inactive") recorder.stop();
      };

      recorder.start();
      source.start();
    });
  } finally {
    if (ctx.state !== "closed") {
      await ctx.close().catch(() => {});
    }
  }
}

function uploadChunk(
  url: string,
  formData: FormData,
  onChunkProgress: (loaded: number, total: number) => void,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onChunkProgress(event.loaded, event.total);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(xhr.responseText ? JSON.parse(xhr.responseText) : null);
        } catch {
          resolve(null);
        }
        return;
      }

      let serverError: string | null = null;
      try {
        const body = xhr.responseText
          ? (JSON.parse(xhr.responseText) as { error?: string })
          : null;
        if (body?.error) {
          serverError = body.error;
        }
      } catch {}

      reject(
        new Error(
          serverError ??
            (xhr.status === 404
            ? "Upload endpoint was not found. Check that /api/submissions/upload is available in this build."
            : `Chunk upload failed with status ${xhr.status}.`),
        ),
      );
    };

    xhr.onerror = () => {
      reject(new Error("Network error while uploading audio chunk."));
    };

    xhr.send(formData);
  });
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function uploadTakeInChunks({
  endpoint,
  activityId,
  take,
  compressedBlob,
  onProgress,
}: ChunkUploadPayload): Promise<UploadTakeResult> {
  const totalBytes = compressedBlob.size;
  const chunkCount = Math.ceil(totalBytes / UPLOAD_CHUNK_SIZE_BYTES);
  const uploadId = crypto.randomUUID();
  const durationMs = Math.max(1, Math.round(take.durationMs));

  let uploadedBytes = 0;

  onProgress({
    phase: "uploading",
    percent: 0,
    message: `Uploading ${chunkCount} chunks…`,
  });

  let finalResponse: UploadTakeResult | null = null;

  for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex++) {
    const start = chunkIndex * UPLOAD_CHUNK_SIZE_BYTES;
    const end = Math.min(start + UPLOAD_CHUNK_SIZE_BYTES, totalBytes);
    const chunk = compressedBlob.slice(start, end, compressedBlob.type);
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_UPLOAD_RETRIES; attempt++) {
      try {
        const formData = new FormData();
        formData.append("uploadId", uploadId);
        formData.append("activityId", activityId);
        formData.append("takeId", take.id);
        formData.append("chunkIndex", String(chunkIndex));
        formData.append("totalChunks", String(chunkCount));
        formData.append("fileName", `${take.id}.${compressedBlob.type.split("/")[1] ?? "bin"}`);
        formData.append("mimeType", compressedBlob.type);
        formData.append("durationMs", String(durationMs));
        formData.append("chunk", chunk);

        const response = await uploadChunk(endpoint, formData, (loaded, total) => {
          const percent = ((uploadedBytes + (loaded / total) * chunk.size) / totalBytes) * 100;
          onProgress({
            phase: "uploading",
            percent,
            message: `Uploading chunk ${chunkIndex + 1} of ${chunkCount}…`,
          });
        });
        if (chunkIndex === chunkCount - 1) {
          finalResponse = response as UploadTakeResult | null;
        }

        uploadedBytes += chunk.size;
        onProgress({
          phase: "uploading",
          percent: (uploadedBytes / totalBytes) * 100,
          message: `Uploaded chunk ${chunkIndex + 1} of ${chunkCount}.`,
        });
        lastError = null;
        break;
      } catch (err) {
        lastError = err as Error;
        if (attempt === MAX_UPLOAD_RETRIES - 1) {
          throw lastError;
        }
        await delay(500 * 2 ** attempt);
      }
    }
  }

  onProgress({
    phase: "success",
    percent: 100,
    message: "Upload complete.",
  });

  if (!finalResponse?.submissionId) {
    throw new Error("Upload finished but no submission id was returned.");
  }

  return finalResponse;
}
