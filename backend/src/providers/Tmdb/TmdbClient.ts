import type { AxiosInstance } from "axios";
import { inject, injectable } from "tsyringe";
import { LOGGER, TMDB_API_KEY } from "../../fx/keys.js";
import type { Logger } from "../../fx/logger/Logger.js";
import type {
  NotionItem,
  Suggestion,
  SyncEvent,
  SyncOptions,
  TmdbDbConfig,
  UrlMatch,
} from "../../types.js";
import { entryUrl, idAfterSegment } from "../../utils/providerId.js";
import { runSync } from "../../utils/syncRun.js";
import type { DataProvider } from "../DataProvider.js";
import { createProviderClient } from "../httpClient.js";
import { NotionClient } from "../Notion/NotionClient.js";

@injectable()
export class TmdbClient implements DataProvider<"TMDB"> {
  private readonly client: AxiosInstance;

  constructor(
    @inject(TMDB_API_KEY) tmdbApiKey: string,
    @inject(LOGGER) logger: Logger,
  ) {
    this.client = createProviderClient(logger, {
      baseURL: "https://api.themoviedb.org/3/",
      headers: {
        common: {
          Authorization: `Bearer ${tmdbApiKey}`,
        },
      },
    });
  }

  async *sync(
    notionClient: NotionClient,
    dbConfig: TmdbDbConfig,
    options?: SyncOptions,
  ): AsyncGenerator<SyncEvent> {
    const entriesToLoad = await notionClient.listDatabaseEntries(
      dbConfig,
      options,
    );

    yield* runSync(
      entriesToLoad,
      "film",
      async (entry) => {
        const id = idAfterSegment(entryUrl(entry, dbConfig.url), "movie");

        if (!id) {
          throw new Error("not a TMDB film link");
        }

        // load from tmdb
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
    const { data } = await this.client.get("/search/movie", {
      params: {
        query: query,
        include_adult: false,
        language: "fr-FR",
        page: 1,
      },
    });

    return data.results.map((s: any) => {
      return {
        id: s.id,
        title: s.title,
        releaseDate: s.release_date,
        // Guarded: `poster_path` is null for a film with no artwork, and an
        // unconditional template produced the string ".../w500null" — truthy,
        // so the frontend's "no poster" branch never ran and the row rendered
        // the browser's broken-image glyph instead of a placeholder.
        posterPath: s.poster_path
          ? `https://image.tmdb.org/t/p/w500${s.poster_path}`
          : "",
        subtitle: s.original_title != s.title ? s.original_title : "",
      } as Suggestion;
    });
  }

  // Exact: `loadNotionEntry` builds this same string, so a stored row either
  // is this film or is not. A `contains` on the bare id would match /movie/271
  // for id 27.
  urlFor(id: string): UrlMatch {
    return { equals: `https://www.themoviedb.org/movie/${id}` };
  }

  async loadNotionEntry(
    tmdbId: string,
    dbConfig: TmdbDbConfig,
  ): Promise<{ notionItem: NotionItem; title: string }> {
    const { data } = await this.client.get(`/movie/${tmdbId}`, {
      params: {
        append_to_response: "credits,release_dates",
        language: "fr-FR",
      },
    });

    const movieItem: NotionItem = {
      cover: {
        external: {
          url: `https://image.tmdb.org/t/p/original/${data.poster_path}`,
        },
      },
      icon: {
        external: {
          url: `https://image.tmdb.org/t/p/original/${data.poster_path}`,
        },
      },
      properties: {
        [dbConfig.url]: {
          url: `https://www.themoviedb.org/movie/${tmdbId}`,
        },
        [dbConfig.status]: {
          date: {
            start: new Date().toISOString(),
          },
        },
      },
    };

    const title = data.title;
    if (dbConfig.title) {
      movieItem.properties[dbConfig.title] = {
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
      movieItem.properties[dbConfig.releaseDate] = {
        date: {
          start:
            data.release_dates.results
              .find((i: any) => i.iso_3166_1 == "FR")
              ?.release_dates?.find((i: any) => i.type == 3)?.release_date ||
            data.release_date,
        },
      };
    }

    // Guarded: plenty of TMDB entries credit no director, and reading `.name`
    // off the miss threw for the whole entry rather than skipping one column.
    // Rare enough to survive unnoticed in `add`; the landing-page preview runs
    // this against whatever a stranger types.
    const director = data.credits?.crew?.find((i: any) => i.job == "Director");

    if (dbConfig.director && director) {
      movieItem.properties[dbConfig.director] = {
        rich_text: [
          {
            text: {
              content: director.name,
              link: {
                url: `https://www.themoviedb.org/person/${director.id}`,
              },
            },
          },
        ],
      };
    }

    if (dbConfig.genre) {
      movieItem.properties[dbConfig.genre] = {
        multi_select: data.genres.map((g: any) => {
          return {
            name: g.name,
          };
        }),
      };
    }

    if (dbConfig.rating) {
      movieItem.properties[dbConfig.rating] = {
        number: Number(data.vote_average),
      };
    }

    return {
      notionItem: movieItem,
      title,
    };
  }
}
