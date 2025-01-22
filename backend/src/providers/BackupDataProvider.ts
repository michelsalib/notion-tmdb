import { DataProvider } from "./DataProvider";

export interface BackupDataProvider<T extends "BitwardenBackup" | "backup">
  extends DataProvider<T> {
  getBackupDate(): Promise<Date | undefined>;

  getLink(): Promise<string>;
}
