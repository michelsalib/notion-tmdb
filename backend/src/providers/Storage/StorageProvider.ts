import type { Readable } from "node:stream";
import type { RangeSource } from "../../utils/zipReader.js";

/** One stored archive. `key` is opaque — hand it back to `getBackupLink`. */
export interface BackupRef {
  key: string;
  date: Date;
  size: number;
}

/** An archive opened for reading, paired with what the listing knows about it. */
export interface OpenedBackup {
  ref: BackupRef;
  source: RangeSource;
}

export interface StorageProvider {
  /**
   * Store a new archive under its own dated key and return that key.
   *
   * Backups used to overwrite a single `<userId>.zip`, so the only history was
   * the bucket's object versions — 60 days of them that no part of the app
   * could reach. One key per run makes "download last Tuesday's" a listing
   * rather than a console dive.
   */
  putBackup(data: Readable, date: Date): Promise<string>;

  /** Every stored archive, newest first. */
  listBackups(): Promise<BackupRef[]>;

  /** A time-limited download link for `key`, or for the newest backup. */
  getBackupLink(key?: string): Promise<string>;

  /**
   * Open `key` — or the newest archive — for reading, or undefined if there is
   * none.
   *
   * Random access rather than a stream, because a restore wants two entries out
   * of the tail of an archive whose bulk is assets it never looks at. `key` is
   * matched against this user's own listing, never joined onto their prefix,
   * for the same reason `getBackupLink` does it: it arrives from the browser.
   */
  openBackup(key?: string): Promise<OpenedBackup | undefined>;

  getBackupMeta(): Promise<{
    lastModified?: Date;
  }>;

  /** Delete all but the `keep` newest archives. */
  pruneBackups(keep: number): Promise<void>;
}

/**
 * Object name for a run, e.g. `2026-08-09T14-31-07Z.zip`.
 *
 * Colons are legal in both GCS object names and POSIX filenames but survive
 * neither a Windows extraction nor an unescaped URL, so the time separators
 * are dashes. The stamp still sorts lexicographically, which is what lets
 * `listBackups` order by name instead of by fetching every object's metadata.
 */
export function backupObjectName(date: Date): string {
  return `${date
    .toISOString()
    .replace(/\.\d+Z$/, "Z")
    .replaceAll(":", "-")}.zip`;
}

/** The instant encoded by `backupObjectName`, or undefined if it isn't one. */
export function backupObjectDate(name: string): Date | undefined {
  const match = name.match(
    /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})Z\.zip$/,
  );

  if (!match) {
    return undefined;
  }

  const date = new Date(`${match[1]}T${match[2]}:${match[3]}:${match[4]}Z`);

  return Number.isNaN(date.getTime()) ? undefined : date;
}
