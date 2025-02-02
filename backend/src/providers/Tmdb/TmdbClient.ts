import axios, { AxiosInstance } from "axios";
import { inject } from "inversify";
import { fluentProvide } from "inversify-binding-decorators";
import {
  DATA_PROVIDER,
  DOMAIN as DOMAIN_KEY,
  TMDB_API_KEY,
} from "../../fx/keys.js";
import type {
  DOMAIN,
  NotionItem,
  Suggestion,
  TmdbDbConfig,
} from "../../types.js";
import { DataProvider } from "../DataProvider.js";
import { NotionClient } from "../Notion/NotionClient.js";
import { errorLogger, requestLogger, responseLogger } from "axios-logger";

@(fluentProvide(DATA_PROVIDER)
  .when((r) => r.parentContext.container.get<DOMAIN>(DOMAIN_KEY) == "TMDB")
  .done())
export class TmdbClient implements DataProvider<"TMDB"> {
  private readonly client: AxiosInstance;

  constructor(@inject(TMDB_API_KEY) tmdbApiKey: string) {
    this.client = axios.create({
      baseURL: "https://api.themoviedb.org/3/",
      headers: {
        common: {
          Authorization: `Bearer ${tmdbApiKey}`,
        },
      },
    });

    this.client.interceptors.request.use(requestLogger, errorLogger);
    this.client.interceptors.response.use(responseLogger, errorLogger);
  }

  async *sync(
    notionClient: NotionClient,
    dbConfig: TmdbDbConfig,
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

    yield "Finished synching movies.";
  }

  private extractId(url: string): string {
    return /https:\/\/www\.themoviedb\.org\/movie\/(.*)$/i.exec(
      url,
    )?.[1] as string;
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
        posterPath: `https://image.tmdb.org/t/p/w500${s.poster_path}`,
        subtitle: s.original_title != s.title ? s.original_title : "",
      } as Suggestion;
    });
  }

  async loadNotionEntry(
    tmdbId: string,
    dbConfig: TmdbDbConfig,
  ): Promise<{ notionItem: NotionItem; title: string }> {
    const { data } = await this.client.get(`/movie/${tmdbId}`, {
      params: {
        append_to_response: "credits",
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
          start: data.release_date,
        },
      };
    }

    if (dbConfig.director) {
      const director = data.credits.crew.find((i: any) => i.job == "Director");

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
