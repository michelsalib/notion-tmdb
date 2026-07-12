import type {
  BlockObjectResponse,
  DatabaseObjectResponse,
  PageObjectResponse,
} from "@notionhq/client/build/src/api-endpoints.js";
import type { Archiver } from "archiver";
import archiver from "archiver";
import { Axios } from "axios";
import { errorLogger, requestLogger, responseLogger } from "axios-logger";
import { inject, injectable } from "tsyringe";
import { REQUEST, STORAGE_PROVIDER } from "../../fx/keys.js";
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
  ) {
    this.client = new Axios({
      headers: {
        "User-Agent": request.headers["user-agent"],
      },
    });

    this.client.interceptors.request.use(requestLogger, errorLogger);
    this.client.interceptors.response.use(
      (res) =>
        responseLogger(res, {
          data: false,
          headers: true,
        }),
      errorLogger,
    );
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

  private async load(
    archive: Archiver,
    fileName: string,
    url: string,
  ): Promise<void> {
    // TODO: stream would be better to avoid clutter RAM
    const response = await retriable(this.client, "get")(url, {
      responseType: "arraybuffer",
    });
    const data: ArrayBuffer = response.data;

    archive.append(Buffer.from(data), {
      name: fileName,
    });
  }
}
