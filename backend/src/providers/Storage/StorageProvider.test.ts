import { describe, expect, test } from "bun:test";
import { backupObjectDate, backupObjectName } from "./StorageProvider.js";

describe("backupObjectName", () => {
  test("stamps the run without characters that break an extraction", () => {
    expect(backupObjectName(new Date("2026-08-09T14:31:07.482Z"))).toBe(
      "2026-08-09T14-31-07Z.zip",
    );
  });

  test("sorts lexicographically in time order", () => {
    const names = [
      new Date("2026-08-09T14:31:07Z"),
      new Date("2025-12-31T23:59:59Z"),
      new Date("2026-08-09T09:00:00Z"),
    ]
      .map(backupObjectName)
      .sort();

    expect(names).toEqual([
      "2025-12-31T23-59-59Z.zip",
      "2026-08-09T09-00-00Z.zip",
      "2026-08-09T14-31-07Z.zip",
    ]);
  });
});

describe("backupObjectDate", () => {
  test("round-trips a name back to the instant it encodes", () => {
    const date = new Date("2026-08-09T14:31:07.000Z");

    expect(backupObjectDate(backupObjectName(date))).toEqual(date);
  });

  test.each([
    ["a legacy flat object", "user-1.zip"],
    ["a half-written temp file", "2026-08-09T14-31-07Z.zip.part"],
    ["something else entirely", "manifest.json"],
    ["a stamp that is not a real time", "2026-13-45T99-99-99Z.zip"],
  ])("returns undefined for %s", (_label, name) => {
    expect(backupObjectDate(name)).toBeUndefined();
  });
});
