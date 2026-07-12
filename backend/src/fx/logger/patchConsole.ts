// Redirects raw `console.log/info/warn/error` calls through the structured
// JSON emitter so third-party libs and stray call-sites don't bypass Cloud
// Logging's structured ingestion. Only call this when the GCP logger is
// active — for local dev the raw console output is what you want.
import { emit, serializeError } from "./emit.js";

export function patchConsole(): void {
  console.log = (...args: unknown[]) => emit("INFO", format(args));
  console.info = (...args: unknown[]) => emit("INFO", format(args));
  console.debug = (...args: unknown[]) => emit("DEBUG", format(args));
  console.warn = (...args: unknown[]) => emit("WARNING", format(args));
  console.error = (...args: unknown[]) => {
    // Preserve stack traces when an Error is passed as any argument.
    const errIdx = args.findIndex((a) => a instanceof Error);
    if (errIdx !== -1) {
      const err = args[errIdx] as Error;
      const prefix = args
        .filter((_, i) => i !== errIdx)
        .map(stringify)
        .join(" ");
      const meta = serializeError(err);
      const message = prefix
        ? `${prefix} ${meta["message"]}`
        : String(meta["message"]);
      emit("ERROR", message, { stack_trace: meta["stack_trace"] });
      return;
    }
    emit("ERROR", format(args));
  };
}

function format(args: unknown[]): string {
  return args.map(stringify).join(" ");
}

function stringify(value: unknown): string {
  if (value instanceof Error) return `${value.message}\n${value.stack}`;
  if (typeof value === "object" && value !== null) {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}
