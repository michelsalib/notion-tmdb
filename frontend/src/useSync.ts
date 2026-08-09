import type { SyncEvent } from "backend/src/types";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { type StreamMessage, streaming } from "./stream";

export interface SyncState {
  running: boolean;
  /** Latest line from the stream. */
  message: string;
  current?: number;
  total?: number;
  error?: boolean;
}

/** What the last completed run did, kept so the widget can show freshness. */
export interface LastSync {
  at: number;
  total: number;
}

const IDLE: SyncState = { running: false, message: "" };

/**
 * The stream yields plain strings from the backup connectors and
 * `SyncEvent` objects from the ones with a countable item list.
 */
export function toEvent(data: unknown): SyncEvent {
  if (typeof data === "string") {
    return { message: data };
  }

  const event = (data ?? {}) as SyncEvent;

  return { ...event, message: event.message ?? "" };
}

/**
 * Fold one streamed chunk into the running state.
 *
 * Pure so the carry-forward rule can be tested directly: only the opening event
 * of a run carries `total`, so a later chunk that omits it — every backup
 * connector line, and every error line — must not wipe the denominator that
 * turns "12" into "12 of 40".
 */
export function advance(previous: SyncState, chunk: StreamMessage): SyncState {
  const event = toEvent(chunk.data);

  return {
    running: true,
    message: event.message,
    current: event.current ?? previous.current,
    total: event.total ?? previous.total,
    error: chunk.type == "error",
  };
}

/**
 * Drive `/api/sync` and expose it as progress rather than as a stream of
 * toasts.
 *
 * Every chunk used to be pushed into the one bottom-centre snackbar, so each
 * line overwrote the last: the user saw flickering text, no history, and no
 * denominator to tell a slow run from a stalled one. Here the counts stay on
 * the state so a caller can draw a real progress bar, and the terminal message
 * persists instead of evaporating on a timeout.
 */
export function useSync(options?: {
  /** `?domain=` override, for the multi-connector widget. */
  domain?: string;
  onSettled?: (state: SyncState) => void;
}) {
  const { t } = useTranslation();
  const [state, setState] = useState<SyncState>(IDLE);

  /**
   * `days` re-syncs rows already synced longer ago than that (`0` = all of
   * them). Omitted, only rows that have never been synced are picked up.
   *
   * Sent as an age rather than as a computed cutoff so the instant comes off
   * the server clock: a device with a skewed clock would otherwise silently
   * sync a different window than the one the user picked.
   */
  const sync = useCallback(
    async (days?: number) => {
      setState({ running: true, message: "" });

      let latest: SyncState = { running: true, message: "" };

      try {
        const params = new URLSearchParams();

        if (options?.domain) {
          params.set("domain", options.domain);
        }

        if (days !== undefined) {
          params.set("days", String(days));
        }

        const query = params.toString();
        const path = query ? `/api/sync?${query}` : "/api/sync";

        let received = 0;

        for await (const chunk of streaming(path)) {
          received++;
          latest = advance(latest, chunk);

          setState(latest);

          if (chunk.type == "error") {
            break;
          }
        }

        // A stream that closed without ever yielding is a failure, not an empty
        // success: `EventSource` reports a non-2xx response (an expired session,
        // or the 400 for an unconfigured database) by closing with no message at
        // all. Treating that as success recorded "Last sync just now · 0 updated"
        // for a run that never happened.
        if (received === 0) {
          latest = { running: true, message: t("SYNC_FAILURE"), error: true };
        }
      } catch {
        latest = { running: true, message: t("SYNC_FAILURE"), error: true };
      }

      const settled: SyncState = { ...latest, running: false };

      setState(settled);
      options?.onSettled?.(settled);

      return settled;
    },
    [options?.domain, t],
  );

  return { ...state, sync, reset: () => setState(IDLE) };
}

/**
 * Remember the last successful sync so the widget can show freshness on load.
 *
 * Deliberately per-browser: the backend stores no per-connector sync timestamp
 * for the search connectors, and inventing one server-side is a schema change
 * this does not need. A syncing from another browser simply is not reflected
 * here, which is why the label says "Last sync" rather than claiming the
 * database is up to date.
 */
export function readLastSync(key: string): LastSync | undefined {
  try {
    const raw = localStorage.getItem(`lastSync:${key}`);

    return raw ? (JSON.parse(raw) as LastSync) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Read a small UI preference, tolerating storage being unavailable.
 *
 * Accessing `localStorage` throws (not returns null) in a third-party iframe
 * with storage blocked, which is exactly what a Notion embed is.
 */
export function readSetting(key: string): string | undefined {
  try {
    return localStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

export function writeSetting(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Preference is a nicety; losing it must not break the widget.
  }
}

export function writeLastSync(key: string, value: LastSync): void {
  try {
    localStorage.setItem(`lastSync:${key}`, JSON.stringify(value));
  } catch {
    // Storage can be unavailable (private mode, blocked third-party embed
    // storage). Freshness is a nicety; losing it must not break syncing.
  }
}

const UNITS: [limit: number, div: number, name: string][] = [
  [60_000, 1000, "second"],
  [3_600_000, 60_000, "minute"],
  [86_400_000, 3_600_000, "hour"],
  [2_592_000_000, 86_400_000, "day"],
];

/** "just now", "4 minutes ago", "3 days ago". */
export function relativeTime(at: number, now = Date.now()): string {
  const elapsed = Math.max(0, now - at);

  if (elapsed < 10_000) {
    return "just now";
  }

  for (const [limit, div, name] of UNITS) {
    if (elapsed < limit) {
      const value = Math.floor(elapsed / div);

      return `${value} ${value === 1 ? name : `${name}s`} ago`;
    }
  }

  return new Date(at).toLocaleDateString();
}
