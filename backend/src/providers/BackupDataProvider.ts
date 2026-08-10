import type { DataProvider } from "./DataProvider";
import type { BackupRef } from "./Storage/StorageProvider";

/**
 * `urlFor` is omitted rather than stubbed. It answers "how do I recognise a row
 * this connector already wrote", and a backup connector writes no rows — it has
 * no database, no URL column and no field mapping. A stub returning nothing
 * would compile and then sit there implying the question makes sense here.
 * Callers reach it only behind an `isBackupDomain` guard.
 */
export interface BackupDataProvider<T extends "BitwardenBackup" | "backup">
  extends Omit<DataProvider<T>, "urlFor"> {
  getBackupDate(): Promise<Date | undefined>;

  /** Every archive still held for this user, newest first. */
  listBackups(): Promise<BackupRef[]>;

  /** A download link for `key`, or for the newest archive. */
  getLink(key?: string): Promise<string>;

  sync(): AsyncGenerator<string>;
}
