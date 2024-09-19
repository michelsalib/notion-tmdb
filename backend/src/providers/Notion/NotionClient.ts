import { Client } from "@notionhq/client";
import {
  CreatePageParameters,
  DatabaseObjectResponse,
  OauthTokenResponse,
  PageObjectResponse,
  UpdatePageParameters,
} from "@notionhq/client/build/src/api-endpoints.js";
import { inject } from "inversify";
import { provide } from "inversify-binding-decorators";
import {
  NOTION_CLIENT_ID,
  NOTION_CLIENT_SECRET,
  REQUEST,
  USER,
} from "../../fx/keys.js";
import { UserData } from "../../types.js";
import { FastifyRequest } from "fastify";

@provide(AnonymousNotionClient)
export class AnonymousNotionClient {
  private readonly client: Client;

  @inject(NOTION_CLIENT_ID)
  private readonly clientId!: string;
  @inject(NOTION_CLIENT_SECRET)
  private readonly clientSecret!: string;

  constructor(@inject(REQUEST) private readonly request: FastifyRequest) {
    this.client = new Client();
  }

  async generateUserToken(): Promise<OauthTokenResponse> {
    return this.client.oauth.token({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code: (this.request.query as any)["code"] as string,
      grant_type: "authorization_code",
      redirect_uri: this.getRedirectUrl(),
    });
  }

  private getRedirectUrl() {
    const domain = this.request.host.replace(
      /notion-\w+\.localhost/,
      "localhost",
    );

    return `${this.request.protocol}://${domain}/login`;
  }
}

@provide(NotionClient)
export class NotionClient {
  private readonly client: Client;

  constructor(@inject(USER) private readonly user: UserData) {
    this.client = new Client({
      auth: this.user.notionWorkspace.accessToken,
    });
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

  async listDatabaseEntries(): Promise<PageObjectResponse[]> {
    if (!this.user.dbConfig) {
      throw "User must have configured Notion";
    }

    const { results } = await this.client.databases.query({
      database_id: this.user.dbConfig.id,
      filter: {
        and: [
          {
            property: this.user.dbConfig.url,
            url: {
              is_not_empty: true,
            },
          },
          {
            property: this.user.dbConfig.status,
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
