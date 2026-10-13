import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:crypto", () => ({
  randomUUID: vi.fn(() => "22222222-2222-4222-8222-222222222222"),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((left: unknown, right: unknown) => ({ type: "eq", left, right })),
  and: vi.fn((...conditions: unknown[]) => ({ type: "and", conditions })),
}));

vi.mock("@lingua/db", () => ({
  activities: { id: "id", teacherId: "teacher_id", schoolId: "school_id", referenceAudioPath: "reference_audio_path" },
  withClaims: vi.fn(),
  buildStoragePath: vi.fn(() => "reference/school-1/activity-1/teacher-1/asset.webm"),
}));

vi.mock("@/utils/auth/dal", () => ({
  requireRole: vi.fn(),
  toAuthClaims: vi.fn(() => ({ sub: "teacher-1", school_id: "school-1", role: "teacher" })),
}));

const writeBufferToLocalUpload = vi.fn(async (..._a: unknown[]) => {});
const removeLocalUpload = vi.fn(async (..._a: unknown[]) => {});
vi.mock("@/utils/storage/s3", () => ({
  writeBufferToLocalUpload: (...a: unknown[]) => writeBufferToLocalUpload(...a),
  removeLocalUpload: (...a: unknown[]) => removeLocalUpload(...a),
}));

const TEACHER = {
  id: "teacher-1",
  email: "teacher@example.com",
  schoolId: "school-1",
  role: "teacher" as const,
};

function params() {
  return { params: Promise.resolve({ id: "22222222-2222-4222-8222-000000000001" }) };
}

function requestWith(file: File | null): Request {
  const form = new FormData();
  if (file) form.set("file", file);
  return new Request("http://localhost", { method: "POST", body: form });
}

function audioFile(bytes: number, type = "audio/webm"): File {
  return new File([new Uint8Array(bytes)], "take.webm", { type });
}

/** withClaims returning the activity lookup and recording the update. */
function installActivity(activityRow: unknown[]) {
  const limit = vi.fn().mockResolvedValue(activityRow);
  const returning = vi.fn().mockResolvedValue([{ id: "22222222-2222-4222-8222-000000000001" }]);
  const update = vi.fn(() => ({ set: () => ({ where: () => ({ returning }) }) }));
  const select = () => ({ from: () => ({ where: () => ({ limit }) }) });
  return { select, update };
}

describe("POST /api/activities/[id]/reference-audio", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { requireRole } = await import("@/utils/auth/dal");
    vi.mocked(requireRole).mockResolvedValue(TEACHER);
  });

  it("400s when no file is present", async () => {
    const { POST } = await import("./route");
    const response = await POST(requestWith(null), params());
    expect(response.status).toBe(400);
  });

  it("413s when the file exceeds the size cap", async () => {
    const { POST } = await import("./route");
    const big = audioFile(20 * 1024 * 1024 + 1);
    const response = await POST(requestWith(big), params());
    expect(response.status).toBe(413);
  });

  it("413s when the file is empty", async () => {
    const { POST } = await import("./route");
    const response = await POST(requestWith(audioFile(0)), params());
    expect(response.status).toBe(413);
  });

  it("400s on an unsupported mime type", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      requestWith(audioFile(1024, "audio/flac")),
      params(),
    );
    expect(response.status).toBe(400);
  });

  it("404s when the activity is not owned by the caller", async () => {
    const { POST } = await import("./route");
    const { withClaims } = await import("@lingua/db");
    const { select } = installActivity([]); // not found under teacher scope
    vi.mocked(withClaims).mockImplementation(async (_c, cb) =>
      cb({ select } as never),
    );

    const response = await POST(requestWith(audioFile(2048)), params());
    const json = await response.json();
    expect(response.status).toBe(404);
    expect(json).toEqual({ error: "Activity not found." });
    expect(writeBufferToLocalUpload).not.toHaveBeenCalled();
  });

  it("stores the audio and returns 201 with a media URL (no raw path leaked)", async () => {
    const { POST } = await import("./route");
    const { withClaims } = await import("@lingua/db");
    const { select, update } = installActivity([
      { id: "22222222-2222-4222-8222-000000000001", schoolId: "school-1", referenceAudioPath: null },
    ]);
    vi.mocked(withClaims).mockImplementation(async (_c, cb) =>
      cb({ select, update } as never),
    );

    const response = await POST(requestWith(audioFile(4096)), params());
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.referenceAudioUrl).toBe(
      "/api/activities/22222222-2222-4222-8222-000000000001/reference-media",
    );
    expect(writeBufferToLocalUpload).toHaveBeenCalledOnce();
    // Canonical storage path is server-side only.
    expect(JSON.stringify(json)).not.toContain("reference/school-1");
  });
});
