import { CosmosClient } from "@azure/cosmos";
import dotenv from "dotenv";
import { MongoClient } from "mongodb";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import "reflect-metadata";
import type { DOMAIN, UserData } from "../src/types.js";

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));

const settings = await import(join(__dirname, "../local.settings.json"), {
  assert: {
    type: "json",
  },
});

const domains: DOMAIN[] = ["GBook", "TMDB", "backup", "GoCardless"];

for (const domain of domains) {
  console.log(`Copying db ${domain}`);

  const cosmoClient = new CosmosClient({
    endpoint: settings.default.Values["CosmosDb:Account"],
    key: settings.default.Values["CosmosDb:Key"],
  })
    .database(settings.default.Values["CosmosDb:Database"])
    .container(`notion-${domain.toLowerCase()}`);

  const mongoDbClient = await MongoClient.connect("mongodb://127.0.0.1:27017/");
  const mongoDbCollection = mongoDbClient
    .db(`notion-plugins`)
    .collection(`notion-${domain.toLowerCase()}`);

  await mongoDbCollection.drop();

  for await (const items of cosmoClient.items.readAll().getAsyncIterator()) {
    const itemsToInsert: Array<UserData<any>> = items.resources.map((item) => {
      return {
        id: item.id!,
        notionWorkspace: item.notionWorkspace,
        dbConfig: item.dbConfig,
      };
    });
    await mongoDbCollection.insertMany(itemsToInsert);

    console.log(`Inserted ${items.resources.length} items`);
  }

  mongoDbClient.close();
}
