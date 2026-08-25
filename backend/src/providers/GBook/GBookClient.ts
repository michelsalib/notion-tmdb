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
  // Not the full date the name suggests: a bare year ("2010") or a year-month
  // is at least as common, and it is absent altogether on plenty of volumes.
  // It was declared as `${number}-${number}-${number}`, which was a fiction.
  publishedDate?: string;
  // Optional in fact as well as in the response: it was declared required, so
  // the guard below looked redundant rather than load-bearing.
  categories?: string[];
  pageCount?: number;
  imageLinks?: {
    thumbnail: string;
  };
  // `canonicalVolumeLink` is deliberately not declared. It is in the response,
  // but it is the dead Play Store link described in `loadNotionEntry` —
  // leaving it off the type means reaching for it again is a compile error.
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

  // Matches on the bare id rather than on a URL shape, which is what lets the
  // written form change without stranding anything: rows still hold the old
  // `play.google.com/store/books/details?id=…` that `canonicalVolumeLink`
  // used to supply, newer ones hold `books.google.com/books?id=…`, and a user
  // may have pasted either by hand. The id is an opaque token that appears
  // verbatim in all of them.
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

    // NOT `canonicalVolumeLink`. Google returns
    // `play.google.com/store/books/details?id=…` for a great many volumes, and
    // that 404s for anything the Play store does not sell — which is most of
    // what a reader owns on paper. `books.google.com/books?id=…` answers 200
    // for the same id. `urlFor` matches on the bare id, and `idFromQuery`
    // reads `?id=`, so both forms keep working and a re-sync repairs the rows
    // that already hold a dead Play link.
    const volumeUrl = `https://books.google.com/books?id=${id}`;

    const bookItem: NotionItem = {
      properties: {
        [dbConfig.url]: {
          url: volumeUrl,
        },
        [dbConfig.status]: {
          date: {
            start: new Date().toISOString(),
          },
        },
      },
    };

    // The key has to be *absent*, not empty: Notion rejects the whole page
    // with "body.icon.external.url should be populated, instead was ``" —
    // and plenty of volumes carry no `imageLinks` at all, editions of a title
    // Google has never scanned especially. Sending `""` is what made adding
    // one fail with "Could not add that book", and made `sync` skip its row
    // on every run.
    const thumbnail = volumeInfo.imageLinks?.thumbnail;

    if (thumbnail) {
      bookItem.cover = { external: { url: thumbnail } };
      bookItem.icon = { external: { url: thumbnail } };
    }

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

    // Absent on a fair number of volumes, and `start: undefined` is not the
    // same as leaving the column alone — same trap as the cover above.
    if (dbConfig.releaseDate && volumeInfo.publishedDate) {
      bookItem.properties[dbConfig.releaseDate] = {
        date: {
          // Often a bare year ("2010") or a year-month, never the full date
          // the field's name suggests. Both are valid ISO 8601 and Notion
          // takes them, so widen rather than discard: a year is worth more in
          // the column than a blank.
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
                url: volumeUrl,
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
                url: volumeUrl,
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
