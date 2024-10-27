import archiver from "archiver";
import { inject } from "inversify";
import { provide } from "inversify-binding-decorators";
import { NotionClient } from "../providers/Notion/NotionClient.js";
import { StorageClient } from "../providers/Storage/StorageClient.js";

@provide(Backup)
export class Backup {
  constructor(
    @inject(StorageClient) private readonly storage: StorageClient,
    @inject(NotionClient) private readonly notion: NotionClient,
  ) {}

  async *backup(): AsyncGenerator<string> {
    const result = [];
    let i = 0;

    // get data from notion
    for await (const item of this.notion.listContent()) {
      result.push(item);
      yield `Processed item ${++i};`;
    }
    yield `Done processing items;`;

    // put in a zip
    const archive = archiver("zip");
    archive.append(JSON.stringify(result), {
      name: "data.json",
    });
    archive.finalize();
    yield `Done generating archive;`;

    // store in blob storage
    await this.storage.putBackup(archive);
    yield `Done storing archive;`;
  }

  async getBackupDate(): Promise<Date> {
    const meta = await this.storage.getBackupMeta();

    return meta.lastModified;
  }

  async getLink(): Promise<string> {
    return this.storage.getBackupLink();
  }
}
