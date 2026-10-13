import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((left: unknown, right: unknown) => ({ type: "eq", left, right })),
  and: vi.fn((...conditions: unknown[]) => ({ type: "and", conditions })),
}));

vi.mock("@lingua/db", () => ({
  activities: {
    id: "id",
    teacherId: "teacher_id",
    title: "title",
    targetLanguage: "target_language",
    passageText: "passage_text",
    coachNote: "coach_note",
    teacherReferenceText: "teacher_reference_text",
    referenceAudioPath: "reference_audio_path",
  },
  withClaims: vi.fn(),
}));

vi.mock("@/utils/auth/dal", () => ({
  requireRole: vi.fn(),
  toAuthClaims: vi.fn(() => ({
    sub: "teacher-1",
    school_id: "school-1",
    role: "teacher",
  })),
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

describe("/api/activities/[id]", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { requireRole } = await import("@/utils/auth/dal");
    vi.mocked(requireRole).mockResolvedValue(TEACHER);
  });

  describe("GET", () => {
    it("returns 404 when the activity is not visible to the caller", async () => {
      const { GET } = await import("./route");
      const { withClaims } = await import("@lingua/db");

      const limit = vi.fn().mockResolvedValue([]);
      vi.mocked(withClaims).mockImplementation(async (_c, cb) =>
        cb({
          select: () => ({ from: () => ({ where: () => ({ limit }) }) }),
        } as never),
      );

      const response = await GET(new Request("http://localhost"), params());
      expect(response.status).toBe(404);
    });

    it("returns the activity with a reference-media URL only when audio exists", async () => {
      const { GET } = await import("./route");
      const { withClaims } = await import("@lingua/db");

      const limit = vi.fn().mockResolvedValue([
        {
          id: "activity-1",
          title: "La gare",
          targetLanguage: "French",
          passageText: "…",
          coachNote: "note",
          teacherReferenceText: "…",
          referenceAudioPath: "reference/school-1/activity-1/teacher-1/x.webm",
        },
      ]);
      vi.mocked(withClaims).mockImplementation(async (_c, cb) =>
        cb({
          select: () => ({ from: () => ({ where: () => ({ limit }) }) }),
        } as never),
      );

      const response = await GET(new Request("http://localhost"), params());
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.activity.referenceAudioUrl).toBe(
        "/api/activities/activity-1/reference-media",
      );
      // Internal storage path is NOT leaked to the client.
      expect(JSON.stringify(json)).not.toContain("reference/school-1");
    });
  });

  describe("PATCH", () => {
    const validBody = {
      passageTitle: "Updated passage",
      targetLanguage: "English",
      passageText:
        "After school, Daniel walked home under a grey sky and the rain.",
      coachNote: "Land the endings.",
    };

    function patch(body: unknown): Request {
      return new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    }

    it("rejects an invalid payload with 400", async () => {
      const { PATCH } = await import("./route");
      const { withClaims } = await import("@lingua/db");

      const response = await PATCH(
        patch({ ...validBody, passageText: "short" }),
        params(),
      );

      expect(response.status).toBe(400);
      expect(withClaims).not.toHaveBeenCalled();
    });

    it("returns 404 when the scoped update matches no row", async () => {
      const { PATCH } = await import("./route");
      const { withClaims } = await import("@lingua/db");

      const returning = vi.fn().mockResolvedValue([]);
      vi.mocked(withClaims).mockImplementation(async (_c, cb) =>
        cb({
          update: () => ({ set: () => ({ where: () => ({ returning }) }) }),
        } as never),
      );

      const response = await PATCH(patch(validBody), params());
      expect(response.status).toBe(404);
    });

    it("updates and returns the row on success", async () => {
      const { PATCH } = await import("./route");
      const { withClaims } = await import("@lingua/db");

      const returning = vi
        .fn()
        .mockResolvedValue([{ id: "activity-1", title: "Updated passage" }]);
      vi.mocked(withClaims).mockImplementation(async (_c, cb) =>
        cb({
          update: () => ({ set: () => ({ where: () => ({ returning }) }) }),
        } as never),
      );

      const response = await PATCH(patch(validBody), params());
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json).toEqual({
        ok: true,
        activity: { id: "activity-1", title: "Updated passage" },
      });
    });
  });
});
