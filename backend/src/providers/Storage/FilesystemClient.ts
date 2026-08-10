import { createWriteStream } from "node:fs";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { inject, injectable } from "tsyringe";
import { USER_ID } from "../../fx/keys.js";
import {
  type BackupRef,
  backupObjectDate,
  backupObjectName,
  type StorageProvider,
} from "./StorageProvider.js";

/**
 * Local-dev storage. Archives land in `support/backups/<userId>/`.
 *
 * No equivalent of the GCS client's legacy `<userId>.zip` fallback: that exists
 * so a production user who has not run a backup since dated keys landed still
 * sees their last one, and a dev's throwaway zip is not worth the branch.
 */
@injectable()
export class FilesystemStorage implements StorageProvider {
  constructor(@inject(USER_ID) private readonly userId: string) {}

  private directory(): string {
    return resolve(join("support", "backups", this.userId));
  }

  async putBackup(data: Readable, date: Date): Promise<string> {
    const name = backupObjectName(date);

    await mkdir(this.directory(), { recursive: true });
    await pipeline(data, createWriteStream(join(this.directory(), name)));

    return `${this.userId}/${name}`;
  }

  async listBackups(): Promise<BackupRef[]> {
    let names: string[];

    try {
      names = await readdir(this.directory());
    } catch {
      return [];
    }

    const backups: BackupRef[] = [];

    for (const name of names) {
      const date = backupObjectDate(name);

      if (date) {
        const { size } = await stat(join(this.directory(), name));

        backups.push({ key: `${this.userId}/${name}`, date, size });
      }
    }

    return backups.sort((a, b) => b.date.getTime() - a.date.getTime());
  }

  async getBackupLink(key?: string): Promise<string> {
    // The zip is served by the `/backup` static route rather than by a signed
    // URL, since there is no object store in front of it locally.
    return key ? `/backup?key=${encodeURIComponent(key)}` : "/backup";
  }

  async getBackupMeta(): Promise<{ lastModified?: Date }> {
    const [newest] = await this.listBackups();

    return { lastModified: newest?.date };
  }

  async pruneBackups(keep: number): Promise<void> {
    for (const backup of (await this.listBackups()).slice(keep)) {
      await rm(resolve(join("support", "backups", backup.key)), {
        force: true,
      });
    }
  }

  /**
   * Absolute path for `key`, or for the newest backup.
   *
   * Resolved by matching the listing rather than by joining `key` onto the
   * directory, so a `?key=../../secrets` from the static route cannot walk out
   * of the user's own folder.
   */
  async getBackupFilename(key?: string): Promise<string | undefined> {
    const backups = await this.listBackups();
    const match = key
      ? backups.find((backup) => backup.key === key)
      : backups[0];

    return match ? resolve(join("support", "backups", match.key)) : undefined;
  }
}
