import { Client } from "@notionhq/client";
import {
  BlockObjectResponse,
  CreateDatabaseParameters,
  CreatePageParameters,
  DatabaseObjectResponse,
  PageObjectResponse,
  UpdatePageParameters,
} from "@notionhq/client/build/src/api-endpoints.js";
import { inject, injectable } from "tsyringe";
import { LOGGER, USER } from "../../fx/keys.js";
import type { Logger } from "../../fx/logger/Logger.js";
import type {
  Config,
  NotionPage,
  NotionUserData,
  SyncOptions,
} from "../../types.js";
import { retriable } from "../../utils/retriable.js";

/**
 * A page's own title, whatever its title property is called.
 *
 * Workspace-level pages normally key it as `title`, but a page can be renamed,
 * so the property is found by type rather than by name.
 */
function pageTitle(page: PageObjectResponse): string {
  const property = Object.values(page.properties ?? {}).find(
    (p): p is Extract<typeof p, { type: "title" }> => p.type === "title",
  );

  const text = property?.title?.map((t) => t.plain_text).join("") ?? "";

  return text.trim() || "Untitled";
}

@injectable()
export class NotionClient {
  private readonly client: Client;

  constructor(
    @inject(USER) private readonly user: NotionUserData<any>,
    @inject(LOGGER) private readonly logger: Logger,
  ) {
    this.client = new Client({
      auth: this.user.notionWorkspace.accessToken,
    });
  }

  async *listContent(): AsyncGenerator<
    DatabaseObjectResponse | PageObjectResponse | BlockObjectResponse
  > {
    let contentCursor;

    // on all page/db
    do {
      const result = await retriable(
        this.client,
        "search",
        this.logger,
      )({
        start_cursor: contentCursor || undefined,
      });

      for (const content of result.results) {
        yield content as DatabaseObjectResponse | PageObjectResponse;

        if (content.object == "page") {
          let blockCursor;

          // on all page blocks
          do {
            const blocks = await retriable(
              this.client.blocks.children,
              "list",
              this.logger,
            )({
              block_id: content.id,
              start_cursor: blockCursor || undefined,
            });

            for (const block of blocks.results) {
              yield block as BlockObjectResponse;
            }

            blockCursor = blocks.next_cursor;
          } while (blockCursor);
        }
      }

      contentCursor = result.next_cursor;
    } while (contentCursor);
  }

  async listDatabases(): Promise<DatabaseObjectResponse[]> {
    const { results } = await this.client.search({
      filter: {
        property: "object",
        value: "database",
      },
    });

    return results as any;
  }

  /**
   * Pages the integration can see, as candidate parents for a new database.
   *
   * Notion databases must be created inside a page, so a user with no shared
   * page cannot be given one — the caller turns an empty list into an
   * instruction to share a page rather than a failed API call.
   */
  async listPages(): Promise<NotionPage[]> {
    const { results } = await this.client.search({
      filter: {
        property: "object",
        value: "page",
      },
    });

    return (results as PageObjectResponse[])
      .filter((page) => page.parent?.type !== "database_id")
      .map((page) => ({ id: page.id, title: pageTitle(page) }));
  }

  /**
   * Create a database already shaped for this connector.
   *
   * The properties come from the shared field registry, so the mapping the
   * caller derives from the response is exact — a user who takes this path
   * skips column mapping entirely instead of guessing at it.
   */
  async createDatabase(
    parentPageId: string,
    title: string,
    properties: CreateDatabaseParameters["properties"],
  ): Promise<DatabaseObjectResponse> {
    const response = await this.client.databases.create({
      parent: { type: "page_id", page_id: parentPageId },
      title: [{ type: "text", text: { content: title } }],
      properties,
    });

    return response as DatabaseObjectResponse;
  }

  /**
   * The rows a sync run should touch: linked, and either never synced or
   * synced before `staleBefore`.
   *
   * Paginated. It used to make a single unpaginated `query`, so a run silently
   * stopped at Notion's 100-row page however large the database was. That was
   * survivable while sync only ever picked up newly added rows; with a
   * re-sync-by-age cutoff a first run can legitimately match every row, and
   * quietly doing the first 100 of 500 would look like the feature was broken.
   */
  async listDatabaseEntries(
    dbConfig: Config,
    options: SyncOptions = {},
  ): Promise<PageObjectResponse[]> {
    const freshness: any[] = [
      { property: dbConfig.status, date: { is_empty: true } },
    ];

    if (options.staleBefore) {
      freshness.push({
        property: dbConfig.status,
        date: { before: options.staleBefore },
      });
    }

    const entries: PageObjectResponse[] = [];
    let cursor: string | undefined;

    do {
      const { results, next_cursor } = await retriable(
        this.client.databases,
        "query",
        this.logger,
      )({
        database_id: dbConfig.id,
        start_cursor: cursor,
        filter: {
          and: [
            { property: dbConfig.url, url: { is_not_empty: true } },
            freshness.length === 1 ? freshness[0] : { or: freshness },
          ],
        } as any,
      });

      entries.push(...(results as PageObjectResponse[]));
      cursor = next_cursor ?? undefined;
    } while (cursor);

    return entries;
  }

  async listExistingItems(dbConfig: Config, ids: string[]): Promise<string[]> {
    const existingItems: PageObjectResponse[] = [];

    for (let page = 0; page * 100 < ids.length; page++) {
      const existingItemsToSearch = ids.slice(page * 100, (page + 1) * 100);
      let cursor: string | undefined;

      do {
        const { results, next_cursor } = await retriable(
          this.client.databases,
          "query",
          this.logger,
        )({
          database_id: dbConfig.id,
          start_cursor: cursor,
          filter: {
            or: existingItemsToSearch.map((id) => {
              return {
                property: dbConfig.url,
                rich_text: {
                  equals: id,
                },
              };
            }),
          },
        });

        existingItems.push(...(results as PageObjectResponse[]));
        cursor = next_cursor ?? undefined;
      } while (cursor);
    }

    return existingItems.map(
      (i) =>
        (Object.values(i.properties).find((p) => p.id == dbConfig.url) as any)
          .rich_text[0].text.content,
    );
  }

  async updatePage(page: UpdatePageParameters): Promise<void> {
    await this.client.pages.update(page);
  }

  async createPage(page: CreatePageParameters): Promise<string | undefined> {
    const response = await this.client.pages.create(page);

    return "url" in response ? response.url : undefined;
  }
}
