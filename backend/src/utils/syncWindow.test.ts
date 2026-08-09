import { describe, expect, test } from "bun:test";
import { MAX_SYNC_AGE_DAYS, staleBefore } from "./syncWindow.js";

const NOW = Date.parse("2026-08-09T12:00:00.000Z");
const DAY = 86_400_000;

describe("staleBefore", () => {
  test("no value means new rows only", () => {
    // The cheap default: rows that have never been synced. Widening this by
    // accident would re-fetch and overwrite every row in someone's database.
    expect(staleBefore(undefined, NOW)).toBeUndefined();
    expect(staleBefore(null, NOW)).toBeUndefined();
    expect(staleBefore("", NOW)).toBeUndefined();
  });

  test("an age becomes that many days back", () => {
    expect(staleBefore(7, NOW)).toBe(new Date(NOW - 7 * DAY).toISOString());
    expect(staleBefore("30", NOW)).toBe(new Date(NOW - 30 * DAY).toISOString());
  });

  test("zero means everything, however recent", () => {
    expect(staleBefore(0, NOW)).toBe(new Date(NOW).toISOString());
    expect(staleBefore("0", NOW)).toBe(new Date(NOW).toISOString());
  });

  test("a nonsense value falls back to the narrowest sync, not the widest", () => {
    for (const bad of ["abc", "-1", -1, Number.NaN, Infinity, {}, []]) {
      expect(staleBefore(bad, NOW)).toBeUndefined();
    }
  });

  test("refuses an absurd age rather than sweeping the whole database", () => {
    expect(staleBefore(MAX_SYNC_AGE_DAYS, NOW)).toBeDefined();
    expect(staleBefore(MAX_SYNC_AGE_DAYS + 1, NOW)).toBeUndefined();
  });

  test("a larger age always reaches further back", () => {
    const week = staleBefore(7, NOW)!;
    const month = staleBefore(30, NOW)!;

    expect(Date.parse(month)).toBeLessThan(Date.parse(week));
  });
});
