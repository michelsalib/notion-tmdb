import type { AxiosInstance } from "axios";
import { inject, injectable } from "tsyringe";
import { LOGGER } from "../../fx/keys.js";
import type { Logger } from "../../fx/logger/Logger.js";
import type {
  BilletReducDbConfig,
  NotionItem,
  Suggestion,
  SyncEvent,
  SyncOptions,
} from "../../types.js";
import { entryUrl } from "../../utils/providerId.js";
import { runSync } from "../../utils/syncRun.js";
import type { DataProvider } from "../DataProvider.js";
import { createProviderClient } from "../httpClient.js";
import { NotionClient } from "../Notion/NotionClient.js";

const BASE_URL = "https://www.billetreduc.com";

// Shape of one entry returned by the autocomplete API. `t` is the result type
// (1 = show/spectacle, 16 = venue/salle, …); we only keep shows.
interface AutocompleteItem {
  u: string; // path, e.g. "/spectacle/hamlet-372686"
  l: string; // label / title
  t: number; // result type
  salle?: string; // venue name
  ville?: string; // city
  ph?: string; // photo id (a "vz-<uuid>" or the numeric event id)
}

@injectable()
export class BilletReducClient implements DataProvider<"BilletReduc"> {
  private readonly client: AxiosInstance;

  // Detail pages are ~300 KB of HTML, so response bodies must stay out of the
  // (budget-capped) GCP logs. `createProviderClient` already pins `data: false`
  // for every provider, so no special case is needed here any more.
  constructor(@inject(LOGGER) logger: Logger) {
    this.client = createProviderClient(logger, {
      baseURL: BASE_URL,
      headers: {
        // billetreduc serves an empty body to obvious bots; look like a browser.
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "fr-FR,fr;q=0.9",
      },
    });
  }

  async search(query: string): Promise<Suggestion[]> {
    const { data } = await this.client.get<AutocompleteItem[]>(
      "/cgi/api/web/search/autocomplete/v2",
      { params: { s: query } },
    );

    return (Array.isArray(data) ? data : [])
      .filter((item) => item.t === 1 && item.u?.startsWith("/spectacle/"))
      .map((item) => {
        const subtitle = [item.salle, item.ville].filter(Boolean).join(", ");

        return {
          id: item.u,
          title: item.l,
          releaseDate: "",
          posterPath: item.ph ? `${BASE_URL}/zg/n300/${item.ph}.jpeg` : "",
          subtitle,
        } satisfies Suggestion;
      });
  }

  async loadNotionEntry(
    id: string,
    dbConfig: BilletReducDbConfig,
  ): Promise<{ notionItem: NotionItem; title: string }> {
    const path = this.toBilletReducPath(id);
    const { data: html } = await this.client.get<string>(path, {
      responseType: "text",
      transformResponse: (raw) => raw,
    });

    const graph = this.extractJsonLd(html);
    const event = graph.find((node) => this.hasType(node, "Event"));
    if (!event) {
      throw new Error(`No play data found at ${path}`);
    }
    const breadcrumb = graph.find((node) =>
      this.hasType(node, "BreadcrumbList"),
    );

    const url = event.url || `${BASE_URL}${path}`;
    const poster = this.firstImage(event.image);

    const playItem: NotionItem = {
      properties: {
        [dbConfig.url]: {
          url,
        },
        [dbConfig.status]: {
          date: {
            start: new Date().toISOString(),
          },
        },
      },
    };

    if (poster) {
      playItem.cover = { external: { url: poster } };
      playItem.icon = { external: { url: poster } };
    }

    const title: string = event.name;
    if (dbConfig.title) {
      playItem.properties[dbConfig.title] = {
        title: [{ text: { content: title } }],
      };
    }

    if (dbConfig.genre) {
      playItem.properties[dbConfig.genre] = {
        multi_select: this.extractGenres(breadcrumb).map((name) => ({ name })),
      };
    }

    const venue: string | undefined = event.location?.name;
    if (dbConfig.venue && venue) {
      playItem.properties[dbConfig.venue] = {
        rich_text: [{ text: { content: venue, link: { url } } }],
      };
    }

    const authors = this.extractAuthors(event);
    if (dbConfig.author && authors) {
      playItem.properties[dbConfig.author] = {
        rich_text: [{ text: { content: authors, link: { url } } }],
      };
    }

    return { notionItem: playItem, title };
  }

  async *sync(
    notionClient: NotionClient,
    dbConfig: BilletReducDbConfig,
    options?: SyncOptions,
  ): AsyncGenerator<SyncEvent> {
    const entriesToLoad = await notionClient.listDatabaseEntries(
      dbConfig,
      options,
    );

    yield* runSync(
      entriesToLoad,
      "play",
      async (entry) => {
        const url = entryUrl(entry, dbConfig.url);

        if (!url) {
          throw new Error("no link to sync from");
        }

        const { notionItem, title } = await this.loadNotionEntry(url, dbConfig);

        await notionClient.updatePage({
          ...notionItem,
          page_id: entry.id,
        });

        return title;
      },
      (entry) => entryUrl(entry, dbConfig.url),
    );
  }

  // Accepts a "/spectacle/…" path or a full billetreduc URL (pasted into
  // Notion) and returns a path safe to fetch from BASE_URL. Rejects any other
  // host so a stray value can't turn into an arbitrary outbound request.
  private toBilletReducPath(idOrUrl: string): string {
    if (/^https?:\/\//i.test(idOrUrl)) {
      const parsed = new URL(idOrUrl);
      if (!parsed.hostname.endsWith("billetreduc.com")) {
        throw new Error(`Unexpected host: ${parsed.hostname}`);
      }
      return parsed.pathname + parsed.search;
    }

    return idOrUrl.startsWith("/") ? idOrUrl : `/${idOrUrl}`;
  }

  private extractJsonLd(html: string): any[] {
    // The type attribute is plain `application/ld+json` on some pages and
    // HTML-entity-encoded (`ld&#x2B;json`) on the play detail pages.
    const re =
      /<script type="application\/ld(?:\+|&#x2B;)json">([\s\S]*?)<\/script>/gi;
    const nodes: any[] = [];

    let match: RegExpExecArray | null = re.exec(html);
    while (match !== null) {
      try {
        const parsed = JSON.parse(match[1]!.replace(/&#x2B;/g, "+"));
        if (Array.isArray(parsed["@graph"])) {
          nodes.push(...parsed["@graph"]);
        } else {
          nodes.push(parsed);
        }
      } catch {
        // Ignore malformed blocks (e.g. review snippets with stray control chars).
      }
      match = re.exec(html);
    }

    return nodes;
  }

  private hasType(node: any, type: string): boolean {
    const t = node?.["@type"];
    return Array.isArray(t) ? t.includes(type) : t === type;
  }

  // Breadcrumb: [root, city, genre, sub-genre, …, play title]. Keep the
  // category pages, dropping the root ("/"), the city ("/a-<city>/") and the
  // play itself ("/spectacle/…").
  private extractGenres(breadcrumb: any): string[] {
    const items: any[] = breadcrumb?.itemListElement ?? [];

    return items
      .filter((entry) => {
        const href: string = entry?.item ?? "";
        let pathname: string;
        try {
          pathname = new URL(href, BASE_URL).pathname;
        } catch {
          return false;
        }
        return (
          pathname !== "/" &&
          !/^\/a-[^/]*\/$/.test(pathname) &&
          !pathname.startsWith("/spectacle/")
        );
      })
      .map((entry) => String(entry.name))
      .filter(Boolean);
  }

  private extractAuthors(event: any): string | undefined {
    const author = event?.workPerformed?.author;
    if (!author) {
      return undefined;
    }
    const names = (Array.isArray(author) ? author : [author])
      .map((a: any) => a?.name)
      .filter(Boolean);

    return names.length ? names.join(", ") : undefined;
  }

  private firstImage(image: unknown): string | undefined {
    if (Array.isArray(image)) {
      return image[0];
    }
    return typeof image === "string" ? image : undefined;
  }
}
