import type { AxiosInstance } from "axios";
import { inject, injectable } from "tsyringe";
import { IGDB_CLIENT_ID, IGDB_CLIENT_SECRET, LOGGER } from "../../fx/keys.js";
import type { Logger } from "../../fx/logger/Logger.js";
import type { IgdbConfig, NotionItem, Suggestion } from "../../types.js";
import type { DataProvider } from "../DataProvider.js";
import { createProviderClient } from "../httpClient.js";
import { NotionClient } from "../Notion/NotionClient.js";

// Renew a little early so a token can't expire in flight between the check and
// the request that uses it.
const TOKEN_EXPIRY_SKEW_MS = 60_000;

@injectable()
export class IgdbClient implements DataProvider<"IGDB"> {
  private client?: AxiosInstance;
  private tokenExpiresAt = 0;
  private pendingClient?: Promise<AxiosInstance>;

  constructor(
    @inject(IGDB_CLIENT_ID) private clientId: string,
    @inject(IGDB_CLIENT_SECRET) private clientsecret: string,
    @inject(LOGGER) private readonly logger: Logger,
  ) {}

  // Every public method needs an authenticated client. Previously each call
  // did a fresh Twitch OAuth exchange, so a single sync burned one token per
  // entry; hold the client until its token is close to expiring instead.
  private async createClient(): Promise<AxiosInstance> {
    if (this.client && Date.now() < this.tokenExpiresAt) {
      return this.client;
    }

    // Collapse concurrent callers onto one in-flight token exchange.
    this.pendingClient ??= this.authenticate().finally(() => {
      this.pendingClient = undefined;
    });

    return this.pendingClient;
  }

  private async authenticate(): Promise<AxiosInstance> {
    const client = createProviderClient(this.logger, {
      baseURL: "https://api.igdb.com/v4/",
    });

    const token = await client.post("https://id.twitch.tv/oauth2/token", {
      client_id: this.clientId,
      client_secret: this.clientsecret,
      grant_type: "client_credentials",
    });

    client.defaults.headers["Authorization"] =
      `Bearer ${token.data.access_token}`;
    client.defaults.headers["Client-ID"] = this.clientId;

    // Twitch returns `expires_in` in seconds (~60 days for client_credentials).
    const expiresInMs = Number(token.data.expires_in ?? 0) * 1000;
    this.tokenExpiresAt =
      Date.now() + Math.max(0, expiresInMs - TOKEN_EXPIRY_SKEW_MS);
    this.client = client;

    return client;
  }

  async search(query: string): Promise<Suggestion[]> {
    const client = await this.createClient();

    const { data } = await client.post(
      "/games",
      `search "${query}";
      fields
        slug,
        name,
        involved_companies.company.name,
        cover.url,
        first_release_date;
      limit 10;`,
    );

    return data.map((d: any) => {
      return {
        id: d.slug,
        title: d.name,
        releaseDate: d.first_release_date
          ? new Date(d.first_release_date * 1000)
          : "NA",
        posterPath: d.cover?.url || "",
        subtitle:
          d.involved_companies?.map((c: any) => c.company.name).join(", ") ||
          "",
      };
    });
  }

  async loadNotionEntry(
    id: string,
    dbConfig: IgdbConfig,
  ): Promise<{ notionItem: NotionItem; title: string }> {
    const client = await this.createClient();

    const {
      data: [data],
    } = await client.post(
      "/games",
      `fields
        name,
        genres.name,
        involved_companies.company.name,
        cover.url,
        artworks.url,
        rating,
        url,
        first_release_date;
      where slug = "${id}";`,
    );

    const gameItem: NotionItem = {
      properties: {
        [dbConfig.url]: {
          url: data.url,
        },
        [dbConfig.status]: {
          date: {
            start: new Date().toISOString(),
          },
        },
      },
    };

    if (data.cover?.url) {
      gameItem.cover = {
        external: {
          url: `https:${data.artworks[0].url.replace("t_thumb", "t_1080p")}`,
        },
      };
      gameItem.icon = {
        external: {
          url: `https:${data.cover.url.replace("t_thumb", "t_cover_big")}`,
        },
      };
    }

    const title = data.name;
    if (dbConfig.title) {
      gameItem.properties[dbConfig.title] = {
        title: [
          {
            text: {
              content: title,
            },
          },
        ],
      };
    }

    if (dbConfig.releaseDate && data.first_release_date) {
      gameItem.properties[dbConfig.releaseDate] = {
        date: {
          start: new Date(data.first_release_date * 1000).toISOString(),
        },
      };
    }

    if (dbConfig.genre) {
      gameItem.properties[dbConfig.genre] = {
        multi_select: data.genres.map((g: any) => {
          return {
            name: g.name,
          };
        }),
      };
    }

    if (dbConfig.companies && data.involved_companies) {
      gameItem.properties[dbConfig.companies] = {
        rich_text: [
          {
            text: {
              content: data.involved_companies
                .map((c: any) => c.company.name)
                .join(", "),
              link: {
                url: data.url,
              },
            },
          },
        ],
      };
    }

    if (dbConfig.rating && data.rating) {
      gameItem.properties[dbConfig.rating] = {
        number: data.rating,
      };
    }

    return {
      title,
      notionItem: gameItem,
    };
  }

  async *sync(
    notionClient: NotionClient,
    dbConfig: IgdbConfig,
  ): AsyncGenerator<string> {
    const entriesToLoad = await notionClient.listDatabaseEntries(dbConfig);

    for (const entry of entriesToLoad) {
      const url: string = (
        Object.values(entry.properties).find((p) => p.id == dbConfig.url) as any
      ).url;
      const id = this.extractId(url);

      // load from tmdb
      const { notionItem, title } = await this.loadNotionEntry(id, dbConfig);

      // populate in notion
      await notionClient.updatePage({
        ...notionItem,
        page_id: entry.id,
      });

      yield `Loaded ${title}.`;
    }

    yield "Finished synching games.";
  }

  private extractId(url: string): string {
    return /https:\/\/www.igdb.com\/games\/(.*)$/i.exec(url)?.[1] as string;
  }
}
