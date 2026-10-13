import { execFile } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

interface NormalizeAudioInput {
  inputPath: string;
  outputPath: string;
}

export async function normalizeAudioWithFfmpeg({
  inputPath,
  outputPath,
}: NormalizeAudioInput): Promise<void> {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await rm(outputPath, { force: true });

  try {
    await execFileAsync("ffmpeg", [
      "-i",
      inputPath,
      "-ar",
      "16000",
      "-ac",
      "1",
      "-af",
      "loudnorm=I=-23:LRA=7:tp=-2",
      outputPath,
    ]);
  } catch (error) {
    const message =
      error instanceof Error && "stderr" in error
        ? String(error.stderr)
        : error instanceof Error
          ? error.message
          : "Unknown FFmpeg failure.";
    throw new Error(`FFmpeg normalization failed: ${message.trim()}`);
  }
}
