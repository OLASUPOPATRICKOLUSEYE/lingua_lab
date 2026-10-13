import { access } from "node:fs/promises";
import path from "node:path";
import { gradeSubmissionWithAi } from "./grading-client";
import { getAiServiceHealth } from "./health-client";

const DEFAULT_IDS = {
  submissionId: "11111111-1111-1111-8111-111111111111",
  schoolId: "22222222-2222-2222-8222-222222222222",
  studentId: "33333333-3333-3333-8333-333333333333",
  activityId: "44444444-4444-4444-8444-444444444444",
} as const;

function getProcessedPathArg(): string {
  const value = process.argv[2]?.trim();
  if (!value) {
    throw new Error(
      "Usage: pnpm ai:smoke <processed-path>. Example: pnpm ai:smoke uploads/processed/.../submission.wav",
    );
  }
  return value;
}

async function assertFileExists(filePath: string): Promise<void> {
  await access(filePath);
}

async function main(): Promise<void> {
  const inputPath = getProcessedPathArg();
  const absolutePath = path.resolve(process.cwd(), inputPath);

  await assertFileExists(absolutePath);

  console.log(`[ai:smoke] checking health at ${process.env.AI_SERVICE_URL ?? "<unset>"}`);
  const health = await getAiServiceHealth();
  console.log(
    `[ai:smoke] health status=${health.status} ready=${String(health.ready)} model=${health.transcribe_model} device=${health.transcribe_device}`,
  );

  console.log(`[ai:smoke] grading ${absolutePath}`);
  const result = await gradeSubmissionWithAi({
    ...DEFAULT_IDS,
    processedPath: absolutePath,
  });

  console.log("[ai:smoke] success");
  console.log(
    JSON.stringify(
      {
        transcript: result.transcript,
        wpm: result.wpm,
        fluencyScore: result.fluencyScore,
        pronunciationScore: result.pronunciationScore,
        cefrEstimate: result.cefrEstimate,
        modelVersion: result.modelVersion,
      },
      null,
      2,
    ),
  );
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[ai:smoke] failed: ${message}`);
  process.exit(1);
});
