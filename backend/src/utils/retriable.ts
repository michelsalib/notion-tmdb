import type { Logger } from "../fx/logger/Logger.js";

type ReducedObject<T, R> = {
  [K in keyof T]: T[K] extends R ? K : never;
}[keyof T];

const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 250;

// 4xx means the request itself is wrong — repeating it verbatim just burns the
// provider's rate limit. 429 is the exception: it explicitly invites a retry.
function isRetriable(err: unknown): boolean {
  const status = (err as { response?: { status?: number } })?.response?.status;

  if (status == null) {
    return true; // network error / timeout — no response ever arrived
  }

  return status === 429 || status >= 500;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wraps one method of `instance` so transient failures are retried.
 *
 * Previously this retried exactly once, immediately, for *any* error — a 400
 * was hammered the same as a 503 — and reported through raw `console.error`,
 * so in GCP mode a retry that then succeeded still raised an ERROR line into
 * Error Reporting. Retries now back off exponentially, skip errors that cannot
 * succeed on a repeat, and log at WARNING when a `logger` is supplied.
 */
export function retriable<
  T extends object,
  A extends ReducedObject<T, (...args: any[]) => Promise<any>>,
>(instance: T, action: A, logger?: Logger): T[A] {
  const callable: any = async (...args: any[]) => {
    const method: any = instance[action];

    for (let attempt = 1; ; attempt++) {
      try {
        return await method.call(instance, ...args);
      } catch (err) {
        if (attempt >= MAX_ATTEMPTS || !isRetriable(err)) {
          throw err;
        }

        const backoff = BASE_DELAY_MS * 2 ** (attempt - 1);

        logger?.warn("Retrying after a transient failure", {
          attempt,
          max_attempts: MAX_ATTEMPTS,
          backoff_ms: backoff,
          error: String(err),
        });

        await delay(backoff);
      }
    }
  };

  return callable;
}
