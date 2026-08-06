import { describe, expect, test } from "bun:test";
import type { Logger } from "../fx/logger/Logger.js";
import { retriable } from "./retriable.js";

function httpError(status: number): Error & { response: { status: number } } {
  return Object.assign(new Error(`HTTP ${status}`), { response: { status } });
}

function recordingLogger(): Logger & { warnings: string[] } {
  const warnings: string[] = [];

  return {
    warnings,
    log() {},
    warn(message: string) {
      warnings.push(message);
    },
    error() {},
    bindAxios() {},
  };
}

// A stub whose method fails `failures` times before succeeding.
function flaky(failures: number, err: unknown = httpError(503)) {
  const target = {
    calls: 0,
    async run(value: string) {
      target.calls++;
      if (target.calls <= failures) {
        throw err;
      }
      return `ok:${value}`;
    },
  };

  return target;
}

describe("retriable", () => {
  test("returns the result without retrying when the call succeeds", async () => {
    const target = flaky(0);

    expect(await retriable(target, "run")("a")).toBe("ok:a");
    expect(target.calls).toBe(1);
  });

  test("retries a 5xx and succeeds on a later attempt", async () => {
    const target = flaky(2);

    expect(await retriable(target, "run")("a")).toBe("ok:a");
    expect(target.calls).toBe(3);
  });

  test("gives up after the attempt cap and rethrows", async () => {
    const target = flaky(99);

    await expect(retriable(target, "run")("a")).rejects.toThrow("HTTP 503");
    expect(target.calls).toBe(3);
  });

  test("does not retry a 4xx", async () => {
    // Repeating a rejected request verbatim cannot succeed and just burns the
    // provider's rate limit — the old implementation retried it anyway.
    const target = flaky(99, httpError(400));

    await expect(retriable(target, "run")("a")).rejects.toThrow("HTTP 400");
    expect(target.calls).toBe(1);
  });

  test("does retry a 429", async () => {
    const target = flaky(1, httpError(429));

    expect(await retriable(target, "run")("a")).toBe("ok:a");
    expect(target.calls).toBe(2);
  });

  test("retries an error that carries no response", async () => {
    const target = flaky(1, new Error("socket hang up"));

    expect(await retriable(target, "run")("a")).toBe("ok:a");
    expect(target.calls).toBe(2);
  });

  test("logs retries at warning, not error", async () => {
    // In GCP mode an ERROR line reaches Error Reporting, so a retry that then
    // succeeded used to raise a spurious incident.
    const logger = recordingLogger();
    const target = flaky(1);

    await retriable(target, "run", logger)("a");

    expect(logger.warnings).toHaveLength(1);
  });

  test("preserves the arguments across retries", async () => {
    const target = flaky(1);

    expect(await retriable(target, "run")("payload")).toBe("ok:payload");
  });
});
