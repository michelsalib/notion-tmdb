import { Collection, MongoClient } from "mongodb";
import { inject, injectable } from "tsyringe";
import { DOMAIN as DOMAIN_KEY } from "../../fx/keys.js";
import type { Config, DOMAIN, UserData } from "../../types.js";
import type { DbProvider } from "../DbProvider.js";

@injectable()
export class MongoDbClient implements DbProvider {
  constructor(
    @inject(DOMAIN_KEY) private readonly domain: DOMAIN,
    @inject(MongoClient) private readonly client: MongoClient,
  ) {}

  async *listConfiguredUsers(): AsyncGenerator<UserData<any>> {
    const collection = this.getUserCollection();
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

  private getUserCollection(): Collection<UserData<any>> {
    // BitwardenBackup uses the literal `bitwarden-backup` collection name to
    // match the historical Cosmos collection (see Cosmos copyDb + migrateDb).
    const name =
      this.domain === "BitwardenBackup"
        ? "bitwarden-backup"
        : `notion-${this.domain.toLowerCase()}`;
    return this.client.db("notion-plugins").collection(name);
  }

  async getUser(userId: string): Promise<UserData<any> | null> {
    return this.getUserCollection().findOne({ id: userId });
  }

  async putUser(userData: UserData<any>): Promise<void> {
    await this.getUserCollection().updateOne(
      { id: userData.id },
      { $set: userData },
      { upsert: true },
    );
  }

  async putUserConfig(userId: string, config: Config): Promise<void> {
    await this.getUserCollection().updateOne(
      { id: userId },
      { $set: { config } },
    );
  }
}
