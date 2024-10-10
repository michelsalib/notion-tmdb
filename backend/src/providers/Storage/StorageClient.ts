import {
  BlobSASPermissions,
  BlockBlobClient,
  BlockBlobTier,
  ContainerClient,
  StorageSharedKeyCredential,
} from "@azure/storage-blob";
import { inject } from "inversify";
import { provide } from "inversify-binding-decorators";
import { Readable } from "node:stream";
import {
  STORAGE_ACCOUNT,
  STORAGE_CONTAINER,
  STORAGE_KEY,
  USER_ID,
} from "../../fx/keys.js";
import { addHours } from "date-fns";

@provide(StorageClient)
export class StorageClient {
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
}
