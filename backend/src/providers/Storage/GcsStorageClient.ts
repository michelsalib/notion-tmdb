import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { type Bucket, Storage } from "@google-cloud/storage";
import { addHours } from "date-fns";
import { inject, injectable } from "tsyringe";
import {
  GCP_PROJECT_ID,
  STORAGE_BUCKET,
  STORAGE_ENDPOINT,
  USER_ID,
} from "../../fx/keys.js";
import type { StorageProvider } from "./StorageProvider.js";

@injectable()
export class GcsStorageClient implements StorageProvider {
  private readonly bucket: Bucket;

  constructor(
    @inject(STORAGE_BUCKET) bucketName: string,
    @inject(GCP_PROJECT_ID) projectId: string,
    @inject(STORAGE_ENDPOINT) apiEndpoint: string | undefined,
    @inject(USER_ID) private readonly userId: string,
  ) {
    const storage = new Storage({
      projectId,
      ...(apiEndpoint ? { apiEndpoint } : {}),
    });
    this.bucket = storage.bucket(bucketName);
  }

  private file() {
    return this.bucket.file(`${this.userId}.zip`);
  }

  async putBackup(data: Readable): Promise<void> {
    const file = this.file();
    await pipeline(
      data,
      file.createWriteStream({
        metadata: {
          contentType: "application/zip",
          storageClass: "COLDLINE",
        },
        resumable: false,
      }),
    );
  }

  async getBackupLink(): Promise<string> {
    const [url] = await this.file().getSignedUrl({
      version: "v4",
      action: "read",
      expires: addHours(new Date(), 1),
    });
    return url;
  }

  async getBackupMeta(): Promise<{ lastModified?: Date }> {
    try {
      const [metadata] = await this.file().getMetadata();
      return {
        lastModified: metadata.updated ? new Date(metadata.updated) : undefined,
      };
    } catch {
      return { lastModified: undefined };
    }
  }
}
