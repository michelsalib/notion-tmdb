import axios, { AxiosInstance } from "axios";
import { fluentProvide } from "inversify-binding-decorators";
import { DbConfig, DOMAIN, NotionItem, Suggestion } from "../../types.js";
import { DataProvider } from "../DataProvider.js";
import { DATA_PROVIDER, DOMAIN as DOMAIN_KEY } from "../../fx/keys.js";

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

@(fluentProvide(DATA_PROVIDER).when(r => r.parentContext.container.get<DOMAIN>(DOMAIN_KEY) == "GBook").done())
export class GBookClient implements DataProvider {
  private readonly client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: "https://www.googleapis.com/books/v1/",
    });
  }

  extractId(url: string): string {
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

  async loadNotionEntry(id: string, dbConfig: DbConfig): Promise<NotionItem> {
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

    if (dbConfig.year) {
      bookItem.properties[dbConfig.year] = {
        number: Number(volumeInfo.publishedDate.split("-")[0]),
      };
    }

    if (dbConfig.director) {
      bookItem.properties[dbConfig.director] = {
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
