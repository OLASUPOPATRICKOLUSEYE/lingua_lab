import { afterEach, describe, expect, it, vi } from "vitest";
import { getAiServiceHealth } from "./health-client";

describe("AI health client", () => {
  const originalFetch = global.fetch;
  const originalAiServiceUrl = process.env.AI_SERVICE_URL;

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.AI_SERVICE_URL = originalAiServiceUrl;
    vi.restoreAllMocks();
  });

  it("returns a valid health payload", async () => {
    process.env.AI_SERVICE_URL = "http://ai.internal:8000";
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "ok",
        storage_root: "/tmp/uploads",
        transcribe_model: "medium",
        transcribe_device: "cpu",
        vad_loaded: true,
        require_vad: false,
        whisper_error: null,
        vad_error: null,
        ready: true,
      }),
    }) as typeof fetch;

    await expect(getAiServiceHealth()).resolves.toEqual({
      status: "ok",
      storage_root: "/tmp/uploads",
      transcribe_model: "medium",
      transcribe_device: "cpu",
      vad_loaded: true,
      require_vad: false,
      whisper_error: null,
      vad_error: null,
      ready: true,
    });
  });

  it("fails clearly when the service returns a non-200 response", async () => {
    process.env.AI_SERVICE_URL = "http://ai.internal:8000";
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => "service unavailable",
    }) as typeof fetch;

    await expect(getAiServiceHealth()).rejects.toThrow(
      "AI health request failed with status 503: service unavailable",
    );
  });

  it("fails clearly when the response shape is invalid", async () => {
    process.env.AI_SERVICE_URL = "http://ai.internal:8000";
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "ok",
      }),
    }) as typeof fetch;

    await expect(getAiServiceHealth()).rejects.toThrow(
      "AI health response was invalid: Invalid input: expected string, received undefined",
    );
  });

  it("requires AI_SERVICE_URL", async () => {
    process.env.AI_SERVICE_URL = "";

    await expect(getAiServiceHealth()).rejects.toThrow(
      "AI_SERVICE_URL is not set. Set it before checking AI service health.",
    );
  });
});
