import type { AxiosInstance } from "axios";
import { inject, injectable } from "tsyringe";
import { LOGGER } from "../../fx/keys.js";
import type { Logger } from "../../fx/logger/Logger.js";
import type {
  GBookDbConfig,
  NotionItem,
  Suggestion,
  SyncEvent,
  SyncOptions,
} from "../../types.js";
import { entryUrl, idFromQuery } from "../../utils/providerId.js";
import { runSync } from "../../utils/syncRun.js";
import type { DataProvider } from "../DataProvider.js";
import { createProviderClient } from "../httpClient.js";
import { NotionClient } from "../Notion/NotionClient.js";

interface VolumeInfo {
  title: string;
  authors?: string[];
  publishedDate: `${number}-${number}-${number}`;
  categories: string[];
  imageLinks?: {
    thumbnail: string;
  };
  canonicalVolumeLink: string;
  subtitle?: string;
}

@injectable()
export class GBookClient implements DataProvider<"GBook"> {
  private readonly client: AxiosInstance;

  constructor(@inject(LOGGER) logger: Logger) {
    this.client = createProviderClient(logger, {
      baseURL: "https://www.googleapis.com/books/v1/",
    });
  }

  async *sync(
    notionClient: NotionClient,
    dbConfig: GBookDbConfig,
    options?: SyncOptions,
  ): AsyncGenerator<SyncEvent> {
    const entriesToLoad = await notionClient.listDatabaseEntries(
      dbConfig,
      options,
    );

    yield* runSync(
      entriesToLoad,
      "book",
      async (entry) => {
        const id = idFromQuery(entryUrl(entry, dbConfig.url), "id");

        if (!id) {
          throw new Error("not a Google Books link");
        }

        // load from google books
        const { notionItem, title } = await this.loadNotionEntry(id, dbConfig);

        // populate in notion
        await notionClient.updatePage({
          ...notionItem,
          page_id: entry.id,
        });

        return title;
      },
      (entry) => entryUrl(entry, dbConfig.url),
    );
  }

  async search(query: string): Promise<Suggestion[]> {
    const { data } = await this.client.get("/volumes", {
      params: {
        q: query,
      },
    });

    return data.items.map((s: { id: string; volumeInfo: VolumeInfo }) => {
      let subtitle = s.volumeInfo.authors?.join(", ") || "NA";
      if (s.volumeInfo.subtitle) {
        subtitle += " - " + s.volumeInfo.subtitle;
      }

      return {
        id: s.id,
        title: s.volumeInfo.title,
        releaseDate: s.volumeInfo.publishedDate || "NA",
        posterPath: s.volumeInfo.imageLinks?.thumbnail || "",
        subtitle,
      } as Suggestion;
    });
  }

  async loadNotionEntry(
    id: string,
    dbConfig: GBookDbConfig,
  ): Promise<{ notionItem: NotionItem; title: string }> {
    const { data } = await this.client.get(`/volumes/${id}`);
    const volumeInfo: VolumeInfo = data.volumeInfo;

    const bookItem: NotionItem = {
      cover: {
        external: {
          url: volumeInfo.imageLinks?.thumbnail || "",
        },
      },
      icon: {
        external: {
          url: volumeInfo.imageLinks?.thumbnail || "",
        },
      },
      properties: {
        [dbConfig.url]: {
          url: volumeInfo.canonicalVolumeLink,
        },
        [dbConfig.status]: {
          date: {
            start: new Date().toISOString(),
          },
        },
      },
    };

    const title = volumeInfo.title;
    if (dbConfig.title) {
      bookItem.properties[dbConfig.title] = {
        title: [
          {
            text: {
              content: title,
            },
          },
        ],
      };
    }

    if (dbConfig.releaseDate) {
      bookItem.properties[dbConfig.releaseDate] = {
        date: {
          start: volumeInfo.publishedDate,
        },
      };
    }

    if (dbConfig.author) {
      bookItem.properties[dbConfig.author] = {
        rich_text: [
          {
            text: {
              content: volumeInfo.authors?.join(", ") || "NA",
              link: {
                url: volumeInfo.canonicalVolumeLink,
              },
            },
          },
        ],
      };
    }

    if (dbConfig.genre) {
      bookItem.properties[dbConfig.genre] = {
        multi_select: volumeInfo.categories
          .flatMap((f: string) => f.split(" / "))
          .filter((f) => !["General", "Literary"].includes(f))
          .map((c: any) => {
            return {
              name: c,
            };
          }),
      };
    }

    return {
      notionItem: bookItem,
      title,
    };
  }
}
