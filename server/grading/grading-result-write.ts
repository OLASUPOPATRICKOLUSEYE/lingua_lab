import type { PgTable } from "drizzle-orm/pg-core";

export function isMissingWordTimestampsColumnError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const stack: Error[] = [error];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    if (
      current.message.includes("word_timestamps") &&
      current.message.includes("does not exist")
    ) {
      return true;
    }

    const nestedCause = (current as Error & { cause?: unknown }).cause;
    if (nestedCause instanceof Error) {
      stack.push(nestedCause);
    }
  }

  return false;
}

export async function insertGradingResultCompat(
  tx: {
    insert: (table: PgTable) => {
      values: (values: Record<string, unknown>) => Promise<unknown>;
    };
  },
  table: PgTable,
  values: Record<string, unknown>,
): Promise<void> {
  try {
    await tx.insert(table).values(values);
  } catch (error) {
    if (!isMissingWordTimestampsColumnError(error)) {
      throw error;
    }

    const legacyValues = { ...values };
    delete legacyValues.wordTimestamps;
    await tx.insert(table).values(legacyValues);
  }
}
