import archiver from "archiver";
import { inject } from "inversify";
import { fluentProvide } from "inversify-binding-decorators";
import { DATA_PROVIDER, DOMAIN as DOMAIN_KEY } from "../fx/keys.js";
import { DataProvider } from "../providers/DataProvider.js";
import { NotionClient } from "../providers/Notion/NotionClient.js";
import { StorageClient } from "../providers/Storage/StorageClient.js";
import { DOMAIN, Suggestion } from "../types.js";

@(fluentProvide(DATA_PROVIDER)
  .when((r) => r.parentContext.container.get<DOMAIN>(DOMAIN_KEY) == "backup")
  .done())
export class Backup implements DataProvider<"backup"> {
  constructor(
    @inject(StorageClient) private readonly storage: StorageClient,
    @inject(NotionClient) private readonly notion: NotionClient,
  ) {}

  search(): Promise<Suggestion[]> {
    throw new Error("Method not implemented.");
  }

  loadNotionEntry(): Promise<any> {
    throw new Error("Method not implemented.");
  }

  async *sync(): AsyncGenerator<string> {
    const result = [];
    let i = 0;

    // get data from notion
    for await (const item of this.notion.listContent()) {
      result.push(item);
      yield `Processed item ${++i}.`;
    }
    yield `Done processing items.`;

    // put in a zip
    const archive = archiver("zip");
    archive.append(JSON.stringify(result), {
      name: "data.json",
    });
    archive.finalize();
    yield `Done generating archive.`;

    // store in blob storage
    await this.storage.putBackup(archive);
    yield `Done storing archive.`;
  }

  async getBackupDate(): Promise<Date> {
    const meta = await this.storage.getBackupMeta();

    return meta.lastModified;
  }

  async getLink(): Promise<string> {
    return this.storage.getBackupLink();
  }
}
