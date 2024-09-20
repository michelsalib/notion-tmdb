import type { FastifyReply, FastifyRequest } from "fastify";
import { Container } from "inversify";
import { buildProviderModule } from "inversify-binding-decorators";
import { CosmosClient } from "../providers/Cosmos/CosmosClient.js";
import type { DOMAIN } from "../types.js";
import {
  COSMOS_DB_ACCOUNT,
  COSMOS_DB_DATABASE,
  COSMOS_DB_KEY,
  DOMAIN as DOMAIN_KEY,
  NOTION_CLIENT_ID,
  NOTION_CLIENT_SECRET,
  NOTION_GBOOK_CLIENT_ID,
  NOTION_GBOOK_CLIENT_SECRET,
  NOTION_TMDB_CLIENT_ID,
  NOTION_TMDB_CLIENT_SECRET,
  REPLY,
  REQUEST,
  TMDB_API_KEY,
  USER,
  USER_ID,
} from "./keys.js";

// load services
import "../providers/Cosmos/CosmosClient.js";
import "../providers/GBook/GBookClient.js";
import "../providers/Notion/NotionClient.js";
import "../providers/Tmdb/TmdbClient.js";

// setup container
export const rootContainer = new Container({
  // this is to force services be instantiated once per container lifecycle (ie. HTTP request)
  defaultScope: "Singleton",
});
rootContainer.load(buildProviderModule()); // load based on decorators

export function loadEnvironmentConfig(env: {
  [key: string]: string | undefined;
}): void {
  // load config
  rootContainer
    .bind(NOTION_TMDB_CLIENT_ID)
    .toConstantValue(env["NOTION_TMDB_CLIENT_ID"]);
  rootContainer
    .bind(NOTION_TMDB_CLIENT_SECRET)
    .toConstantValue(env["NOTION_TMDB_CLIENT_SECRET"]);
  rootContainer
    .bind(NOTION_GBOOK_CLIENT_ID)
    .toConstantValue(env["NOTION_GBOOK_CLIENT_ID"]);
  rootContainer
    .bind(NOTION_GBOOK_CLIENT_SECRET)
    .toConstantValue(env["NOTION_GBOOK_CLIENT_SECRET"]);
  rootContainer.bind(TMDB_API_KEY).toConstantValue(env["TMDB_API_KEY"]);
  rootContainer
    .bind(COSMOS_DB_ACCOUNT)
    .toConstantValue(env["CosmosDb:Account"]);
  rootContainer.bind(COSMOS_DB_KEY).toConstantValue(env["CosmosDb:Key"]);
  rootContainer
    .bind(COSMOS_DB_DATABASE)
    .toConstantValue(env["CosmosDb:Database"]);
}

export async function scopeContainer(
  request: FastifyRequest,
  reply: FastifyReply,
  authenticate: boolean
): Promise<Container> {
  const container = rootContainer.createChild();
  const userId = getUserId(request);
  const domain = computeDomain(request);

  container.bind(REPLY).toConstantValue({ reply });
  container.bind(REQUEST).toConstantValue(request);
  container.bind(USER_ID).toConstantValue(userId);
  container.bind(DOMAIN_KEY).toConstantValue(domain);

  container
    .bind(NOTION_CLIENT_ID)
    .toConstantValue(NOTION_GBOOK_CLIENT_ID)
    .when(() => domain == "GBook");
  container
    .bind(NOTION_CLIENT_ID)
    .toConstantValue(NOTION_TMDB_CLIENT_ID)
    .when(() => domain == "TMDB");

  container
    .bind(NOTION_CLIENT_SECRET)
    .toConstantValue(NOTION_GBOOK_CLIENT_SECRET)
    .when(() => domain == "GBook");
  container
    .bind(NOTION_CLIENT_SECRET)
    .toConstantValue(NOTION_TMDB_CLIENT_SECRET)
    .when(() => domain == "TMDB");

  if (authenticate) {
    if (!userId) {
      throw "User must be authenticated";
    }

    const userInfo = await container.get(CosmosClient).getLoggedUser();

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
      request.headers["referer"] as string
    )?.[1] as string;
  }

  return userId;
}

function computeDomain(request: FastifyRequest): DOMAIN {
  const unlinted = /notion-(\w+)/.exec(request.hostname)?.[1];

  if (unlinted == "gbook") {
    return "GBook";
  }

  return "TMDB";
}
