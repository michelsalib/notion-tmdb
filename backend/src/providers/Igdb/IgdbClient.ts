import type { AxiosInstance } from "axios";
import { inject, injectable } from "tsyringe";
import { IGDB_CLIENT_ID, IGDB_CLIENT_SECRET, LOGGER } from "../../fx/keys.js";
import type { Logger } from "../../fx/logger/Logger.js";
import type {
  IgdbConfig,
  NotionItem,
  Suggestion,
  SyncEvent,
  SyncOptions,
  UrlMatch,
} from "../../types.js";
import { entryUrl, idAfterSegment } from "../../utils/providerId.js";
import { runSync } from "../../utils/syncRun.js";
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
        // Empty, not "NA": this is display copy, and the suggestion list used
        // to print the placeholder verbatim as the year.
        releaseDate: d.first_release_date
          ? new Date(d.first_release_date * 1000)
          : "",
        posterPath: d.cover?.url || "",
        subtitle:
          d.involved_companies?.map((c: any) => c.company.name).join(", ") ||
          "",
      };
    });
  }

  // Exact, for the same reason as TMDB: slugs nest, so `contains: "hades"`
  // would claim /games/hades-ii.
  urlFor(id: string): UrlMatch {
    return { equals: `https://www.igdb.com/games/${id}` };
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
        platforms.name,
        involved_companies.company.name,
        cover.url,
        artworks.url,
        rating,
        aggregated_rating,
        url,
        first_release_date;
      where slug = "${id}";`,
    );

    // An unknown slug comes back as an empty array, not a 404.
    if (!data) {
      throw new Error(`no IGDB game with slug "${id}"`);
    }

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

    // Artwork and cover art are independently optional on IGDB, so they get
    // separate guards: a game with box art but no artworks (Type Help, say)
    // used to pass a `cover.url` check and then index into a missing
    // `artworks`. The page banner falls back to the box art in that case.
    const banner = data.artworks?.[0]?.url ?? data.cover?.url;
    if (banner) {
      gameItem.cover = {
        external: {
          url: `https:${banner.replace("t_thumb", "t_1080p")}`,
        },
      };
    }

    if (data.cover?.url) {
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

    if (dbConfig.genre && data.genres) {
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

    if (dbConfig.platforms && data.platforms) {
      gameItem.properties[dbConfig.platforms] = {
        multi_select: data.platforms.map((p: any) => {
          return {
            name: p.name,
          };
        }),
      };
    }

    if (dbConfig.rating && data.rating) {
      gameItem.properties[dbConfig.rating] = {
        number: data.rating,
      };
    }

    // Distinct from `rating`, which is IGDB's own users. A game too obscure or
    // too new to have been reviewed carries no `aggregated_rating` at all,
    // rather than a zero.
    if (dbConfig.criticRating && data.aggregated_rating) {
      gameItem.properties[dbConfig.criticRating] = {
        number: data.aggregated_rating,
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
    options?: SyncOptions,
  ): AsyncGenerator<SyncEvent> {
    const entriesToLoad = await notionClient.listDatabaseEntries(
      dbConfig,
      options,
    );

    yield* runSync(
      entriesToLoad,
      "game",
      async (entry) => {
        const id = idAfterSegment(entryUrl(entry, dbConfig.url), "games");

        if (!id) {
          throw new Error("not an IGDB game link");
        }

        // load from igdb
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
}
