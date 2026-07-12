// Structured JSON log emitter. Cloud Logging auto-parses lines on
// stdout/stderr that are single-line JSON with a `severity` field. Special
// keys `logging.googleapis.com/trace`, `logging.googleapis.com/spanId`, and
// `stack_trace` are also recognized (the last routes errors into Error
// Reporting). https://cloud.google.com/logging/docs/structured-logging
import { getTraceContext } from "./traceContext.js";

export type Severity =
  | "DEBUG"
  | "INFO"
  | "NOTICE"
  | "WARNING"
  | "ERROR"
  | "CRITICAL";

export type LogFields = Record<string, unknown>;

export function emit(
  severity: Severity,
  message: string,
  fields?: LogFields,
): void {
  const payload: Record<string, unknown> = {
    severity,
    message,
    timestamp: new Date().toISOString(),
    ...fields,
  };

  const trace = getTraceContext();
  if (trace) {
    payload["logging.googleapis.com/trace"] = trace.trace;
    if (trace.spanId) {
      payload["logging.googleapis.com/spanId"] = trace.spanId;
    }
  }

  const line = `${JSON.stringify(payload)}\n`;
  // ERROR/CRITICAL → stderr so the platform routes them separately.
  if (severity === "ERROR" || severity === "CRITICAL") {
    process.stderr.write(line);
  } else {
    process.stdout.write(line);
  }
}

// Extracts message + stack from an Error for GCP Error Reporting ingestion.
export function serializeError(err: unknown): LogFields {
  if (err instanceof Error) {
    return {
      message: err.message,
      stack_trace: err.stack,
      error_name: err.name,
    };
  }
  return { message: String(err) };
}
