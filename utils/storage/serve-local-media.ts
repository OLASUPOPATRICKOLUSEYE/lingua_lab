import "server-only";

import { createReadStream } from "node:fs";
import {
  contentTypeFromKey,
  getLocalObjectPath,
  getLocalObjectSize,
} from "@/utils/storage/s3";

/**
 * Streams a locally-stored media object back to the browser.
 *
 * Only used when object storage is unconfigured (dev). The S3 path redirects to
 * a presigned URL and lets the object store serve the bytes; with no object
 * store there is nothing to redirect to, so the app serves them itself.
 *
 * Range support is not optional here: a <video> element issues a Range request
 * to seek, and Safari will refuse to play a media response that does not
 * advertise `Accept-Ranges`. Serving the whole file with a 200 makes video look
 * broken even when the bytes are perfectly fine.
 */
export async function serveLocalMedia(
  relativePath: string,
  request: Request,
  contentType?: string,
): Promise<Response> {
  let size: number;
  try {
    size = await getLocalObjectSize(relativePath);
  } catch {
    return Response.json({ error: "Media not found." }, { status: 404 });
  }

  const absolutePath = getLocalObjectPath(relativePath);
  const type = contentType ?? contentTypeFromKey(relativePath);
  const rangeHeader = request.headers.get("range");

  const baseHeaders: Record<string, string> = {
    "content-type": type,
    "accept-ranges": "bytes",
    // Dev-only media; never let a stale take be served after a re-record.
    "cache-control": "no-store",
  };

  if (!rangeHeader) {
    return new Response(toWebStream(createReadStream(absolutePath)), {
      status: 200,
      headers: { ...baseHeaders, "content-length": String(size) },
    });
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match) {
    return new Response(null, {
      status: 416,
      headers: { "content-range": `bytes */${size}` },
    });
  }

  const [, rawStart, rawEnd] = match;
  // A suffix range ("bytes=-500") means the LAST n bytes, not from zero.
  const isSuffix = rawStart === "";
  const start = isSuffix
    ? Math.max(0, size - Number(rawEnd || 0))
    : Number(rawStart);
  const end = isSuffix || rawEnd === "" ? size - 1 : Number(rawEnd);

  if (
    Number.isNaN(start) ||
    Number.isNaN(end) ||
    start > end ||
    start >= size
  ) {
    return new Response(null, {
      status: 416,
      headers: { "content-range": `bytes */${size}` },
    });
  }

  const clampedEnd = Math.min(end, size - 1);
  return new Response(
    toWebStream(createReadStream(absolutePath, { start, end: clampedEnd })),
    {
      status: 206,
      headers: {
        ...baseHeaders,
        "content-range": `bytes ${start}-${clampedEnd}/${size}`,
        "content-length": String(clampedEnd - start + 1),
      },
    },
  );
}

type NodeReadable = ReturnType<typeof createReadStream>;

/** Node Readable → Web ReadableStream, which is what a Response body needs. */
function toWebStream(stream: NodeReadable): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      stream.on("data", (chunk: string | Buffer) => {
        controller.enqueue(
          typeof chunk === "string"
            ? new TextEncoder().encode(chunk)
            : new Uint8Array(chunk),
        );
      });
      stream.on("end", () => controller.close());
      stream.on("error", (error) => controller.error(error));
    },
    cancel() {
      stream.destroy();
    },
  });
}
