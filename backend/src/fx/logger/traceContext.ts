// Per-request trace context propagated via AsyncLocalStorage so that every
// log emitted during a request carries the same `trace` / `spanId` fields
// and Cloud Logging can group them under the same trace in the UI.
import { AsyncLocalStorage } from "node:async_hooks";

export interface TraceContext {
  trace: string;
  spanId?: string;
}

const storage = new AsyncLocalStorage<TraceContext>();

export function getTraceContext(): TraceContext | undefined {
  return storage.getStore();
}

// Uses `enterWith` (not `run`) so callers (like Elysia's `onRequest` hook)
// can set the context once and have it propagate to every downstream async
// operation for the rest of that request's async chain — without wrapping
// the whole handler in a callback.
export function enterTraceContext(ctx: TraceContext): void {
  storage.enterWith(ctx);
}

// Parses Cloud Run's `X-Cloud-Trace-Context: TRACE_ID/SPAN_ID;o=OPTIONS`
// header. When a projectId is supplied the trace ID is rewritten into the
// fully-qualified `projects/PROJECT/traces/TRACE_ID` form Cloud Logging
// expects for cross-service correlation.
export function parseCloudTraceContext(
  header: string | null | undefined,
  projectId?: string,
): TraceContext | undefined {
  if (!header) return undefined;
  const [traceId, rest] = header.split("/");
  if (!traceId) return undefined;
  const spanId = rest?.split(";")[0];
  const trace = projectId ? `projects/${projectId}/traces/${traceId}` : traceId;
  const ctx: TraceContext = { trace };
  if (spanId) ctx.spanId = spanId;
  return ctx;
}
