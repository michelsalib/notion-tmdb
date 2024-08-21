import azure from "@azure/functions";
import { Client } from "@notionhq/client";
import { CreatePageParameters, DatabaseObjectResponse, OauthTokenResponse, PageObjectResponse, UpdatePageParameters } from "@notionhq/client/build/src/api-endpoints.js";
import { inject } from "inversify";
import { provide } from "inversify-binding-decorators";
import { NOTION_CLIENT_ID, NOTION_CLIENT_SECRET, REQUEST, USER } from "../../fx/keys.js";
import { UserData } from "../../types.js";

@provide(AnonymousNotionClient)
export class AnonymousNotionClient {
    private readonly client: Client;

    @inject(NOTION_CLIENT_ID)
    private readonly clientId!: string;
    @inject(NOTION_CLIENT_SECRET)
    private readonly clientSecret!: string;

    constructor(
        @inject(REQUEST) private readonly request: azure.HttpRequest
    ) {
        this.client = new Client();
    }

    async generateUserToken(): Promise<OauthTokenResponse> {
        return this.client
            .oauth
            .token({
                client_id: this.clientId,
                client_secret: this.clientSecret,
                code: this.request.query.get('code') as string,
                grant_type: 'authorization_code',
                redirect_uri: this.request.url.split('?')[0],
            })
    }
}

@provide(NotionClient)
export class NotionClient {
    private readonly client: Client;

    constructor(
        @inject(USER) private readonly user: UserData,
    ) {
        this.client = new Client({
            auth: this.user.notionWorkspace.accessToken
        });
    }

    async listDatabases(): Promise<DatabaseObjectResponse[]> {
        if (!this.user.dbConfig) {
            throw 'User must be connected to Notion';
        }

        const { results } = await this.client
            .search({
                filter: {
                    property: 'object',
                    value: 'database'
                },
            });

        return results as any;
    }

    async listDatabaseEntries(): Promise<PageObjectResponse[]> {
        if (!this.user.dbConfig) {
            throw 'User must be connected to Notion';
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
                            equals: 'Not started',
                        }
                    }
                ]
            }
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