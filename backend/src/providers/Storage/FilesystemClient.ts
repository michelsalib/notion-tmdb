import { stat, writeFile } from "fs/promises";
import { inject } from "inversify";
import { fluentProvide } from "inversify-binding-decorators";
import { Readable } from "stream";
import { StorageProvider } from "./StorageProvider.js";
import { STORAGE_ENGINE, STORAGE_PROVIDER, USER_ID } from "../../fx/keys.js";
import { resolve } from "path";

@(fluentProvide(STORAGE_PROVIDER)
  .when((r) => r.parentContext.container.get(STORAGE_ENGINE) == "FILESYSTEM")
  .done())
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
