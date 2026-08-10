import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { type Bucket, type File, Storage } from "@google-cloud/storage";
import { addHours } from "date-fns";
import { inject, injectable } from "tsyringe";
import {
  GCP_PROJECT_ID,
  STORAGE_BUCKET,
  STORAGE_ENDPOINT,
  USER_ID,
} from "../../fx/keys.js";
import {
  type BackupRef,
  backupObjectDate,
  backupObjectName,
  type StorageProvider,
} from "./StorageProvider.js";

@injectable()
export class GcsStorageClient implements StorageProvider {
  private readonly bucket: Bucket;

  constructor(
    @inject(STORAGE_BUCKET) private readonly bucketName: string,
    @inject(GCP_PROJECT_ID) projectId: string,
    @inject(STORAGE_ENDPOINT) private readonly apiEndpoint: string | undefined,
    @inject(USER_ID) private readonly userId: string,
  ) {
    const storage = new Storage({
      projectId,
      ...(apiEndpoint ? { apiEndpoint } : {}),
    });
    this.bucket = storage.bucket(bucketName);
  }

  private prefix(): string {
    return `${this.userId}/`;
  }

  /**
   * The pre-history key: one object per user, overwritten every run.
   *
   * Still listed, because a user who has not run a backup since the change to
   * dated keys would otherwise open the page and be told they have none.
   */
  private legacyFile(): File {
    return this.bucket.file(`${this.userId}.zip`);
  }

  async putBackup(data: Readable, date: Date): Promise<string> {
    const key = this.prefix() + backupObjectName(date);

    await pipeline(
      data,
      this.bucket.file(key).createWriteStream({
        metadata: {
          contentType: "application/zip",
          storageClass: "COLDLINE",
        },
        resumable: false,
      }),
    );

    return key;
  }

  /**
   * What this user has stored, or nothing if the store cannot be read.
   *
   * Tolerant because both callers — the widget's "last backup" line and its
   * history list — are describing what exists. An unreadable store (no bucket
   * yet, which is every fresh local checkout until one is created) used to read
   * as "Never"; making it a 500 on `/api/config` would take the whole page down
   * over a line of text. `getBackupLink` deliberately uses the strict version,
   * so a download failure still reports the real reason.
   */
  async listBackups(): Promise<BackupRef[]> {
    try {
      return await this.list();
    } catch {
      return [];
    }
  }

  private async list(): Promise<BackupRef[]> {
    const [files] = await this.bucket.getFiles({ prefix: this.prefix() });

    const backups = files.flatMap<BackupRef>((file) => {
      const date = backupObjectDate(file.name.slice(this.prefix().length));

      // Anything else under the prefix was not written by putBackup. Skipping
      // it keeps a stray object from showing up as a backup dated `Invalid
      // Date`, and keeps prune from deleting something it does not own.
      return date
        ? [{ key: file.name, date, size: Number(file.metadata.size ?? 0) }]
        : [];
    });

    const legacy = await this.legacyRef();
    if (legacy) {
      backups.push(legacy);
    }

    return backups.sort((a, b) => b.date.getTime() - a.date.getTime());
  }

  async getBackupLink(key?: string): Promise<string> {
    const file = await this.resolve(key);

    if (!file) {
      throw new Error("No backup available.");
    }

    // A local emulator has no service-account key, and v4 signing needs one:
    // signing against fake-gcs fails with "Cannot sign data without
    // `client_email`", which made the download button a 500 in every local
    // checkout. It serves objects unauthenticated anyway, so point straight at
    // one. `STORAGE_ENDPOINT` is deliberately unset in prod (see infra), so
    // this can never hand out an unsigned URL to a real bucket.
    if (this.apiEndpoint) {
      return `${this.apiEndpoint.replace(/\/$/, "")}/${this.bucketName}/${encodeURI(file.name)}`;
    }

    const [url] = await file.getSignedUrl({
      version: "v4",
      action: "read",
      expires: addHours(new Date(), 1),
    });

    return url;
  }

  async getBackupMeta(): Promise<{ lastModified?: Date }> {
    const [newest] = await this.listBackups();

    return { lastModified: newest?.date };
  }

  async pruneBackups(keep: number): Promise<void> {
    const stale = (await this.listBackups()).slice(keep);

    for (const backup of stale) {
      await this.bucket.file(backup.key).delete({ ignoreNotFound: true });
    }
  }

  /**
   * The file for `key`, or the newest backup when `key` is omitted.
   *
   * `key` arrives from a query parameter, so it is matched against the user's
   * own listing rather than concatenated onto their prefix — otherwise a
   * traversal (`../<other user>.zip`) would be handed a signed URL for someone
   * else's workspace.
   */
  private async resolve(key?: string): Promise<File | undefined> {
    const backups = await this.list();
    const match = key
      ? backups.find((backup) => backup.key === key)
      : backups[0];

    return match ? this.bucket.file(match.key) : undefined;
  }

  private async legacyRef(): Promise<BackupRef | undefined> {
    const file = this.legacyFile();

    try {
      const [metadata] = await file.getMetadata();

      return metadata.updated
        ? {
            key: file.name,
            date: new Date(metadata.updated),
            size: Number(metadata.size ?? 0),
          }
        : undefined;
    } catch {
      return undefined;
    }
  }
}
