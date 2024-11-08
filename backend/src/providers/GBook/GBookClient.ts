import axios, { AxiosInstance } from "axios";
import { fluentProvide } from "inversify-binding-decorators";
import type {
  DOMAIN,
  GBookDbConfig,
  NotionItem,
  Suggestion,
} from "../../types.js";
import { DataProvider } from "../DataProvider.js";
import { DATA_PROVIDER, DOMAIN as DOMAIN_KEY } from "../../fx/keys.js";
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

@(fluentProvide(DATA_PROVIDER)
  .when((r) => r.parentContext.container.get<DOMAIN>(DOMAIN_KEY) == "GBook")
  .done())
export class GBookClient implements DataProvider<"GBook"> {
  private readonly client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: "https://www.googleapis.com/books/v1/",
    });
  }

  async sync(notionClient: NotionClient, dbConfig: GBookDbConfig): Promise<void> {
    const entriesToLoad = await notionClient.listDatabaseEntries(dbConfig);

    for (const entry of entriesToLoad) {
      const url: string = (
        Object.values(entry.properties).find(
          (p) => p.id == dbConfig.url,
        ) as any
      ).url;
      const id = this.extractId(url);

      // load from tmdb
      const newEntry = await this.loadNotionEntry(id, dbConfig);

      // populate in notion
      await notionClient.updatePage({
        ...newEntry,
        page_id: entry.id,
      });
    }
  }

  private extractId(url: string): string {
    return /https:\/\/www\.googleapis\.com\/books\/v1\/volumes\/(.*)$/i.exec(
      url,
    )?.[1] as string;
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
  ): Promise<NotionItem> {
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
          status: {
            name: "Done",
          },
        },
      },
    };

    if (dbConfig.title) {
      bookItem.properties[dbConfig.title] = {
        title: [
          {
            text: {
              content: volumeInfo.title,
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

    return bookItem;
  }
}
