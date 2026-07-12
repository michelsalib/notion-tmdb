import { MongoClient } from "mongodb";
import {
  container,
  DependencyContainer,
  instanceCachingFactory,
} from "tsyringe";
import { BitwardenBackup } from "../providers/BitwardenBackup/BitwardenBackup.js";
import { CosmosClient } from "../providers/Cosmos/CosmosClient.js";
import type { DbProvider } from "../providers/DbProvider.js";
import { GBookClient } from "../providers/GBook/GBookClient.js";
import { GoCardlessClient } from "../providers/GoCardless/GoCardlessClient.js";
import { IgdbClient } from "../providers/Igdb/IgdbClient.js";
import { MongoDbClient } from "../providers/MongoDb/MongoDbClient.js";
import { NotionBackup } from "../providers/NotionBackup/NotionBackup.js";
import { AzureStorageClient } from "../providers/Storage/AzureStorageClient.js";
import { FilesystemStorage } from "../providers/Storage/FilesystemClient.js";
import { GcsStorageClient } from "../providers/Storage/GcsStorageClient.js";
import { TmdbClient } from "../providers/Tmdb/TmdbClient.js";
import type { DOMAIN } from "../types.js";
import {
  COSMOS_DB_ACCOUNT,
  COSMOS_DB_DATABASE,
  COSMOS_DB_KEY,
  DATA_PROVIDER,
  DB_ENGINE,
  DB_PROVIDER,
  DOMAIN as DOMAIN_KEY,
  GCP_PROJECT_ID,
  GOCARDLESS_ID,
  GOCARDLESS_SECRET,
  IGDB_CLIENT_ID,
  IGDB_CLIENT_SECRET,
  LOGGER,
  LOGGER_ENGINE,
  MONGO_URL,
  NOTION_BACKUP_CLIENT_ID,
  NOTION_BACKUP_CLIENT_SECRET,
  NOTION_CLIENT_ID,
  NOTION_CLIENT_SECRET,
  NOTION_GBOOK_CLIENT_ID,
  NOTION_GBOOK_CLIENT_SECRET,
  NOTION_GOCARDLESS_CLIENT_ID,
  NOTION_GOCARDLESS_CLIENT_SECRET,
  NOTION_IGDB_CLIENT_ID,
  NOTION_IGDB_CLIENT_SECRET,
  NOTION_TMDB_CLIENT_ID,
  NOTION_TMDB_CLIENT_SECRET,
  REPLY,
  REQUEST,
  STORAGE_ACCOUNT,
  STORAGE_BUCKET,
  STORAGE_CONTAINER,
  STORAGE_ENDPOINT,
  STORAGE_ENGINE,
  STORAGE_KEY,
  STORAGE_PROVIDER,
  TMDB_API_KEY,
  USER,
  USER_ID,
} from "./keys.js";
import { AzureContextLogger } from "./logger/AzureContextLogger.js";
import { ConsoleLogger } from "./logger/ConsoleLogger.js";
import { GcpLogger } from "./logger/GcpLogger.js";
import type { ScopedReply, ScopedRequest } from "./router.js";

export const rootContainer: DependencyContainer = container;

export function loadEnvironmentConfig(env: {
  [key: string]: string | undefined;
}): void {
  // useFactory (not useValue) because tsyringe's isValueProvider does
  // `useValue != undefined`, so a value of undefined is silently treated as
  // "no provider" and crashes when resolved. Env values can be undefined
  // (unset secret), so funnel all of them through useFactory.
  const bind = (token: symbol, value: string | undefined): void => {
    rootContainer.register(token as any, { useFactory: () => value });
  };

  // notion oauth per distro
  bind(NOTION_TMDB_CLIENT_ID, env["NOTION_TMDB_CLIENT_ID"]);
  bind(NOTION_TMDB_CLIENT_SECRET, env["NOTION_TMDB_CLIENT_SECRET"]);
  bind(NOTION_IGDB_CLIENT_ID, env["NOTION_IGDB_CLIENT_ID"]);
  bind(NOTION_IGDB_CLIENT_SECRET, env["NOTION_IGDB_CLIENT_SECRET"]);
  bind(NOTION_BACKUP_CLIENT_ID, env["NOTION_BACKUP_CLIENT_ID"]);
  bind(NOTION_BACKUP_CLIENT_SECRET, env["NOTION_BACKUP_CLIENT_SECRET"]);
  bind(NOTION_GBOOK_CLIENT_ID, env["NOTION_GBOOK_CLIENT_ID"]);
  bind(NOTION_GBOOK_CLIENT_SECRET, env["NOTION_GBOOK_CLIENT_SECRET"]);
  bind(NOTION_GOCARDLESS_CLIENT_ID, env["NOTION_GOCARDLESS_CLIENT_ID"]);
  bind(NOTION_GOCARDLESS_CLIENT_SECRET, env["NOTION_GOCARDLESS_CLIENT_SECRET"]);

  // third-party API keys
  bind(GOCARDLESS_ID, env["GOCARDLESS_ID"]);
  bind(GOCARDLESS_SECRET, env["GOCARDLESS_SECRET"]);
  bind(TMDB_API_KEY, env["TMDB_API_KEY"]);
  bind(IGDB_CLIENT_ID, env["IGDB_CLIENT_ID"]);
  bind(IGDB_CLIENT_SECRET, env["IGDB_CLIENT_SECRET"]);

  // legacy Azure/Cosmos config (kept registered for now; consumers go away in Phase 10)
  bind(COSMOS_DB_ACCOUNT, env["CosmosDb:Account"]);
  bind(COSMOS_DB_KEY, env["CosmosDb:Key"]);
  bind(COSMOS_DB_DATABASE, env["CosmosDb:Database"]);
  bind(STORAGE_ACCOUNT, env["Storage:Account"]);
  bind(STORAGE_KEY, env["Storage:Key"]);
  bind(STORAGE_CONTAINER, env["Storage:Container"]);

  // GCS config
  bind(STORAGE_BUCKET, env["STORAGE_BUCKET"]);
  bind(GCP_PROJECT_ID, env["GCP_PROJECT_ID"]);
  bind(STORAGE_ENDPOINT, env["STORAGE_ENDPOINT"]);

  // Mongo connection (singleton — Atlas M0 caps at 500 conns; per-method
  // MongoClient.connect() would burn through them fast).
  bind(MONGO_URL, env["MONGO_URL"]);
  rootContainer.register(MongoClient, {
    useFactory: instanceCachingFactory(
      (c) => new MongoClient(c.resolve<string>(MONGO_URL)),
    ),
  });

  // engine selector values (still resolvable in case any code reads them directly)
  bind(DB_ENGINE, env["DB_ENGINE"]);
  bind(STORAGE_ENGINE, env["STORAGE_ENGINE"]);
  bind(LOGGER_ENGINE, env["LOGGER_ENGINE"]);

  // env-driven implementation dispatch
  switch (env["DB_ENGINE"]) {
    case "MONGO":
      rootContainer.register(DB_PROVIDER, { useClass: MongoDbClient });
      break;
    case "COSMOS":
      rootContainer.register(DB_PROVIDER, { useClass: CosmosClient });
      break;
    default:
      throw new Error(`Unknown DB_ENGINE: ${env["DB_ENGINE"]}`);
  }

  switch (env["STORAGE_ENGINE"]) {
    case "FILESYSTEM":
      rootContainer.register(STORAGE_PROVIDER, { useClass: FilesystemStorage });
      break;
    case "AZURE":
      rootContainer.register(STORAGE_PROVIDER, {
        useClass: AzureStorageClient,
      });
      break;
    case "GCS":
      rootContainer.register(STORAGE_PROVIDER, { useClass: GcsStorageClient });
      break;
    default:
      throw new Error(`Unknown STORAGE_ENGINE: ${env["STORAGE_ENGINE"]}`);
  }

  switch (env["LOGGER_ENGINE"]) {
    case "CONSOLE":
      rootContainer.register(LOGGER, { useClass: ConsoleLogger });
      break;
    case "GCP":
      rootContainer.register(LOGGER, { useClass: GcpLogger });
      break;
    case "AZURE_CONTEXT":
      rootContainer.register(LOGGER, { useClass: AzureContextLogger });
      break;
    default:
      throw new Error(`Unknown LOGGER_ENGINE: ${env["LOGGER_ENGINE"]}`);
  }

  // DOMAIN-driven NOTION_CLIENT_ID/SECRET dispatch (resolved per-request from child container)
  rootContainer.register(NOTION_CLIENT_ID, {
    useFactory: (c) => {
      const domain = c.resolve<DOMAIN>(DOMAIN_KEY);
      switch (domain) {
        case "TMDB":
          return c.resolve(NOTION_TMDB_CLIENT_ID);
        case "IGDB":
          return c.resolve(NOTION_IGDB_CLIENT_ID);
        case "GBook":
          return c.resolve(NOTION_GBOOK_CLIENT_ID);
        case "backup":
          return c.resolve(NOTION_BACKUP_CLIENT_ID);
        case "GoCardless":
          return c.resolve(NOTION_GOCARDLESS_CLIENT_ID);
        default:
          throw new Error(`No NOTION_CLIENT_ID for domain ${domain}`);
      }
    },
  });
  rootContainer.register(NOTION_CLIENT_SECRET, {
    useFactory: (c) => {
      const domain = c.resolve<DOMAIN>(DOMAIN_KEY);
      switch (domain) {
        case "TMDB":
          return c.resolve(NOTION_TMDB_CLIENT_SECRET);
        case "IGDB":
          return c.resolve(NOTION_IGDB_CLIENT_SECRET);
        case "GBook":
          return c.resolve(NOTION_GBOOK_CLIENT_SECRET);
        case "backup":
          return c.resolve(NOTION_BACKUP_CLIENT_SECRET);
        case "GoCardless":
          return c.resolve(NOTION_GOCARDLESS_CLIENT_SECRET);
        default:
          throw new Error(`No NOTION_CLIENT_SECRET for domain ${domain}`);
      }
    },
  });

  // DOMAIN-driven DATA_PROVIDER dispatch
  rootContainer.register(DATA_PROVIDER, {
    useFactory: (c) => {
      const domain = c.resolve<DOMAIN>(DOMAIN_KEY);
      switch (domain) {
        case "TMDB":
          return c.resolve(TmdbClient);
        case "GBook":
          return c.resolve(GBookClient);
        case "IGDB":
          return c.resolve(IgdbClient);
        case "GoCardless":
          return c.resolve(GoCardlessClient);
        case "BitwardenBackup":
          return c.resolve(BitwardenBackup);
        case "backup":
          return c.resolve(NotionBackup);
        default:
          throw new Error(`No DATA_PROVIDER for domain ${domain}`);
      }
    },
  });
}

export async function unScopedContainer(
  domain: DOMAIN,
): Promise<DependencyContainer> {
  const child = rootContainer.createChildContainer();
  child.register(DOMAIN_KEY, { useValue: domain });
  return child;
}

export async function userIdContainer(
  userId: string,
  domain: DOMAIN,
): Promise<DependencyContainer> {
  const child = rootContainer.createChildContainer();
  child.register(USER_ID, { useValue: userId });
  child.register(DOMAIN_KEY, { useValue: domain });
  await loadUser(child);
  return child;
}

export async function scopeContainer(
  request: ScopedRequest,
  reply: ScopedReply,
  authenticate: boolean,
): Promise<DependencyContainer> {
  const child = rootContainer.createChildContainer();
  const userId = getUserId(request);
  const domain = computeDomain(request);

  child.register(REPLY, { useValue: { reply } });
  child.register(REQUEST, { useValue: request });
  // useFactory (not useValue) because tsyringe's isValueProvider does
  // `useValue != undefined`, so a value of undefined is silently treated as
  // "no provider" and crashes with "TypeInfo not known for undefined".
  child.register(USER_ID, { useFactory: () => userId });
  child.register(DOMAIN_KEY, { useValue: domain });

  if (authenticate) {
    if (!userId) {
      throw new Error("User must be authenticated");
    }
    await loadUser(child);
  }

  return child;
}

async function loadUser(c: DependencyContainer): Promise<void> {
  const userId = c.resolve<string>(USER_ID);
  const userInfo = await c.resolve<DbProvider>(DB_PROVIDER).getUser(userId);

  if (!userInfo) {
    throw new Error("Unknown user");
  }

  c.register(USER, { useValue: userInfo });
}

function getUserId(request: ScopedRequest): string {
  let userId = request.cookies["userId"];

  if (!userId) {
    userId = /userId=([\w-]*)/.exec(
      request.headers["referer"] ?? "",
    )?.[1] as string;
  }

  return userId;
}

const HOSTNAME_DOMAIN: Record<string, DOMAIN> = {
  "notion-tmdb": "TMDB",
  "notion-gbook": "GBook",
  "notion-igdb": "IGDB",
  "notion-backup": "backup",
  "notion-gocardless": "GoCardless",
  "bitwarden-backup": "BitwardenBackup",
};

const STATE_DOMAIN: Record<string, DOMAIN> = {
  tmdb: "TMDB",
  gbook: "GBook",
  igdb: "IGDB",
  backup: "backup",
  gocardless: "GoCardless",
  bitwardenbackup: "BitwardenBackup",
};

function computeDomain(request: ScopedRequest): DOMAIN {
  const state = (request.query as any)?.["state"]?.toLowerCase();
  if (state && STATE_DOMAIN[state]) {
    return STATE_DOMAIN[state];
  }

  const subdomain = request.hostname.split(".")[0];
  if (HOSTNAME_DOMAIN[subdomain]) {
    return HOSTNAME_DOMAIN[subdomain];
  }

  // Fallback for raw Cloud Run URL / bare localhost: read DOMAIN env, else TMDB.
  return (process.env["DOMAIN"] as DOMAIN | undefined) ?? "TMDB";
}
