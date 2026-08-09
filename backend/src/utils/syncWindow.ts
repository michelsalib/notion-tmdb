/** How far back `?days=` is allowed to reach. Beyond this, treat it as noise. */
export const MAX_SYNC_AGE_DAYS = 3650;

/**
 * Turn the `?days=N` query value into a cutoff instant.
 *
 * `undefined` means "rows that have never been synced", which is the default
 * and the cheap path. `days=0` means every synced row, since all of them are
 * older than this instant.
 *
 * Computed server-side rather than sent by the browser so the cutoff comes off
 * the server clock — a device with a skewed clock would otherwise silently
 * re-sync a different window than the one the user picked. Anything
 * unparseable, negative, or absurdly large is ignored rather than rejected: the
 * safe reading of a bad value is the narrowest possible sync, not the widest.
 */
export function staleBefore(
  days: unknown,
  now: number = Date.now(),
): string | undefined {
  // Only a primitive age means anything. Checked before `Number()` because
  // `Number([])` is 0 — and a repeated `?days=` produces an array, which would
  // otherwise read as the widest possible sweep rather than as noise.
  if (typeof days !== "number" && typeof days !== "string") {
    return undefined;
  }

  if (days === "") {
    return undefined;
  }

  const parsed = Number(days);

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > MAX_SYNC_AGE_DAYS) {
    return undefined;
  }

  return new Date(now - parsed * 86_400_000).toISOString();
}
