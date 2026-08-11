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
  UrlMatch,
} from "../../types.js";
import type { RestoreTarget } from "../../utils/notionRestore.js";
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

/** Told about a subtree the walk could not read, so the walk can carry on. */
export type SkipReporter = (subject: string, error: unknown) => void;

/**
 * Blocks whose children belong to another entry in `search`, not to this one.
 */
const OPAQUE_CHILDREN = new Set(["child_page", "child_database"]);

const MAX_BLOCK_DEPTH = 20;

/** Notion's cap on one search response. */
const SEARCH_PAGE_SIZE = 100;

/** Enough for a picker; nobody scrolls a thousand-item dropdown. */
const MAX_PARENT_PAGES = 100;

/** And a ceiling on how far `listPages` will look for them. */
const MAX_PAGE_SEARCHES = 20;

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

  /**
   * Every page, database and block the integration can see.
   *
   * `onSkip` is called for a subtree that could not be listed, and the walk
   * continues. One page deleted between the `search` that named it and the
   * `children.list` that reads it used to throw straight out of the generator,
   * discarding a backup of the entire workspace. The caller decides what a
   * skip means — `NotionBackup` fails the run only if *nothing* was readable,
   * so an expired token still surfaces as an error rather than as an empty zip.
   */
  async *listContent(
    onSkip?: SkipReporter,
  ): AsyncGenerator<
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
          yield* this.listBlocks(content.id, 0, new Set(), onSkip);
        }
      }

      contentCursor = result.next_cursor;
    } while (contentCursor);
  }

  /**
   * One block level, then each child level under it.
   *
   * This used to list a page's top-level children and stop, so every subtree
   * under a toggle, column, table or callout was missing from the archive —
   * silently, because the zip still built and the run still reported success.
   */
  private async *listBlocks(
    parentId: string,
    depth: number,
    seen: Set<string>,
    onSkip?: SkipReporter,
  ): AsyncGenerator<BlockObjectResponse> {
    // `seen` closes the loop a pair of synced blocks can form by referencing
    // each other; the depth cap is the backstop for anything it misses.
    if (depth >= MAX_BLOCK_DEPTH || seen.has(parentId)) {
      return;
    }
    seen.add(parentId);

    let blockCursor;

    do {
      let blocks: Awaited<ReturnType<typeof this.client.blocks.children.list>>;

      try {
        blocks = await retriable(
          this.client.blocks.children,
          "list",
          this.logger,
        )({
          block_id: parentId,
          start_cursor: blockCursor || undefined,
        });
      } catch (error) {
        onSkip?.(parentId, error);

        return;
      }

      for (const block of blocks.results as BlockObjectResponse[]) {
        yield block;

        // A child page or database is its own entry in `search`, so its blocks
        // are walked from there. Descending here would archive every nested
        // page once per ancestor.
        if (block.has_children && !OPAQUE_CHILDREN.has(block.type)) {
          yield* this.listBlocks(block.id, depth + 1, seen, onSkip);
        }
      }

      blockCursor = blocks.next_cursor;
    } while (blockCursor);
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
   * (A restore needs no picker — see `createRestoreRoot`.)
   *
   * Notion has no way to ask search for "pages that are not database rows", so
   * the rows are dropped here — and that is why this has to be paginated. It
   * used to make one unpaginated call and filter its 100 results, and search
   * returns the most recently edited things first. In a workspace these
   * connectors are actually being used on, the most recently edited pages are
   * the database rows they keep rewriting, so all 100 results were rows, every
   * one was filtered out, and a user with plenty of shared pages was told to go
   * and share one.
   *
   * Bounded at both ends: it stops once there are more pages than a picker can
   * usefully show, and after a fixed number of requests, so a workspace with
   * tens of thousands of rows cannot turn opening the settings page into a
   * minutes-long walk.
   */
  async listPages(): Promise<NotionPage[]> {
    const pages: NotionPage[] = [];

    for await (const page of this.searchPages()) {
      pages.push({ id: page.id, title: pageTitle(page) });

      if (pages.length >= MAX_PARENT_PAGES) {
        break;
      }
    }

    return pages;
  }

  /**
   * Pages the integration can see that are not database rows, newest first.
   *
   * Paginated, and capped at `MAX_PAGE_SEARCHES` requests: a caller that stops
   * early pays for nothing more, and one that does not cannot walk a workspace
   * of fifty thousand rows while somebody waits for a page to load.
   */
  private async *searchPages(): AsyncGenerator<PageObjectResponse> {
    let cursor: string | undefined;

    for (let request = 0; request < MAX_PAGE_SEARCHES; request++) {
      const { results, next_cursor } = await retriable(
        this.client,
        "search",
        this.logger,
      )({
        filter: { property: "object", value: "page" },
        start_cursor: cursor,
        page_size: SEARCH_PAGE_SIZE,
      });

      for (const page of results as PageObjectResponse[]) {
        // A row is a page, but not somewhere anything can be created.
        if (page.parent?.type !== "database_id") {
          yield page;
        }
      }

      cursor = next_cursor ?? undefined;

      if (!cursor) {
        return;
      }
    }
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

  /**
   * The rows already in the database whose URL column satisfies any of
   * `matches`, each paired with the Notion page it belongs to.
   *
   * Returns the stored URL rather than just a count, because a filter is a
   * disjunction and the response never says which arm a row matched — the
   * caller maps hits back onto the items that produced them.
   *
   * This replaces a `listExistingItems` that nothing called, and could not have
   * worked if anything had: it filtered `rich_text` on what the mapping
   * guarantees is a `url` property, read `.rich_text[0].text.content` back off
   * that same property, and compared the result against bare provider ids when
   * what is stored is a full URL.
   */
  async findRowsByUrl(
    dbConfig: Config,
    matches: UrlMatch[],
  ): Promise<{ storedUrl: string; pageUrl: string }[]> {
    const found: { storedUrl: string; pageUrl: string }[] = [];

    // Notion caps the operands in a compound filter, and a search returns few
    // enough results that this is one request in practice — the batching is
    // here so a larger caller cannot silently truncate.
    for (let page = 0; page * 100 < matches.length; page++) {
      const batch = matches
        .slice(page * 100, (page + 1) * 100)
        .map((match) => ({
          property: dbConfig.url,
          url:
            match.equals !== undefined
              ? { equals: match.equals }
              : { contains: match.contains },
        }));

      if (batch.length === 0) {
        continue;
      }

      let cursor: string | undefined;

      do {
        const { results, next_cursor } = await retriable(
          this.client.databases,
          "query",
          this.logger,
        )({
          database_id: dbConfig.id,
          start_cursor: cursor,
          // A one-operand `or` is rejected, so a single match is sent bare —
          // the same shape `listDatabaseEntries` uses for its freshness clause.
          filter: (batch.length === 1 ? batch[0] : { or: batch }) as any,
        });

        for (const row of results as PageObjectResponse[]) {
          const property = Object.values(row.properties).find(
            (p) => p.id === dbConfig.url,
          ) as { url?: string | null } | undefined;

          if (property?.url) {
            found.push({ storedUrl: property.url, pageUrl: row.url });
          }
        }

        cursor = next_cursor ?? undefined;
      } while (cursor);
    }

    return found;
  }

  /**
   * The three writes a restore makes, as one object.
   *
   * Payload-in rather than a typed helper per shape, because a restore replays
   * archived Notion objects: the bodies are whatever the workspace happened to
   * contain, so any signature narrow enough to be useful would be wrong for
   * something. Bundled here so that the one place in this client where a caller
   * hands over a whole body stays visible, instead of three loose `any` methods
   * that read like an invitation.
   *
   * Retried, unlike the reads above needing it least: a restore is thousands of
   * writes in a row, which is exactly the shape Notion rate-limits.
   */
  restoreTarget(): RestoreTarget {
    return {
      createRoot: (body) => this.createRestoreRoot(body),
      createPage: async (body) => {
        const page = await retriable(
          this.client.pages,
          "create",
          this.logger,
        )(body);

        return { id: page.id, url: "url" in page ? page.url : undefined };
      },
      createDatabase: async (body) => {
        const database = await retriable(
          this.client.databases,
          "create",
          this.logger,
        )(body);

        return {
          id: database.id,
          url: "url" in database ? database.url : undefined,
        };
      },
      appendBlocks: async (parentId, children) => {
        const { results } = await retriable(
          this.client.blocks.children,
          "append",
          this.logger,
        )({ block_id: parentId, children });

        return results.map((block) => block.id);
      },
    };
  }

  /**
   * Create the page a restore is built inside, at the top level of the
   * workspace.
   *
   * A workspace parent is what "the base" means here: the page lands in the
   * user's own Private section instead of buried inside whichever page a picker
   * talked them into. Nothing else in this app can do that — a database still
   * has to be created inside a page — so a restore is the one place worth it,
   * and it is why the restore panel asks the user nothing at all.
   *
   * Notion allows it for public connections, which is what every connector here
   * is, but only from an API version that accepts the parent; the SDK still pins
   * `2022-06-28`, and an internal integration token (the restore script's
   * `--token`) is refused outright. So a rejected *parent* falls back to the
   * topmost page the integration can see rather than failing the whole restore.
   * Any other error is rethrown: a bad token or a rate limit would fail the
   * second attempt too, with a worse message.
   */
  private async createRestoreRoot(
    body: any,
  ): Promise<{ id: string; url?: string }> {
    try {
      return await this.createPageAt(
        { type: "workspace", workspace: true },
        body,
      );
    } catch (error) {
      if ((error as { status?: number })?.status !== 400) {
        throw error;
      }

      const fallback = await this.topLevelPage();

      if (!fallback) {
        throw error;
      }

      this.logger.warn("Restoring into a shared page, not the workspace root", {
        reason: String(error),
        page_id: fallback,
      });

      return await this.createPageAt(
        { type: "page_id", page_id: fallback },
        body,
      );
    }
  }

  /**
   * The page a restore falls back into: one at the top level of the workspace
   * if the integration can see one, else whatever it can see.
   *
   * Preferring a workspace-parented page keeps the fallback as close to the
   * intent as the API allows, instead of nesting a whole workspace inside some
   * arbitrary sub-page.
   */
  private async topLevelPage(): Promise<string | undefined> {
    let first: string | undefined;

    for await (const page of this.searchPages()) {
      first ??= page.id;

      if (page.parent?.type === "workspace") {
        return page.id;
      }
    }

    return first;
  }

  /** One `pages.create`, with the parent the caller chose. */
  private async createPageAt(
    parent: unknown,
    body: any,
  ): Promise<{ id: string; url?: string }> {
    // Cast: the SDK's types predate the workspace parent, and a restore hands
    // over whole archived payloads anyway.
    const page = await this.client.pages.create({ ...body, parent } as any);

    return { id: page.id, url: "url" in page ? page.url : undefined };
  }

  async updatePage(page: UpdatePageParameters): Promise<void> {
    await this.client.pages.update(page);
  }

  async createPage(page: CreatePageParameters): Promise<string | undefined> {
    const response = await this.client.pages.create(page);

    return "url" in response ? response.url : undefined;
  }
}
