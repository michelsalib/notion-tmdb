import type { AxiosInstance } from "axios";
import { inject, injectable } from "tsyringe";
import { GBOOK_API_KEY, LOGGER } from "../../fx/keys.js";
import type { Logger } from "../../fx/logger/Logger.js";
import type {
  GBookDbConfig,
  NotionItem,
  Suggestion,
  SyncEvent,
  SyncOptions,
  UrlMatch,
} from "../../types.js";
import { entryUrl, idFromQuery } from "../../utils/providerId.js";
import { retriable } from "../../utils/retriable.js";
import { runSync } from "../../utils/syncRun.js";
import type { DataProvider } from "../DataProvider.js";
import { createProviderClient } from "../httpClient.js";
import { NotionClient } from "../Notion/NotionClient.js";

interface VolumeInfo {
  title: string;
  authors?: string[];
  publisher?: string;
  publishedDate: `${number}-${number}-${number}`;
  // Optional in fact as well as in the response: it was declared required, so
  // the guard below looked redundant rather than load-bearing.
  categories?: string[];
  pageCount?: number;
  imageLinks?: {
    thumbnail: string;
  };
  canonicalVolumeLink: string;
  subtitle?: string;
}

@injectable()
export class GBookClient implements DataProvider<"GBook"> {
  private readonly client: AxiosInstance;

  constructor(
    @inject(GBOOK_API_KEY) gbookApiKey: string,
    @inject(LOGGER) private readonly logger: Logger,
  ) {
    this.client = createProviderClient(logger, {
      baseURL: "https://www.googleapis.com/books/v1/",
      // Keyless calls are attributed to a shared anonymous consumer project
      // whose daily quota Google set to 0, so every one of them now 429s.
      //
      // Sent as a header rather than the documented `?key=` param on purpose:
      // axios would have to merge it with each call's own `params`, and
      // `Logger.bindAxios` pins `headers: false`, so this way it cannot reach
      // Cloud Logging either.
      headers: {
        common: {
          "X-Goog-Api-Key": gbookApiKey,
        },
      },
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
    // `/volumes?q=` answers 503 `backendFailed` a large fraction of the time,
    // independently of the key and of this project's quota — `/volumes/{id}`
    // served from the same key is solid. `isRetriable` already covers 5xx.
    const { data } = await retriable(
      this.client,
      "get",
      this.logger,
    )("/volumes", {
      params: {
        q: query,
      },
    });

    // Absent, not empty, when nothing matched — so mapping it unguarded made a
    // zero-result search a TypeError instead of an empty dropdown.
    const items: { id: string; volumeInfo: VolumeInfo }[] = data.items ?? [];

    return items.map((s) => {
      let subtitle = s.volumeInfo.authors?.join(", ") || "NA";
      if (s.volumeInfo.subtitle) {
        subtitle += " - " + s.volumeInfo.subtitle;
      }

      return {
        id: s.id,
        title: s.volumeInfo.title,
        // Empty, not "NA": this is display copy, and the suggestion list used
        // to print the placeholder verbatim as the year.
        releaseDate: s.volumeInfo.publishedDate || "",
        posterPath: s.volumeInfo.imageLinks?.thumbnail || "",
        subtitle,
      } as Suggestion;
    });
  }

  // Google stores `canonicalVolumeLink`, whose shape includes the book's
  // title and so cannot be rebuilt from the id. The volume id is a 12-character
  // opaque token that appears in it verbatim.
  urlFor(id: string): UrlMatch {
    return { contains: id };
  }

  async loadNotionEntry(
    id: string,
    dbConfig: GBookDbConfig,
  ): Promise<{ notionItem: NotionItem; title: string }> {
    const { data } = await retriable(
      this.client,
      "get",
      this.logger,
    )(`/volumes/${id}`);
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

    if (dbConfig.publisher && volumeInfo.publisher) {
      bookItem.properties[dbConfig.publisher] = {
        rich_text: [
          {
            text: {
              content: volumeInfo.publisher,
              link: {
                url: volumeInfo.canonicalVolumeLink,
              },
            },
          },
        ],
      };
    }

    // Absent for volumes Google has no scan of, and 0 on a fair number of
    // ebook entries — writing either over an existing count loses information.
    if (dbConfig.pageCount && volumeInfo.pageCount) {
      bookItem.properties[dbConfig.pageCount] = {
        number: volumeInfo.pageCount,
      };
    }

    // `categories` is absent on a great many volumes, and calling `.flatMap`
    // on the miss threw for the whole entry rather than skipping one column.
    if (dbConfig.genre && volumeInfo.categories) {
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
