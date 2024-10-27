import { Client } from "@notionhq/client";
import {
  BlockObjectResponse,
  CreatePageParameters,
  DatabaseObjectResponse,
  PageObjectResponse,
  UpdatePageParameters,
} from "@notionhq/client/build/src/api-endpoints.js";
import { inject } from "inversify";
import { provide } from "inversify-binding-decorators";
import { USER } from "../../fx/keys.js";
import { DbConfig, UserData } from "../../types.js";

@provide(NotionClient)
export class NotionClient {
  private readonly client: Client;

  constructor(@inject(USER) private readonly user: UserData<any>) {
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
      const result = await this.client.search({
        start_cursor: contentCursor || undefined,
      });

      for (const content of result.results) {
        yield content as DatabaseObjectResponse | PageObjectResponse;

        if (content.object == "page") {
          let blockCursor;

          // on all page blocks
          do {
            const blocks = await this.client.blocks.children.list({
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

  async listDatabaseEntries(dbConfig: DbConfig): Promise<PageObjectResponse[]> {
    const { results } = await this.client.databases.query({
      database_id: dbConfig.id,
      filter: {
        and: [
          {
            property: dbConfig.url,
            url: {
              is_not_empty: true,
            },
          },
          {
            property: dbConfig.status,
            status: {
              equals: "Not started",
            },
          },
        ],
      },
    });

    return results as PageObjectResponse[];
  }

  async updatePage(page: UpdatePageParameters): Promise<void> {
    await this.client.pages.update(page);
  }

  async createPage(page: CreatePageParameters): Promise<void> {
    await this.client.pages.create(page);
  }
}
