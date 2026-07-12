// Cosmos → Atlas migration. Reads every doc from each per-domain Cosmos
// container, strips Cosmos system fields, upserts into the corresponding
// Mongo collection, and ensures a unique index on `id`.
//
// Dry-run by default. Pass `--commit` to actually write.
//
// Required env:
//   COSMOS_ACCOUNT   — e.g. https://notion-tmdb-fr.documents.azure.com:443/
//   COSMOS_KEY       — primary key from Azure portal
//   COSMOS_DATABASE  — e.g. notion-tmdb-fr
//   MONGO_URL        — mongodb+srv://… (Atlas connection string)
//
// Usage:
//   bun support/migrateDb.ts                # dry-run, prints diffs only
//   bun support/migrateDb.ts --commit       # actually writes
//
// Re-runs are safe (upserts by `id`). The script never drops anything.

import { CosmosClient } from "@azure/cosmos";
import { MongoClient } from "mongodb";
import type { DOMAIN } from "../backend/src/types.js";

const DOMAINS: DOMAIN[] = [
  "TMDB",
  "GBook",
  "IGDB",
  "GoCardless",
  "backup",
  "BitwardenBackup",
];

function collectionName(domain: DOMAIN): string {
  return domain === "BitwardenBackup"
    ? "bitwarden-backup"
    : `notion-${domain.toLowerCase()}`;
}

function stripCosmosSystemFields(
  doc: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(doc).filter(([k]) => !k.startsWith("_")),
  );
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return v;
}

const commit = process.argv.includes("--commit");
const mode = commit ? "COMMIT" : "DRY-RUN";

const cosmos = new CosmosClient({
  endpoint: requireEnv("COSMOS_ACCOUNT"),
  key: requireEnv("COSMOS_KEY"),
}).database(requireEnv("COSMOS_DATABASE"));

const mongo = new MongoClient(requireEnv("MONGO_URL"));
await mongo.connect();
const mongoDb = mongo.db("notion-plugins");

console.log(`Mode: ${mode}\n`);

let totalRead = 0;
let totalWritten = 0;

for (const domain of DOMAINS) {
  const name = collectionName(domain);
  const cosmosContainer = cosmos.container(name);
  const mongoCollection = mongoDb.collection(name);

  let read = 0;
  let written = 0;

  for await (const batch of cosmosContainer.items
    .query("SELECT * FROM c")
    .getAsyncIterator()) {
    for (const item of batch.resources) {
      read += 1;
      const clean = stripCosmosSystemFields(item);
      const id = clean["id"];
      if (typeof id !== "string") {
        console.warn(`  ! skipping doc without string id in ${name}:`, item);
        continue;
      }
      if (commit) {
        await mongoCollection.updateOne(
          { id },
          { $set: clean },
          { upsert: true },
        );
        written += 1;
      }
    }
  }

  if (commit) {
    await mongoCollection.createIndex({ id: 1 }, { unique: true });
  }

  const mongoCount = await mongoCollection.countDocuments();
  const cosmosCount = read;

  console.log(
    `[${domain.padEnd(15)}] cosmos: ${cosmosCount.toString().padStart(4)}  ` +
      `mongo: ${mongoCount.toString().padStart(4)}  ` +
      `${commit ? `wrote: ${written}` : "(dry-run)"}`,
  );

  totalRead += read;
  totalWritten += written;
}

console.log(
  `\nTotal cosmos read: ${totalRead}` +
    (commit ? `, total mongo wrote: ${totalWritten}` : ""),
);

await mongo.close();
