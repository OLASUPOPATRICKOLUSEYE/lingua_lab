import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:crypto", () => ({
  randomUUID: vi.fn(() => "22222222-2222-4222-8222-222222222222"),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((left: unknown, right: unknown) => ({ type: "eq", left, right })),
  and: vi.fn((...conditions: unknown[]) => ({ type: "and", conditions })),
}));

vi.mock("@lingua/db", () => ({
  activities: {
    id: "id",
    teacherId: "teacher_id",
    schoolId: "school_id",
    referenceVideoPath: "reference_video_path",
  },
  withClaims: vi.fn(),
  buildStoragePath: vi.fn(() => "reference/school-1/activity-1/teacher-1/asset.webm"),
}));

vi.mock("@/utils/auth/dal", () => ({
  requireRole: vi.fn(),
  toAuthClaims: vi.fn(() => ({ sub: "teacher-1", school_id: "school-1", role: "teacher" })),
}));

const writeChunkToLocalUpload = vi.fn(async (..._a: unknown[]) => {});
const assembleS3Upload = vi.fn(async (..._a: unknown[]) => {});
const removeLocalChunkUpload = vi.fn(async (..._a: unknown[]) => {});
const removeLocalUpload = vi.fn(async (..._a: unknown[]) => {});
vi.mock("@/utils/storage/s3", () => ({
  writeChunkToLocalUpload: (...a: unknown[]) => writeChunkToLocalUpload(...a),
  assembleS3Upload: (...a: unknown[]) => assembleS3Upload(...a),
  removeLocalChunkUpload: (...a: unknown[]) => removeLocalChunkUpload(...a),
  removeLocalUpload: (...a: unknown[]) => removeLocalUpload(...a),
}));

const TEACHER = {
  id: "teacher-1",
  email: "teacher@example.com",
  schoolId: "school-1",
  role: "teacher" as const,
};

function params() {
  return { params: Promise.resolve({ id: "activity-1" }) };
}

function videoChunk(bytes: number, type = "video/webm"): File {
  return new File([new Uint8Array(bytes)], "chunk", { type });
}

function chunkRequest(opts: {
  chunk: File | null;
  chunkIndex?: number;
  totalChunks?: number;
  mimeType?: string;
}): Request {
  const form = new FormData();
  form.set("uploadId", "33333333-3333-4333-8333-333333333333");
  form.set("chunkIndex", String(opts.chunkIndex ?? 0));
  form.set("totalChunks", String(opts.totalChunks ?? 1));
  form.set("mimeType", opts.mimeType ?? "video/webm");
  if (opts.chunk) form.set("chunk", opts.chunk);
  return new Request("http://localhost", { method: "POST", body: form });
}

/** withClaims returning the activity lookup and recording the update. */
function installActivity(activityRow: unknown[]) {
  const limit = vi.fn().mockResolvedValue(activityRow);
  const returning = vi.fn().mockResolvedValue([{ id: "activity-1" }]);
  const update = vi.fn(() => ({ set: () => ({ where: () => ({ returning }) }) }));
  const select = () => ({ from: () => ({ where: () => ({ limit }) }) });
  return { select, update };
}

describe("POST /api/activities/[id]/reference-video", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { requireRole } = await import("@/utils/auth/dal");
    vi.mocked(requireRole).mockResolvedValue(TEACHER);
  });

  it("400s on an unsupported mime type", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      chunkRequest({ chunk: videoChunk(1024, "video/x-matroska"), mimeType: "video/x-matroska" }),
      params(),
    );
    expect(response.status).toBe(400);
  });

  it("400s when the chunk is empty", async () => {
    const { POST } = await import("./route");
    const response = await POST(chunkRequest({ chunk: videoChunk(0) }), params());
    expect(response.status).toBe(400);
  });

  it("413s when a chunk exceeds the per-chunk cap", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      chunkRequest({ chunk: videoChunk(5 * 1024 * 1024 + 1) }),
      params(),
    );
    expect(response.status).toBe(413);
  });

  it("404s when the activity is not owned by the caller", async () => {
    const { POST } = await import("./route");
    const { withClaims } = await import("@lingua/db");
    const { select } = installActivity([]); // not found under teacher scope
    vi.mocked(withClaims).mockImplementation(async (_c, cb) => cb({ select } as never));

    const response = await POST(chunkRequest({ chunk: videoChunk(2048) }), params());
    const json = await response.json();
    expect(response.status).toBe(404);
    expect(json).toEqual({ error: "Activity not found." });
    expect(assembleS3Upload).not.toHaveBeenCalled();
    // Stray chunks for a foreign activity are cleaned up.
    expect(removeLocalChunkUpload).toHaveBeenCalledOnce();
  });

  it("202s for a non-final chunk without assembling", async () => {
    const { POST } = await import("./route");
    const { withClaims } = await import("@lingua/db");
    const { select } = installActivity([
      { id: "activity-1", schoolId: "school-1", referenceVideoPath: null },
    ]);
    vi.mocked(withClaims).mockImplementation(async (_c, cb) => cb({ select } as never));

    const response = await POST(
      chunkRequest({ chunk: videoChunk(4096), chunkIndex: 0, totalChunks: 2 }),
      params(),
    );
    expect(response.status).toBe(202);
    expect(writeChunkToLocalUpload).toHaveBeenCalledOnce();
    expect(assembleS3Upload).not.toHaveBeenCalled();
  });

  it("assembles the final chunk and returns 201 with a media URL (no raw path leaked)", async () => {
    const { POST } = await import("./route");
    const { withClaims } = await import("@lingua/db");
    const { select, update } = installActivity([
      { id: "activity-1", schoolId: "school-1", referenceVideoPath: null },
    ]);
    vi.mocked(withClaims).mockImplementation(async (_c, cb) =>
      cb({ select, update } as never),
    );

    const response = await POST(
      chunkRequest({ chunk: videoChunk(4096), chunkIndex: 0, totalChunks: 1 }),
      params(),
    );
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.referenceVideoUrl).toBe(
      "/api/activities/activity-1/reference-media?kind=video",
    );
    expect(assembleS3Upload).toHaveBeenCalledOnce();
    // Canonical storage path is server-side only.
    expect(JSON.stringify(json)).not.toContain("reference/school-1");
  });
});
