import type { Readable } from "node:stream";
import type {
  BlockObjectResponse,
  DatabaseObjectResponse,
  PageObjectResponse,
} from "@notionhq/client/build/src/api-endpoints.js";
import type { Archiver } from "archiver";
import archiver from "archiver";
import { Axios } from "axios";
import { inject, injectable } from "tsyringe";
import { LOGGER, REQUEST, STORAGE_PROVIDER } from "../../fx/keys.js";
import type { Logger } from "../../fx/logger/Logger.js";
import type { ScopedRequest } from "../../fx/router.js";
import type { Suggestion } from "../../types.js";
import { retriable } from "../../utils/retriable.js";
import type { BackupDataProvider } from "../BackupDataProvider.js";
import { NotionClient } from "../Notion/NotionClient.js";
import type { StorageProvider } from "../Storage/StorageProvider.js";

@injectable()
export class NotionBackup implements BackupDataProvider<"backup"> {
  private readonly client: Axios;

  constructor(
    @inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    @inject(NotionClient) private readonly notion: NotionClient,
    @inject(REQUEST) readonly request: ScopedRequest,
    @inject(LOGGER) private readonly logger: Logger,
  ) {
    this.client = new Axios({
      headers: {
        "User-Agent": request.headers["user-agent"],
      },
    });

    // Was logging responses with `headers: true`. Notion hands out its assets
    // as pre-signed S3 URLs, so those response headers carry credentials —
    // `bindAxios` pins headers (and bodies, and params) off.
    this.logger.bindAxios(this.client);
  }

  search(): Promise<Suggestion[]> {
    throw new Error("Method not implemented.");
  }

  loadNotionEntry(): Promise<any> {
    throw new Error("Method not implemented.");
  }

  async *sync(): AsyncGenerator<string> {
    const result: Array<
      PageObjectResponse | DatabaseObjectResponse | BlockObjectResponse
    > = [];

    // get data from notion
    let itemCounter = 0;
    for await (const item of this.notion.listContent()) {
      result.push(item);
      yield `Processed item ${++itemCounter}.`;
    }
    yield `Done processing items.`;

    // put data in a zip
    const archive = archiver("zip");
    archive.append(JSON.stringify(result), {
      name: "data_data.json",
    });

    // load assets
    let assetCounter = 0;
    for (const item of result) {
      if (item.object != "block") {
        if (item.icon?.type == "file") {
          await this.load(archive, "icon_" + item.id, item.icon.file.url);

          yield `Processed asset ${++assetCounter}.`;
        }

        if (item.cover?.type == "file") {
          await this.load(archive, "cover_" + item.id, item.cover.file.url);

          yield `Processed asset ${++assetCounter}.`;
        }
      } else {
        if (item.type == "image" && item.image.type == "file") {
          await this.load(archive, "image_" + item.id, item.image.file.url);

          yield `Processed asset ${++assetCounter}.`;
        }

        if (item.type == "audio" && item.audio.type == "file") {
          await this.load(archive, "audio_" + item.id, item.audio.file.url);

          yield `Processed asset ${++assetCounter}.`;
        }

        if (item.type == "pdf" && item.pdf.type == "file") {
          await this.load(archive, "pdf_" + item.id, item.pdf.file.url);

          yield `Processed asset ${++assetCounter}.`;
        }

        if (item.type == "video" && item.video.type == "file") {
          await this.load(archive, "video_" + item.id, item.video.file.url);

          yield `Processed asset ${++assetCounter}.`;
        }

        if (item.type == "file" && item.file.type == "file") {
          await this.load(archive, "file_" + item.id, item.file.file.url);

          yield `Processed asset ${++assetCounter}.`;
        }
      }
    }

    await archive.finalize();
    yield `Done generating archive.`;

    // store in blob storage
    await this.storage.putBackup(archive);
    yield `Done storing archive.`;
  }

  async getBackupDate(): Promise<Date | undefined> {
    const meta = await this.storage.getBackupMeta();

    return meta.lastModified;
  }

  async getLink(): Promise<string> {
    return this.storage.getBackupLink();
  }

  // Streams each asset straight into the zip. Buffering with
  // `responseType: "arraybuffer"` held the whole file in RAM twice (the
  // ArrayBuffer plus its `Buffer.from` copy), which is what the Cloud Run
  // instance had to be sized around for workspaces with large attachments.
  private async load(
    archive: Archiver,
    fileName: string,
    url: string,
  ): Promise<void> {
    const response = await retriable(
      this.client,
      "get",
      this.logger,
    )(url, {
      responseType: "stream",
    });
    const stream: Readable = response.data;

    archive.append(stream, { name: fileName });

    // archiver consumes queued entries serially, so wait for this one to drain
    // before requesting the next asset. Without it every download would be
    // issued up front and sit there holding a socket open while archiver
    // worked through the backlog one entry at a time.
    await new Promise<void>((resolve, reject) => {
      stream.on("end", resolve);
      stream.on("error", reject);
    });
  }
}
