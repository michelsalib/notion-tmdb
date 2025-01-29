import { inject } from "inversify";
import { fluentProvide } from "inversify-binding-decorators";
import { Collection, MongoClient } from "mongodb";
import { DB_ENGINE, DB_PROVIDER, DOMAIN as DOMAIN_KEY } from "../../fx/keys.js";
import type { Config, DOMAIN, UserData } from "../../types.js";
import { DbProvider } from "../DbProvider.js";

@(fluentProvide(DB_PROVIDER)
  .when((r) => r.parentContext.container.get(DB_ENGINE) == "MONGO")
  .done())
export class MongoDbClient implements DbProvider {
  constructor(@inject(DOMAIN_KEY) private readonly domain: DOMAIN) {}
  async *listConfiguredUsers(): AsyncGenerator<UserData<any>> {
    const collection = await this.getUserCollection();
    const cursor = collection.find({
      config: {
        $exists: true,
      },
    });

    do {
      const user = await cursor.next();

      if (user) {
        yield user;
      }
    } while (await cursor.hasNext());
  }

  private async getUserCollection(): Promise<Collection<UserData<any>>> {
    const client = await MongoClient.connect("mongodb://127.0.0.1:27017/");

    const db = client.db(`notion-plugins`);

    return db.collection(`notion-${this.domain.toLowerCase()}`);
  }

  async getUser(userId: string): Promise<UserData<any>> {
    const collection = await this.getUserCollection();

    const user = await collection.findOne({
      id: userId,
    });

    if (!user) {
      throw "user not found";
    }

    return user;
  }

  async putUser(userData: UserData<any>): Promise<void> {
    const collection = await this.getUserCollection();

    await collection.updateOne(
      {
        id: userData.id,
      },
      {
        $set: userData,
      },
      {
        upsert: true,
      },
    );
  }

  async putUserConfig(userId: string, config: Config): Promise<void> {
    const collection = await this.getUserCollection();

    await collection.updateOne(
      {
        id: userId,
      },
      {
        $set: {
          config,
        },
      },
    );
  }
}
