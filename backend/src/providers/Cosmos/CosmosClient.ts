import { Container, CosmosClient as Cosmos } from "@azure/cosmos";
import { inject } from "inversify";
import { provide } from "inversify-binding-decorators";
import {
  COSMOS_DB_ACCOUNT,
  COSMOS_DB_DATABASE,
  COSMOS_DB_KEY,
  USER_ID,
  DOMAIN as DOMAIN_KEY,
} from "../../fx/keys.js";
import { DbConfig, DOMAIN, UserData } from "../../types.js";

@provide(CosmosClient)
export class CosmosClient {
  private readonly client: Container;

  constructor(
    @inject(COSMOS_DB_ACCOUNT) cosmosAccount: string,
    @inject(COSMOS_DB_KEY) cosmosKey: string,
    @inject(COSMOS_DB_DATABASE) database: string,
    @inject(USER_ID) private readonly userId: string,
    @inject(DOMAIN_KEY) private readonly domain: DOMAIN,
  ) {
    this.client = new Cosmos({
      endpoint: cosmosAccount,
      key: cosmosKey,
    })
      .database(database)
      .container(`notion-${this.domain.toLowerCase()}`);
  }

  async getUser(userId: string): Promise<UserData<any>> {
    const item = await this.client.item(userId, userId).read();

    return item.resource;
  }

  async getLoggedUser(): Promise<UserData<any>> {
    return await this.getUser(this.userId);
  }

  async putUser(userData: UserData<any>): Promise<void> {
    await this.client.items.upsert(userData);
  }

  async putUserConfig(userId: string, dbConfig: DbConfig) {
    await this.client.item(userId, userId).patch([
      {
        op: "add",
        path: "/dbConfig",
        value: dbConfig,
      },
    ]);
  }
}
