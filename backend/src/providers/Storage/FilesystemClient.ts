import { stat, writeFile } from "fs/promises";
import { resolve } from "path";
import { Readable } from "stream";
import { inject, injectable } from "tsyringe";
import { USER_ID } from "../../fx/keys.js";
import type { StorageProvider } from "./StorageProvider.js";

@injectable()
export class FilesystemStorage implements StorageProvider {
  constructor(@inject(USER_ID) private readonly userId: string) {}

  public getBackupFilename(): string {
    return resolve(`support/${this.userId}.zip`);
  }

  async putBackup(data: Readable): Promise<void> {
    await writeFile(this.getBackupFilename(), data);
  }

  async getBackupLink(): Promise<string> {
    return "/backup";
  }

  async getBackupMeta(): Promise<{ lastModified?: Date }> {
    try {
      const stats = await stat(this.getBackupFilename());

      return {
        lastModified: stats.mtime,
      };
    } catch {
      return {
        lastModified: undefined,
      };
    }
  }
}
