import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { rm } from "node:fs/promises";

// Real filesystem round-trip through the storage module in local mode (the
// driver used when S3_ENDPOINT is unset). No DB, no network — the whole point
// is that a mocked test cannot tell you whether bytes actually survive the
// chunk -> assemble -> read -> stream -> delete path.
const school = randomUUID();
const course = randomUUID();
const student = randomUUID();
const submission = randomUUID();

afterAll(async () => {
  const { getLocalObjectPath } = await import("@/utils/storage/s3");
  await rm(getLocalObjectPath(`raw/${school}`), { recursive: true, force: true });
});

describe("local storage round-trip", () => {
  it("writes chunks, assembles, reads, streams, deletes", async () => {
    const s3 = await import("@/utils/storage/s3");
    expect(s3.isLocalStorage()).toBe(true);

    const uploadId = randomUUID();
    const key = `raw/${school}/${course}/${student}/${submission}.webm`;
    const payload = Buffer.from("fake-video-bytes-".repeat(100));
    const half = Math.floor(payload.length / 2);

    await s3.writeChunkToLocalUpload({ uploadId, chunkIndex: 0, chunk: payload.subarray(0, half) });
    await s3.writeChunkToLocalUpload({ uploadId, chunkIndex: 1, chunk: payload.subarray(half) });

    await s3.assembleS3Upload({
      uploadId,
      totalChunks: 2,
      destinationRelativePath: key,
      contentType: "video/webm",
    });

    const buf = await s3.getObjectBuffer(key);
    expect(buf.equals(payload)).toBe(true);
    expect(await s3.getLocalObjectSize(key)).toBe(payload.length);

    const chunks: Buffer[] = [];
    const stream = await s3.getObjectStream(key);
    for await (const c of stream) chunks.push(Buffer.from(c as Buffer));
    expect(Buffer.concat(chunks).equals(payload)).toBe(true);

    await s3.removeLocalUpload(key);
    await expect(s3.getObjectBuffer(key)).rejects.toThrow();
  });

  it("refuses to resolve a path outside the storage root", async () => {
    const s3 = await import("@/utils/storage/s3");
    expect(() => s3.getLocalObjectPath("../../etc/passwd")).toThrow(/outside the root/);
  });

  it("serves Range requests so video can seek", async () => {
    const s3 = await import("@/utils/storage/s3");
    const { serveLocalMedia } = await import("@/utils/storage/serve-local-media");

    const key = `raw/${school}/${course}/${student}/${randomUUID()}.webm`;
    const payload = Buffer.from("0123456789ABCDEF");
    await s3.writeBufferToLocalUpload(key, payload, "video/webm");

    const full = await serveLocalMedia(key, new Request("http://x/"));
    expect(full.status).toBe(200);
    expect(full.headers.get("accept-ranges")).toBe("bytes");
    expect(full.headers.get("content-type")).toBe("video/webm");

    const ranged = await serveLocalMedia(
      key,
      new Request("http://x/", { headers: { range: "bytes=4-7" } }),
    );
    expect(ranged.status).toBe(206);
    expect(ranged.headers.get("content-range")).toBe(`bytes 4-7/${payload.length}`);
    expect(await ranged.text()).toBe("4567");

    const suffix = await serveLocalMedia(
      key,
      new Request("http://x/", { headers: { range: "bytes=-4" } }),
    );
    expect(await suffix.text()).toBe("CDEF");

    const bad = await serveLocalMedia(
      key,
      new Request("http://x/", { headers: { range: "bytes=999-" } }),
    );
    expect(bad.status).toBe(416);

    const missing = await serveLocalMedia("raw/does/not/exist.webm", new Request("http://x/"));
    expect(missing.status).toBe(404);
  });
});
