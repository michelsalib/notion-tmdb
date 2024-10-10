import { inject } from "inversify";
import { provide } from "inversify-binding-decorators";
import { NotionClient } from "../providers/Notion/NotionClient.js";
import { StorageClient } from "../providers/Storage/StorageClient.js";
import archiver from "archiver";

@provide(Backup)
export class Backup {
  constructor(
    @inject(StorageClient) private readonly storage: StorageClient,
    @inject(NotionClient) private readonly notion: NotionClient,
  ) {}

  async backup(): Promise<void> {
    const result = [];

    // get data from notion
    for await (const item of this.notion.listContent()) {
      result.push(item);
    }

    // put in a zip
    const archive = archiver('zip');
    archive.append(JSON.stringify(result), {
        name: 'data.json',
    });
    archive.finalize();

    // store in blob storage
    return await this.storage.putBackup(archive);
  }

  async getLink(): Promise<string> {
    return this.storage.getBackupLink();
  }
}
