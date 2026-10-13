import { mkdtemp, mkdir, readdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Chunk lifecycle. The previous implementation removed staged chunks ONLY after
 * a successful assemble and appended straight to the destination path, so a
 * failed upload leaked its chunks forever and left a truncated file where a
 * complete take should be.
 */
let workdir: string;

beforeEach(async () => {
  workdir = await mkdtemp(path.join(tmpdir(), "lingua-chunk-test-"));
  vi.spyOn(process, "cwd").mockReturnValue(workdir);
  vi.resetModules();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(workdir, { recursive: true, force: true });
});

const chunksRoot = () => path.join(workdir, "uploads", ".chunks");

async function stageChunk(uploadId: string, index: number, body: string) {
  const dir = path.join(chunksRoot(), uploadId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${index}.part`), body);
}

describe("assembleLocalUpload", () => {
  it("writes the complete file and clears its chunks on success", async () => {
    const { assembleLocalUpload } = await import("./local");
    await stageChunk("up-1", 0, "hello ");
    await stageChunk("up-1", 1, "world");

    const dest = await assembleLocalUpload({
      uploadId: "up-1",
      totalChunks: 2,
      destinationRelativePath: "raw/s/c/st/sub.webm",
    });

    const { readFile } = await import("node:fs/promises");
    expect(await readFile(dest, "utf8")).toBe("hello world");
    await expect(stat(path.join(chunksRoot(), "up-1"))).rejects.toThrow();
  });

  it("leaves NO partial file and clears chunks when a chunk is missing", async () => {
    const { assembleLocalUpload } = await import("./local");
    await stageChunk("up-2", 0, "first");
    // chunk 1 never arrived

    await expect(
      assembleLocalUpload({
        uploadId: "up-2",
        totalChunks: 2,
        destinationRelativePath: "raw/s/c/st/broken.webm",
      }),
    ).rejects.toThrow(/Missing chunk 2 of 2/);

    // The canonical path must not hold a truncated take.
    await expect(
      stat(path.join(workdir, "uploads", "raw/s/c/st/broken.webm")),
    ).rejects.toThrow();
    // And no staging leftovers.
    const dir = path.join(workdir, "uploads", "raw/s/c/st");
    const leftovers = await readdir(dir).catch(() => [] as string[]);
    expect(leftovers).toHaveLength(0);
    // Chunks are gone even though we failed.
    await expect(stat(path.join(chunksRoot(), "up-2"))).rejects.toThrow();
  });
});

describe("sweepStaleLocalChunks", () => {
  it("removes abandoned chunk dirs older than the cutoff and keeps fresh ones", async () => {
    const { sweepStaleLocalChunks } = await import("./local");
    await stageChunk("old-upload", 0, "abandoned");
    await stageChunk("fresh-upload", 0, "in flight");

    const old = new Date(Date.now() - 48 * 60 * 60 * 1000);
    await utimes(path.join(chunksRoot(), "old-upload"), old, old);

    const removed = await sweepStaleLocalChunks(24 * 60 * 60 * 1000);

    expect(removed).toBe(1);
    await expect(stat(path.join(chunksRoot(), "old-upload"))).rejects.toThrow();
    // An upload still in progress must survive the sweep.
    expect((await stat(path.join(chunksRoot(), "fresh-upload"))).isDirectory()).toBe(true);
  });

  it("returns 0 when nothing has ever been staged", async () => {
    const { sweepStaleLocalChunks } = await import("./local");
    expect(await sweepStaleLocalChunks()).toBe(0);
  });
});
