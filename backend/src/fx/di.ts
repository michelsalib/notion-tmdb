import type { FastifyReply, FastifyRequest } from "fastify";
import { Container } from "inversify";
import { buildProviderModule } from "inversify-binding-decorators";
import { DbProvider } from "../providers/DbProvider.js";
import type { DOMAIN } from "../types.js";
import {
  COSMOS_DB_ACCOUNT,
  COSMOS_DB_DATABASE,
  COSMOS_DB_KEY,
  DB_ENGINE,
  STORAGE_ENGINE,
  DB_PROVIDER,
  DOMAIN as DOMAIN_KEY,
  GOCARDLESS_ID,
  GOCARDLESS_SECRET,
  NOTION_BACKUP_CLIENT_ID,
  NOTION_BACKUP_CLIENT_SECRET,
  NOTION_CLIENT_ID,
  NOTION_CLIENT_SECRET,
  NOTION_GBOOK_CLIENT_ID,
  NOTION_GBOOK_CLIENT_SECRET,
  NOTION_GOCARDLESS_CLIENT_ID,
  NOTION_GOCARDLESS_CLIENT_SECRET,
  NOTION_TMDB_CLIENT_ID,
  NOTION_TMDB_CLIENT_SECRET,
  REPLY,
  REQUEST,
  STORAGE_ACCOUNT,
  STORAGE_CONTAINER,
  STORAGE_KEY,
  TMDB_API_KEY,
  USER,
  USER_ID,
} from "./keys.js";

// load services
import "../providers/Cosmos/CosmosClient.js";
import "../providers/GBook/GBookClient.js";
import "../providers/GoCardless/GoCardlessClient.js";
import "../providers/MongoDb/MongoDbClient.js";
import "../providers/Notion/AnonymousNotionClient.js";
import "../providers/Notion/NotionClient.js";
import "../providers/Storage/AzureStorageClient.js";
import "../providers/Storage/FilesystemClient.js";
import "../providers/Tmdb/TmdbClient.js";
import "../services/Backup.js";

// setup container
export const rootContainer = new Container();
rootContainer.load(buildProviderModule()); // load based on decorators

export function loadEnvironmentConfig(env: {
  [key: string]: string | undefined;
}): void {
  // notion tmdb
  rootContainer
    .bind(NOTION_TMDB_CLIENT_ID)
    .toConstantValue(env["NOTION_TMDB_CLIENT_ID"]);
  rootContainer
    .bind(NOTION_TMDB_CLIENT_SECRET)
    .toConstantValue(env["NOTION_TMDB_CLIENT_SECRET"]);
  // notion backup
  rootContainer
    .bind(NOTION_BACKUP_CLIENT_ID)
    .toConstantValue(env["NOTION_BACKUP_CLIENT_ID"]);
  rootContainer
    .bind(NOTION_BACKUP_CLIENT_SECRET)
    .toConstantValue(env["NOTION_BACKUP_CLIENT_SECRET"]);
  // notion gbook
  rootContainer
    .bind(NOTION_GBOOK_CLIENT_ID)
    .toConstantValue(env["NOTION_GBOOK_CLIENT_ID"]);
  rootContainer
    .bind(NOTION_GBOOK_CLIENT_SECRET)
    .toConstantValue(env["NOTION_GBOOK_CLIENT_SECRET"]);
  // notion gocardless
  rootContainer
    .bind(NOTION_GOCARDLESS_CLIENT_ID)
    .toConstantValue(env["NOTION_GOCARDLESS_CLIENT_ID"]);
  rootContainer
    .bind(NOTION_GOCARDLESS_CLIENT_SECRET)
    .toConstantValue(env["NOTION_GOCARDLESS_CLIENT_SECRET"]);
  // gocardless api
  rootContainer.bind(GOCARDLESS_ID).toConstantValue(env["GOCARDLESS_ID"]);
  rootContainer
    .bind(GOCARDLESS_SECRET)
    .toConstantValue(env["GOCARDLESS_SECRET"]);
  // tmdb api
  rootContainer.bind(TMDB_API_KEY).toConstantValue(env["TMDB_API_KEY"]);
  // db
  rootContainer
    .bind(COSMOS_DB_ACCOUNT)
    .toConstantValue(env["CosmosDb:Account"]);
  rootContainer.bind(COSMOS_DB_KEY).toConstantValue(env["CosmosDb:Key"]);
  rootContainer
    .bind(COSMOS_DB_DATABASE)
    .toConstantValue(env["CosmosDb:Database"]);
  // storage
  rootContainer.bind(STORAGE_ACCOUNT).toConstantValue(env["Storage:Account"]);
  rootContainer.bind(STORAGE_KEY).toConstantValue(env["Storage:Key"]);
  rootContainer
    .bind(STORAGE_CONTAINER)
    .toConstantValue(env["Storage:Container"]);
  rootContainer.bind(DB_ENGINE).toConstantValue(env["DB_ENGINE"]);
  rootContainer.bind(STORAGE_ENGINE).toConstantValue(env["STORAGE_ENGINE"]);

  rootContainer
    .bind(NOTION_CLIENT_ID)
    .toDynamicValue((ctx) => ctx.container.get(NOTION_GBOOK_CLIENT_ID))
    .when(
      (ctx) => ctx.parentContext.container.get<DOMAIN>(DOMAIN_KEY) == "GBook",
    );
  rootContainer
    .bind(NOTION_CLIENT_ID)
    .toDynamicValue((ctx) => ctx.container.get(NOTION_TMDB_CLIENT_ID))
    .when(
      (ctx) => ctx.parentContext.container.get<DOMAIN>(DOMAIN_KEY) == "TMDB",
    );
  rootContainer
    .bind(NOTION_CLIENT_ID)
    .toDynamicValue((ctx) => ctx.container.get(NOTION_BACKUP_CLIENT_ID))
    .when(
      (ctx) => ctx.parentContext.container.get<DOMAIN>(DOMAIN_KEY) == "backup",
    );
  rootContainer
    .bind(NOTION_CLIENT_ID)
    .toDynamicValue((ctx) => ctx.container.get(NOTION_GOCARDLESS_CLIENT_ID))
    .when(
      (ctx) =>
        ctx.parentContext.container.get<DOMAIN>(DOMAIN_KEY) == "GoCardless",
    );

  rootContainer
    .bind(NOTION_CLIENT_SECRET)
    .toDynamicValue((ctx) => ctx.container.get(NOTION_GBOOK_CLIENT_SECRET))
    .when(
      (ctx) => ctx.parentContext.container.get<DOMAIN>(DOMAIN_KEY) == "GBook",
    );
  rootContainer
    .bind(NOTION_CLIENT_SECRET)
    .toDynamicValue((ctx) => ctx.container.get(NOTION_TMDB_CLIENT_SECRET))
    .when(
      (ctx) => ctx.parentContext.container.get<DOMAIN>(DOMAIN_KEY) == "TMDB",
    );
  rootContainer
    .bind(NOTION_CLIENT_SECRET)
    .toDynamicValue((ctx) => ctx.container.get(NOTION_BACKUP_CLIENT_SECRET))
    .when(
      (ctx) => ctx.parentContext.container.get<DOMAIN>(DOMAIN_KEY) == "backup",
    );
  rootContainer
    .bind(NOTION_CLIENT_SECRET)
    .toDynamicValue((ctx) => ctx.container.get(NOTION_GOCARDLESS_CLIENT_SECRET))
    .when(
      (ctx) =>
        ctx.parentContext.container.get<DOMAIN>(DOMAIN_KEY) == "GoCardless",
    );
}

export async function scopeContainer(
  request: FastifyRequest,
  reply: FastifyReply,
  authenticate: boolean,
): Promise<Container> {
  const container = rootContainer.createChild({
    // this is to force services be instantiated once per container lifecycle (ie. HTTP request)
    defaultScope: "Singleton",
  });
  const userId = getUserId(request);
  const domain = computeDomain(request);

  container.bind(REPLY).toConstantValue({ reply });
  container.bind(REQUEST).toConstantValue(request);
  container.bind(USER_ID).toConstantValue(userId);
  container.bind(DOMAIN_KEY).toConstantValue(domain);

  if (authenticate) {
    if (!userId) {
      throw "User must be authenticated";
    }

    const userInfo = await container
      .get<DbProvider>(DB_PROVIDER)
      .getLoggedUser();

    if (!userInfo) {
      throw "Unknown user";
    }

    container.bind(USER).toConstantValue(userInfo);
  }

  return container;
}

function getUserId(request: FastifyRequest): string {
  let userId = request.cookies["userId"];

  if (!userId) {
    userId = /userId=([\w-]*)/.exec(
      request.headers["referer"] as string,
    )?.[1] as string;
  }

  return userId;
}

function computeDomain(request: FastifyRequest): DOMAIN {
  const unlinted = /notion-(\w+)/.exec(request.hostname)?.[1];

  if (unlinted == "gbook") {
    return "GBook";
  }

  if (unlinted == "backup") {
    return "backup";
  }

  if (unlinted == "gocardless") {
    return "GoCardless";
  }

  return "TMDB";
}
