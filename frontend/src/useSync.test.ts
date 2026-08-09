import { describe, expect, test } from "bun:test";
import { advance, relativeTime, type SyncState, toEvent } from "./useSync";

const IDLE: SyncState = { running: false, message: "" };
const msg = (data: unknown) => ({ type: "message" as const, data });
const err = (data: unknown) => ({ type: "error" as const, data });

describe("toEvent", () => {
  test("wraps the bare strings the backup connectors yield", () => {
    expect(toEvent("Backup created.")).toEqual({ message: "Backup created." });
  });

  test("passes through a structured event", () => {
    expect(toEvent({ message: "Loaded Dune.", current: 3, total: 40 })).toEqual(
      {
        message: "Loaded Dune.",
        current: 3,
        total: 40,
      },
    );
  });

  test("survives a malformed chunk", () => {
    expect(toEvent(null)).toEqual({ message: "" });
    expect(toEvent(undefined)).toEqual({ message: "" });
    expect(toEvent({})).toEqual({ message: "" });
  });
});

describe("advance", () => {
  test("keeps the denominator once the opening event has set it", () => {
    // Only the first event of a run carries `total`; losing it here is what
    // turns real progress back into a number with no scale.
    let state = advance(IDLE, msg({ message: "Syncing 40 films…", total: 40 }));
    expect(state.total).toBe(40);

    state = advance(state, msg({ message: "Loaded Dune.", current: 12 }));
    expect(state).toMatchObject({
      running: true,
      message: "Loaded Dune.",
      current: 12,
      total: 40,
    });
  });

  test("a bare-string chunk does not wipe the counts", () => {
    let state = advance(
      IDLE,
      msg({ message: "Syncing", current: 1, total: 9 }),
    );
    state = advance(state, msg("Still working…"));

    expect(state).toMatchObject({
      message: "Still working…",
      current: 1,
      total: 9,
    });
  });

  test("an error keeps the counts and flags the failure", () => {
    let state = advance(
      IDLE,
      msg({ message: "Syncing", current: 5, total: 9 }),
    );
    state = advance(state, err("Notion rejected the write"));

    expect(state).toMatchObject({
      error: true,
      message: "Notion rejected the write",
      current: 5,
      total: 9,
    });
  });

  test("leaves counts undefined for a connector that reports none", () => {
    const state = advance(IDLE, msg("Backup created."));

    expect(state.current).toBeUndefined();
    expect(state.total).toBeUndefined();
  });
});

describe("relativeTime", () => {
  const now = Date.parse("2026-08-09T12:00:00Z");
  const ago = (ms: number) => relativeTime(now - ms, now);

  test("reads as freshness, not as a timestamp", () => {
    expect(ago(2_000)).toBe("just now");
    expect(ago(45_000)).toBe("45 seconds ago");
    expect(ago(60_000)).toBe("1 minute ago");
    expect(ago(9 * 60_000)).toBe("9 minutes ago");
    expect(ago(3 * 3_600_000)).toBe("3 hours ago");
    expect(ago(2 * 86_400_000)).toBe("2 days ago");
  });

  test("falls back to a date once it is no longer recent", () => {
    expect(ago(60 * 86_400_000)).toMatch(/\d/);
    expect(ago(60 * 86_400_000)).not.toContain("ago");
  });

  test("never reports a negative age from a clock skew", () => {
    expect(relativeTime(now + 60_000, now)).toBe("just now");
  });
});
