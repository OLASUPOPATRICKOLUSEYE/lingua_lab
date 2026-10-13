import { z } from "zod";

const healthResponseSchema = z.object({
  status: z.string().min(1),
  storage_root: z.string().min(1),
  transcribe_model: z.string().min(1),
  transcribe_device: z.string().min(1),
  vad_loaded: z.boolean(),
  require_vad: z.boolean(),
  whisper_error: z.string().nullable(),
  vad_error: z.string().nullable(),
  ready: z.boolean(),
});

export type AiHealth = z.infer<typeof healthResponseSchema>;

function getAiServiceUrl(): string {
  const url = process.env.AI_SERVICE_URL?.trim();
  if (!url) {
    throw new Error(
      "AI_SERVICE_URL is not set. Set it before checking AI service health.",
    );
  }
  return url.replace(/\/+$/, "");
}

export async function getAiServiceHealth(): Promise<AiHealth> {
  const response = await fetch(`${getAiServiceUrl()}/health`);

  if (!response.ok) {
    throw new Error(
      `AI health request failed with status ${response.status}: ${await response.text()}`,
    );
  }

  const parsed = healthResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error(
      `AI health response was invalid: ${parsed.error.issues[0]?.message ?? "unknown error"}`,
    );
  }

  return parsed.data;
}
