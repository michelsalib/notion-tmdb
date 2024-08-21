import { Container, CosmosClient as Cosmos } from "@azure/cosmos";
import { inject } from "inversify";
import { provide } from "inversify-binding-decorators";
import { COSMOS_DB_ACCOUNT, COSMOS_DB_KEY, USER_ID } from "../../fx/keys.js";
import { DbConfig, UserData } from "../../types.js";

@provide(CosmosClient)
export class CosmosClient {
    private readonly client: Container;

    constructor(
        @inject(COSMOS_DB_ACCOUNT) cosmosAccount: string,
        @inject(COSMOS_DB_KEY) cosmosKey: string,
        @inject(USER_ID) private readonly userId: string,
    ) {
        this.client = new Cosmos({
            endpoint: cosmosAccount,
            key: cosmosKey,
        })
            .database('notion-tmdb-europe-north')
            .container('notion-tmdb-europe-north')
    }

    async getUser(userId: string): Promise<UserData> {
        const item = await this.client.item(userId, userId).read();

        return item.resource;
    }

    async getLoggedUser(): Promise<UserData> {
        return await this.getUser(this.userId);
    }

    async putUser(userData: UserData): Promise<void> {
        await this.client.items.upsert(userData);
    }

    async putUserConfig(userId: string, dbConfig: DbConfig) {
        await this.client.item(userId, userId)
            .patch([
                {
                    op: 'add',
                    path: '/dbConfig',
                    value: dbConfig,
                },
            ]);
    }
}
