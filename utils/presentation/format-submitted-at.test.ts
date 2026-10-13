import { describe, expect, it } from "vitest";
import { formatSubmittedAt } from "./submission";

/**
 * Regression: the gradebook passed a raw Postgres timestamp STRING here (a raw
 * `sql` fragment bypasses Drizzle's column mapper), Intl threw RangeError, and
 * the whole server-rendered page 500'd. A bad value must cost one cell.
 */
describe("formatSubmittedAt", () => {
  it("formats a Date", () => {
    expect(formatSubmittedAt(new Date("2026-08-13T17:43:32Z"))).toMatch(/Aug 13/);
  });

  it("formats the raw pg timestamp string shape", () => {
    expect(formatSubmittedAt("2026-08-13 17:43:32.388992+01")).toMatch(/Aug 13/);
  });

  it("returns a dash for null/undefined instead of throwing", () => {
    expect(formatSubmittedAt(null)).toBe("—");
    expect(formatSubmittedAt(undefined)).toBe("—");
  });

  it("returns a dash for an unparseable value instead of throwing", () => {
    expect(formatSubmittedAt("not a date")).toBe("—");
    expect(formatSubmittedAt(new Date("nonsense"))).toBe("—");
  });
});
