import { Readable } from "node:stream";

export interface StorageProvider {
  putBackup(data: Readable): Promise<void>;

  getBackupLink(): Promise<string>;

  getBackupMeta(): Promise<{
    lastModified: Date;
  }>;
}
