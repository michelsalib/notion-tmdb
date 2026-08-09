import { describe, expect, test } from "bun:test";
import type { SyncEvent } from "../types.js";
import { runSync } from "./syncRun.js";

async function collect(
  generator: AsyncGenerator<SyncEvent>,
): Promise<SyncEvent[]> {
  const events: SyncEvent[] = [];

  for await (const event of generator) {
    events.push(event);
  }

  return events;
}

describe("runSync", () => {
  test("reports an empty selection as up to date", async () => {
    const events = await collect(runSync([], "film", async () => "unused"));

    expect(events).toEqual([
      { message: "Already up to date.", current: 0, total: 0, done: true },
    ]);
  });

  test("counts every row against the total", async () => {
    const events = await collect(
      runSync(["a", "b"], "film", async (item) => item.toUpperCase()),
    );

    expect(events).toEqual([
      { message: "Syncing 2 films…", current: 0, total: 2 },
      { message: "Loaded A.", current: 1, total: 2 },
      { message: "Loaded B.", current: 2, total: 2 },
      { message: "Synced 2 films.", current: 2, total: 2, done: true },
    ]);
  });

  test("singularises a one-row run", async () => {
    const events = await collect(runSync(["a"], "film", async () => "A"));

    expect(events[0]?.message).toBe("Syncing 1 film…");
    expect(events.at(-1)?.message).toBe("Synced 1 film.");
  });

  // The regression this file exists for. One row whose TMDB link carried a
  // query string 400'd, and because the failure propagated out of the loop the
  // other 24 rows of the run were never touched — and, still unsynced, were
  // picked up and killed by the next run too.
  test("keeps a failing row from ending the run", async () => {
    const events = await collect(
      runSync(["good", "bad", "other"], "film", async (item) => {
        if (item === "bad") {
          throw new Error("Request failed with status code 400");
        }

        return item;
      }),
    );

    expect(events.map((e) => e.message)).toEqual([
      "Syncing 3 films…",
      "Loaded good.",
      "Skipped: Request failed with status code 400",
      "Loaded other.",
      "Synced 2 films, skipped 1.",
    ]);
    expect(events.at(-1)?.done).toBe(true);
  });

  // "Skipped: status code 404" leaves a user with 25 films no way to tell which
  // row to go and fix.
  test("names the row it skipped", async () => {
    const events = await collect(
      runSync(
        ["bad", "good"],
        "film",
        async (item) => {
          if (item === "bad") {
            throw new Error("status code 404");
          }

          return item;
        },
        (item) => `https://www.themoviedb.org/movie/${item}`,
      ),
    );

    expect(events[1]?.message).toBe(
      "Skipped https://www.themoviedb.org/movie/bad: status code 404",
    );
  });

  test("falls back to an unnamed skip when there is no label", async () => {
    const events = await collect(
      runSync(
        ["bad", "good"],
        "film",
        async (item) => {
          if (item === "bad") {
            throw new Error("status code 404");
          }

          return item;
        },
        () => undefined,
      ),
    );

    expect(events[1]?.message).toBe("Skipped: status code 404");
  });

  // Containing per-row failures must not turn "the token expired" into a quiet
  // success, so a run where nothing at all worked still surfaces as an error.
  test("throws when no row succeeded", async () => {
    const failing = runSync(["a", "b"], "film", async () => {
      throw new Error("API token is invalid");
    });

    expect(collect(failing)).rejects.toThrow("API token is invalid");
  });

  test("reports the first failure, not the last", async () => {
    const failing = runSync(["a", "b"], "film", async (item) => {
      throw new Error(`failed on ${item}`);
    });

    expect(collect(failing)).rejects.toThrow("failed on a");
  });
});
