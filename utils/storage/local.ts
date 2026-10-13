import {
  appendFile,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

const UPLOADS_ROOT = path.join(process.cwd(), "uploads");
const CHUNKS_ROOT = path.join(UPLOADS_ROOT, ".chunks");

interface WriteChunkInput {
  uploadId: string;
  chunkIndex: number;
  chunk: Buffer;
}

interface AssembleChunksInput {
  uploadId: string;
  totalChunks: number;
  destinationRelativePath: string;
}

function chunkDir(uploadId: string): string {
  return path.join(CHUNKS_ROOT, uploadId);
}

function chunkPath(uploadId: string, chunkIndex: number): string {
  return path.join(chunkDir(uploadId), `${chunkIndex}.part`);
}

function storedFilePath(relativePath: string): string {
  return path.join(UPLOADS_ROOT, relativePath);
}

export function getLocalUploadPath(relativePath: string): string {
  return storedFilePath(relativePath);
}

export async function writeChunkToLocalUpload({
  uploadId,
  chunkIndex,
  chunk,
}: WriteChunkInput): Promise<void> {
  const dir = chunkDir(uploadId);
  await mkdir(dir, { recursive: true });
  await writeFile(chunkPath(uploadId, chunkIndex), chunk);
}

export async function assembleLocalUpload({
  uploadId,
  totalChunks,
  destinationRelativePath,
}: AssembleChunksInput): Promise<string> {
  const destination = storedFilePath(destinationRelativePath);
  await mkdir(path.dirname(destination), { recursive: true });

  // Assemble into a sibling temp file and rename into place at the end.
  //
  // Appending directly to `destination` meant a missing chunk left a TRUNCATED
  // file sitting at the canonical storage path with nothing marking it
  // incomplete — it could then be served to a teacher or handed to the grading
  // pipeline as if it were a whole take. rename(2) within the same directory is
  // atomic, so a reader sees either no file or the complete one.
  const staging = `${destination}.partial-${uploadId}`;

  try {
    await writeFile(staging, new Uint8Array());

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      const partPath = chunkPath(uploadId, chunkIndex);
      try {
        await stat(partPath);
      } catch {
        throw new Error(`Missing chunk ${chunkIndex + 1} of ${totalChunks}.`);
      }
      const content = await readFile(partPath);
      await appendFile(staging, content);
    }

    await rename(staging, destination);
  } catch (error) {
    // Leave nothing behind on the failure path, including the staging file.
    await rm(staging, { force: true }).catch(() => {});
    throw error;
  } finally {
    // Chunks are disposable once we have either succeeded or given up. This
    // previously ran only on success, so every abandoned or failed upload
    // leaked its chunks permanently.
    await rm(chunkDir(uploadId), { recursive: true, force: true }).catch(() => {});
  }

  return destination;
}

/**
 * Delete staged chunk directories older than `maxAgeMs`.
 *
 * A student who closes the tab, loses Wi-Fi, or exhausts the chunk retries
 * never reaches assemble, so nothing else collects their chunks. With a 200MB
 * per-submission cap and a class uploading at once, that is how a disk fills.
 * Returns the number of directories removed so callers can log it.
 */
export async function sweepStaleLocalChunks(
  maxAgeMs = 24 * 60 * 60 * 1000,
): Promise<number> {
  let entries: string[];
  try {
    entries = await readdir(CHUNKS_ROOT);
  } catch {
    return 0; // Nothing staged yet.
  }

  const cutoff = Date.now() - maxAgeMs;
  let removed = 0;

  for (const entry of entries) {
    const dir = path.join(CHUNKS_ROOT, entry);
    try {
      const info = await stat(dir);
      if (!info.isDirectory() || info.mtimeMs >= cutoff) continue;
      await rm(dir, { recursive: true, force: true });
      removed += 1;
    } catch {
      // Raced with a concurrent upload or assemble; skip it.
    }
  }

  return removed;
}

export async function removeLocalUpload(relativePath: string): Promise<void> {
  await rm(storedFilePath(relativePath), { force: true });
}

export async function removeLocalChunkUpload(uploadId: string): Promise<void> {
  await rm(chunkDir(uploadId), { recursive: true, force: true });
}

export async function writeBufferToLocalUpload(
  relativePath: string,
  content: Buffer,
): Promise<void> {
  const destination = storedFilePath(relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, content);
}

export function getLocalUploadsRoot(): string {
  return UPLOADS_ROOT;
}
