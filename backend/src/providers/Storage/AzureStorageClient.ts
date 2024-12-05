import {
  BlobSASPermissions,
  BlockBlobClient,
  BlockBlobTier,
  ContainerClient,
  StorageSharedKeyCredential,
} from "@azure/storage-blob";
import { addHours } from "date-fns";
import { inject } from "inversify";
import { fluentProvide } from "inversify-binding-decorators";
import { Readable } from "node:stream";
import {
  STORAGE_ACCOUNT,
  STORAGE_CONTAINER,
  STORAGE_ENGINE,
  STORAGE_KEY,
  STORAGE_PROVIDER,
  USER_ID,
} from "../../fx/keys.js";
import { StorageProvider } from "./StorageProvider.js";

@(fluentProvide(STORAGE_PROVIDER)
  .when((r) => r.parentContext.container.get(STORAGE_ENGINE) == "AZURE")
  .done())
export class AzureStorageClient implements StorageProvider {
  private readonly client: ContainerClient;

  constructor(
    @inject(STORAGE_ACCOUNT) private readonly account: string,
    @inject(STORAGE_KEY) private readonly key: string,
    @inject(STORAGE_CONTAINER) private readonly container: string,
    @inject(USER_ID) private readonly userId: string,
  ) {
    this.client = new ContainerClient(
      this.container,
      new StorageSharedKeyCredential(this.account, this.key),
    );
  }

  private getBackupBlob(): BlockBlobClient {
    return this.client.getBlockBlobClient(`${this.userId}.zip`);
  }

  async putBackup(data: Readable): Promise<void> {
    const blob = this.getBackupBlob();

    await blob.uploadStream(data, undefined, undefined, {
      tier: BlockBlobTier.Cold,
    });
  }

  async getBackupLink(): Promise<string> {
    const blob = this.getBackupBlob();

    return await blob.generateSasUrl({
      permissions: BlobSASPermissions.parse("r"),
      expiresOn: addHours(new Date(), 1),
    });
  }

  async getBackupMeta(): Promise<{
    lastModified: Date;
  }> {
    const blob = this.getBackupBlob();

    const props = await blob.getProperties();

    return {
      lastModified: props.lastModified as Date,
    };
  }
}
