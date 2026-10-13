import { and, eq, like } from "drizzle-orm";
import type { TenantTx } from "@lingua/db";
import { gradingResults } from "@lingua/db";

const MANUAL_MODEL_PREFIX = "teacher-manual-v";

export async function getNextManualModelVersion(
  tx: TenantTx,
  submissionId: string,
): Promise<string> {
  const manualRows = await tx
    .select({
      modelVersion: gradingResults.modelVersion,
    })
    .from(gradingResults)
    .where(
      and(
        eq(gradingResults.submissionId, submissionId),
        like(gradingResults.modelVersion, `${MANUAL_MODEL_PREFIX}%`),
      ),
    );

  const nextVersion =
    manualRows
      .map((row) => row.modelVersion.match(/^teacher-manual-v(\d+)$/)?.[1])
      .map((value) => (value ? Number.parseInt(value, 10) : 0))
      .reduce((max, value) => Math.max(max, value), 0) + 1;

  return `${MANUAL_MODEL_PREFIX}${nextVersion}`;
}
