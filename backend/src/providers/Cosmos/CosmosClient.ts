import { Container, CosmosClient as Cosmos } from "@azure/cosmos";
import { inject } from "inversify";
import { fluentProvide } from "inversify-binding-decorators";
import {
  COSMOS_DB_ACCOUNT,
  COSMOS_DB_DATABASE,
  COSMOS_DB_KEY,
  DB_ENGINE,
  DB_PROVIDER,
  DOMAIN as DOMAIN_KEY,
  USER_ID,
} from "../../fx/keys.js";
import type { Config, DOMAIN, UserData } from "../../types.js";
import { DbProvider } from "../DbProvider.js";

@(fluentProvide(DB_PROVIDER)
  .when((r) => r.parentContext.container.get(DB_ENGINE) == "COSMOS")
  .done())
export class CosmosClient implements DbProvider {
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
      .container(
        domain == "BitwardenBackup"
          ? "bitwarden-backup"
          : `notion-${this.domain.toLowerCase()}`,
      );
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
