import type { SyncEvent } from "../types.js";
import { plural } from "./plural.js";

/** The one-line reason a row is reported as skipped. */
function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Drive one sync run: opening event, one event per row, closing summary.
 *
 * A failure is contained to the row that caused it. Every connector used to
 * `await` its provider call straight inside the loop, so the first row that
 * threw ended the generator — one film whose Notion link carried a query string
 * (a 400 from TMDB) or one whose provider entry had since been deleted (a 404)
 * aborted the entire run. Because a row is only marked synced once it succeeds,
 * such a row stayed in the default "never synced" selection and killed the next
 * run too, and the one after that: the connector was bricked until the user
 * found the bad row by hand.
 *
 * A run where *nothing* succeeded still throws, so a systemic failure — an
 * expired Notion token, a provider that is down — surfaces as an error rather
 * than as a quiet "0 synced, 25 skipped".
 *
 * `handle` returns the title to report for the row. `label` names the row in a
 * skip message — without it "Skipped: status code 404" gives a user with 25
 * films no way to tell which one to go and fix.
 */
export async function* runSync<T>(
  items: T[],
  noun: string,
  handle: (item: T) => Promise<string>,
  label?: (item: T) => string | undefined,
): AsyncGenerator<SyncEvent> {
  const total = items.length;

  if (!total) {
    yield { message: "Already up to date.", current: 0, total: 0, done: true };

    return;
  }

  yield {
    message: `Syncing ${total} ${plural(total, noun)}…`,
    current: 0,
    total,
  };

  let current = 0;
  let synced = 0;
  let firstFailure: unknown;

  for (const item of items) {
    let message: string;

    try {
      message = `Loaded ${await handle(item)}.`;
      synced++;
    } catch (error) {
      if (!firstFailure) {
        firstFailure = error;
      }

      const where = label?.(item);

      message = where
        ? `Skipped ${where}: ${reason(error)}`
        : `Skipped: ${reason(error)}`;
    }

    current++;

    yield { message, current, total };
  }

  if (!synced) {
    throw firstFailure;
  }

  const skipped = total - synced;

  yield {
    message: skipped
      ? `Synced ${synced} ${plural(synced, noun)}, skipped ${skipped}.`
      : `Synced ${synced} ${plural(synced, noun)}.`,
    current: total,
    total,
    done: true,
  };
}
