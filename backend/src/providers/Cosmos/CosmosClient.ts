import { Container, CosmosClient as Cosmos } from "@azure/cosmos";
import { inject, injectable } from "tsyringe";
import {
  COSMOS_DB_ACCOUNT,
  COSMOS_DB_DATABASE,
  COSMOS_DB_KEY,
  DOMAIN as DOMAIN_KEY,
} from "../../fx/keys.js";
import type { Config, DOMAIN, UserData } from "../../types.js";
import type { DbProvider } from "../DbProvider.js";

@injectable()
export class CosmosClient implements DbProvider {
  private readonly client: Container;

  constructor(
    @inject(COSMOS_DB_ACCOUNT) cosmosAccount: string,
    @inject(COSMOS_DB_KEY) cosmosKey: string,
    @inject(COSMOS_DB_DATABASE) database: string,
    @inject(DOMAIN_KEY) private readonly domain: DOMAIN,
  ) {
    this.client = new Cosmos({
      endpoint: cosmosAccount,
      key: cosmosKey,
    })
      .database(database)
      .container(
        domain == "BitwardenBackup"
          ? "bitwarden-backup"
          : `notion-${this.domain.toLowerCase()}`,
      );
  }

  async *listConfiguredUsers(): AsyncGenerator<UserData<any>> {
    const items = this.client.items.query("SELECT * FROM c").getAsyncIterator();

    for await (const batch of items) {
      for (const item of batch.resources) {
        yield item;
      }
    }
  }

  async getUser(userId: string): Promise<UserData<any> | null> {
    const item = await this.client.item(userId, userId).read();

    return item.resource;
  }

  async putUser(userData: UserData<any>): Promise<void> {
    await this.client.items.upsert(userData);
  }

  async putUserConfig(userId: string, config: Config) {
    await this.client.item(userId, userId).patch([
      {
        op: "add",
        path: "/config",
        value: config,
      },
    ]);
  }
}
