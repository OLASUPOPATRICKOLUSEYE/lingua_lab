/**
 * S3-backed storage module. Implements the same surface as utils/storage/local.ts
 * so that call sites can switch imports with minimal changes. Functions that map
 * cleanly keep the same name and signature; those that don't (getLocalUploadPath,
 * assembleLocalUpload) are renamed to reflect the semantic difference.
 *
 * Chunk staging deliberately remains on local disk (os.tmpdir) for the lifetime
 * of a single upload session. Chunks are transient — they exist only until the
 * final chunk triggers assembly, at which point the buffer is uploaded to S3 and
 * the temp directory is deleted. Durability across container restarts is not
 * required: if a restart happens mid-upload the client-side uploader retries from
 * scratch, same as it does today with local.ts. Using S3 Multipart Upload instead
 * would be stateless across replicas but adds significant complexity; the current
 * single-container deployment does not require it.
 */

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createReadStream } from "node:fs";
import type { Readable } from "node:stream";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// ─── Driver selection ─────────────────────────────────────────────────────────
/**
 * With no S3_ENDPOINT configured, objects are read and written on the local
 * filesystem instead. This exists so a developer can run the whole flow —
 * record, upload, review, grade — with no object-storage account and no Docker,
 * which previously was impossible: the first thing that failed was the FINAL
 * chunk of an upload, so submissions were never created at all.
 *
 * Production always sets S3_ENDPOINT, so this branch is inert there. It is a
 * dev convenience, NOT a supported deployment mode: there is no replication, no
 * lifecycle policy, and it does not survive a container rebuild.
 */
export function isLocalStorage(): boolean {
  return !process.env.S3_ENDPOINT;
}

const LOCAL_STORAGE_ROOT = path.resolve(
  process.env.LOCAL_STORAGE_ROOT ?? path.join(process.cwd(), "uploads"),
);

/**
 * Resolves a canonical storage key to an absolute local path.
 *
 * Storage keys come from buildStoragePath() and contain only validated UUIDs,
 * so traversal should be impossible — this check is defence in depth. Getting
 * it wrong would turn a media endpoint into an arbitrary-file-read (Iron Law 3).
 */
function localPathFor(relativePath: string): string {
  const resolved = path.resolve(LOCAL_STORAGE_ROOT, relativePath);
  if (
    resolved !== LOCAL_STORAGE_ROOT &&
    !resolved.startsWith(LOCAL_STORAGE_ROOT + path.sep)
  ) {
    throw new Error("Refusing to resolve a storage path outside the root.");
  }
  return resolved;
}

async function writeLocalObject(
  relativePath: string,
  content: Buffer,
): Promise<void> {
  const target = localPathFor(relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content);
}

// ─── Config validation ────────────────────────────────────────────────────────

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. Copy .env.example to .env and fill it in.`,
    );
  }
  return value;
}

// ─── S3 client (lazy, memoized) ───────────────────────────────────────────────
// The client and all env var reads are deferred into getS3Client(), which is
// called only when an exported function actually executes at request time —
// never at module import time. This is critical for `next build`, which imports
// every API route module during its page-data-collection step but has no access
// to runtime env vars (S3_ENDPOINT, S3_BUCKET, etc.) that are injected by
// docker-compose at container start.
//
// The memoized result is reused for the lifetime of the process, so the client
// is constructed exactly once per worker process, not once per request.

interface S3Config {
  client: S3Client;
  bucket: string;
}

let s3Config: S3Config | null = null;

function getS3Client(): S3Config {
  if (s3Config) return s3Config;

  const forcePathStyle =
    (process.env.S3_FORCE_PATH_STYLE ?? "true").trim().toLowerCase() !== "false";

  s3Config = {
    client: new S3Client({
      endpoint: getRequiredEnv("S3_ENDPOINT"),
      region: getRequiredEnv("S3_REGION"),
      credentials: {
        accessKeyId: getRequiredEnv("S3_ACCESS_KEY_ID"),
        secretAccessKey: getRequiredEnv("S3_SECRET_ACCESS_KEY"),
      },
      forcePathStyle,
    }),
    bucket: getRequiredEnv("S3_BUCKET"),
  };

  return s3Config;
}

// ─── Chunk staging (local-disk, transient) ────────────────────────────────────
// Chunks are written to /tmp so the app container needs no shared volume for
// staging. They are removed immediately after assembly.

const CHUNKS_ROOT = path.join(tmpdir(), "lingua-uploads", ".chunks");

function chunkDir(uploadId: string): string {
  return path.join(CHUNKS_ROOT, uploadId);
}

function chunkPath(uploadId: string, chunkIndex: number): string {
  return path.join(chunkDir(uploadId), `${chunkIndex}.part`);
}

interface WriteChunkInput {
  uploadId: string;
  chunkIndex: number;
  chunk: Buffer;
}

/** Same name and signature as local.ts — callers can switch imports unchanged. */
export async function writeChunkToLocalUpload({
  uploadId,
  chunkIndex,
  chunk,
}: WriteChunkInput): Promise<void> {
  await mkdir(chunkDir(uploadId), { recursive: true });
  await writeFile(chunkPath(uploadId, chunkIndex), chunk);
}

/** Same name and signature as local.ts — cleans up the temp chunk directory. */
export async function removeLocalChunkUpload(uploadId: string): Promise<void> {
  await rm(chunkDir(uploadId), { recursive: true, force: true });
}

/**
 * Deletes staged chunk directories under CHUNKS_ROOT that are older than
 * maxAgeMs. Called from the normalization worker on a 1-hour interval.
 *
 * Chunks are always staged here (tmpdir) regardless of storage mode: the
 * upload route imports writeChunkToLocalUpload from this module in both local
 * and S3 configurations, so CHUNKS_ROOT is the only staging directory in use.
 * A student who closes the tab mid-upload never reaches assembleS3Upload, so
 * its finally-block never runs for their chunks. Without this sweep those
 * directories accumulate until the container restarts.
 *
 * Returns the number of directories removed so the caller can log it.
 */
export async function sweepStagedChunks(
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

// ─── Content-type helpers ─────────────────────────────────────────────────────

/**
 * Derives a MIME type from the file extension in an S3 key. Used as the
 * fallback when callers do not pass an explicit contentType.
 *
 * Note: .webm is ambiguous (audio-only or video). The fallback here is
 * video/webm, which is correct for reference-video objects. All audio-webm
 * call sites (student submission recordings) pass contentType explicitly, so
 * the fallback is never used for audio-only .webm files.
 */
export function contentTypeFromKey(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "wav":  return "audio/wav";
    case "mp3":  return "audio/mpeg";
    case "m4a":  return "audio/mp4";
    case "aac":  return "audio/aac";
    case "ogg":  return "audio/ogg";
    case "mp4":  return "video/mp4";
    case "webm": return "video/webm";
    default:     return "application/octet-stream";
  }
}

// ─── Assembly → S3 upload ─────────────────────────────────────────────────────

interface AssembleS3UploadInput {
  uploadId: string;
  totalChunks: number;
  /** The canonical relative path from buildStoragePath() — used as the S3 key. */
  destinationRelativePath: string;
  /**
   * MIME type for the S3 object's Content-Type header. Always pass this
   * explicitly — the fallback (contentTypeFromKey) exists only as a safety net
   * for callers that cannot know the MIME type at call time. Without an explicit
   * value, browsers (especially Safari) may refuse to play the media.
   */
  contentType?: string;
}

/**
 * Assembles all locally-staged chunks into a single buffer, uploads it to S3
 * under the given relative path as the object key, then removes the local chunk
 * directory.
 *
 * Parallel to assembleLocalUpload in local.ts. Renamed because the result is an
 * S3 object, not a local file — the destinationRelativePath becomes an S3 key,
 * and nothing is left on the local filesystem after this call returns.
 *
 * Returns void (unlike assembleLocalUpload which returned the local absolute
 * path — no local path exists here). All current call sites ignore the return
 * value of assembleLocalUpload, so this is a non-breaking difference.
 */
export async function assembleS3Upload({
  uploadId,
  totalChunks,
  destinationRelativePath,
  contentType,
}: AssembleS3UploadInput): Promise<void> {
  try {
    const parts: Buffer[] = [];
    for (let i = 0; i < totalChunks; i++) {
      const part = chunkPath(uploadId, i);
      try {
        await stat(part);
      } catch {
        throw new Error(`Missing chunk ${i + 1} of ${totalChunks}.`);
      }
      parts.push(await readFile(part));
    }

    if (isLocalStorage()) {
      await writeLocalObject(destinationRelativePath, Buffer.concat(parts));
    } else {
      const { client, bucket } = getS3Client();
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: destinationRelativePath,
          Body: Buffer.concat(parts),
          ContentType: contentType ?? contentTypeFromKey(destinationRelativePath),
        }),
      );
    }
  } finally {
    // Was only reached on success, so a missing chunk or a failed PutObject
    // leaked the staged chunks permanently. Chunks are disposable either way.
    await rm(chunkDir(uploadId), { recursive: true, force: true }).catch(() => {});
  }
}

// ─── Direct buffer upload ─────────────────────────────────────────────────────

/**
 * Uploads a buffer directly to S3 as a single object. Same name and signature
 * as local.ts — used for non-chunked writes like reference audio (≤20MB, already
 * fully buffered in memory before this call).
 *
 * Always pass contentType explicitly — see the note on AssembleS3UploadInput.
 */
export async function writeBufferToLocalUpload(
  relativePath: string,
  content: Buffer,
  contentType?: string,
): Promise<void> {
  if (isLocalStorage()) {
    await writeLocalObject(relativePath, content);
    return;
  }

  const { client, bucket } = getS3Client();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: relativePath,
      Body: content,
      ContentType: contentType ?? contentTypeFromKey(relativePath),
    }),
  );
}

// ─── Deletion ─────────────────────────────────────────────────────────────────

/**
 * Deletes an object from S3. Same name and signature as local.ts.
 *
 * Note: S3 DeleteObject is idempotent and succeeds even if the key does not
 * exist, mirroring the { force: true } behaviour of local.ts's rm().
 */
export async function removeLocalUpload(relativePath: string): Promise<void> {
  if (isLocalStorage()) {
    // force: true matches S3 DeleteObject's idempotence.
    await rm(localPathFor(relativePath), { force: true });
    return;
  }

  const { client, bucket } = getS3Client();
  await client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: relativePath,
    }),
  );
}

// ─── Object access ────────────────────────────────────────────────────────────

const DEFAULT_PRESIGNED_EXPIRY_SECONDS = 300; // 5 minutes

/**
 * Generates a presigned S3 GET URL for an object. Use this wherever call sites
 * currently use getLocalUploadPath() to serve files to the browser — instead of
 * streaming bytes through the app server, redirect the client to the presigned
 * URL directly.
 *
 * Presigned URLs should only be handed to authenticated callers and must not be
 * cached beyond their expiry window.
 */
export async function getPresignedDownloadUrl(
  relativePath: string,
  expirySeconds = DEFAULT_PRESIGNED_EXPIRY_SECONDS,
): Promise<string> {
  const { client, bucket } = getS3Client();
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket, Key: relativePath }),
    { expiresIn: expirySeconds },
  );
}

/**
 * Downloads an S3 object and returns its bytes as a Buffer. Use this for
 * server-side consumers that need the raw bytes but cannot use a presigned
 * redirect — for example, the normalization worker, which must write the file
 * to a local temp path before passing it to FFmpeg.
 *
 * Loads the entire object into memory. Appropriate for audio files (typically
 * ≤50MB); the app server serving browser requests should prefer
 * getPresignedDownloadUrl() + redirect for large video files.
 */
export async function getObjectBuffer(relativePath: string): Promise<Buffer> {
  if (isLocalStorage()) {
    return readFile(localPathFor(relativePath));
  }

  const { client, bucket } = getS3Client();
  const response = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: relativePath }),
  );

  if (!response.Body) {
    throw new Error(`S3 object not found or empty: ${relativePath}`);
  }

  // transformToByteArray() is the recommended SDK v3 method for collecting
  // the response body into memory without manually piping the stream.
  const bytes = await response.Body.transformToByteArray();
  return Buffer.from(bytes);
}

/**
 * Returns the S3 object body as a Node.js Readable stream. Use this for large
 * objects where buffering into memory is undesirable (e.g. streaming a 200MB
 * reference video to a browser without loading it into the Node.js process).
 * The caller is responsible for consuming or destroying the stream.
 */
export async function getObjectStream(relativePath: string): Promise<Readable> {
  if (isLocalStorage()) {
    return createReadStream(localPathFor(relativePath));
  }

  const { client, bucket } = getS3Client();
  const response = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: relativePath }),
  );

  if (!response.Body) {
    throw new Error(`S3 object not found or empty: ${relativePath}`);
  }

  // In the Node.js runtime the SDK v3 returns a Node.js Readable.
  // The TypeScript union type reflects all possible runtimes (browser/edge/node);
  // the cast is safe here since this module only runs in Node.js.
  return response.Body as unknown as Readable;
}

/**
 * Byte size of a locally-stored object. Local mode only — the S3 path uses
 * presigned URLs and lets the object store answer Range requests itself.
 */
export async function getLocalObjectSize(relativePath: string): Promise<number> {
  const info = await stat(localPathFor(relativePath));
  return info.size;
}

/** Absolute path of a locally-stored object, for range-limited reads. */
export function getLocalObjectPath(relativePath: string): string {
  return localPathFor(relativePath);
}
